import ts from 'typescript';
import { classifyUse, outermostWrapper } from './classify';
import { QUERY_HOOKS, declaredName, guardPointIds } from './hooks';
import { calleeDeclaration, calleeOf, namedDeclaration, paramRefOf } from './wrappers';
import type { Wrapper } from './wrappers';
import { pkgForFile, relFile } from '../discovery/workspace';
import { makeDiagnostic } from '../model/diagnostics';
import type { Consumer, Diagnostic, QuerySite, UseSite } from '../model/types';
import {
  constInitializer,
  declKey,
  declLoc,
  extensionTypeIds,
  isExtensionGeneric,
  locOf,
  resolveAlias,
  unwrapExpression,
} from '../programs/identity';
import type { Collector, ProgramCtx } from '../programs/stream';

export type SitesInput = {
  /** Every declared extension point ID. */
  pointIds: Set<string>;
  /** Repo-relative files that declare an extension point or a guard. */
  pointFiles: Set<string>;
  /** The wrappers `resolveWrappers` found, by declaration key. */
  wrappers: Map<string, Wrapper[]>;
  /** Carried type declaration keys and the points that carry them (filled by a later task). */
  carried: Map<string, string[]>;
};

export type SitesResult = {
  consumers: Consumer[];
  querySites: QuerySite[];
  useSites: UseSite[];
  /** Declaration key → where it is rendered or called (one hop up). */
  refs: Map<string, Consumer['renderedIn']>;
  /** `Consumer.id` → the declaration key of the consumer's symbol (none for `<module>`). */
  consumerKeys: Map<string, string>;
  diagnostics: Diagnostic[];
};

/** Array methods that take a predicate and select elements by it. */
const FILTER_METHODS: ReadonlySet<string> = new Set([
  'filter',
  'find',
  'some',
  'every',
  'findIndex',
]);

/** The symbol name used for code at the top level of a module. */
const MODULE_SYMBOL = '<module>';

/** Equality operators a `type` comparison may use. */
const EQUALITY_OPERATORS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

/**
 * True when an expression reads `.type` from an extension: a receiver that is the SDK's generic
 * `Extension` (an open `type`), or one whose `type` names known points. A type parameter stands
 * for its constraint.
 */
const isExtensionTypeRead = (
  expr: ts.Expression,
  checker: ts.TypeChecker,
  known: ReadonlySet<string>,
): boolean => {
  const node = unwrapExpression(expr);
  if (!ts.isPropertyAccessExpression(node) || node.name.text !== 'type') {
    return false;
  }
  let receiver = checker.getNonNullableType(checker.getTypeAtLocation(node.expression));
  if (receiver.isTypeParameter()) {
    receiver = checker.getBaseConstraintOfType(receiver) ?? receiver;
  }
  return (
    isExtensionGeneric(receiver, checker) ||
    (extensionTypeIds(receiver, checker)?.some((id) => known.has(id)) ?? false)
  );
};

/**
 * The string an expression is proven to hold, and the literal that writes it when that literal is
 * the expression itself: a string literal, a `const` whose initializer resolves (followed as
 * `constInitializer` allows), or an enum member with a string value.
 */
const provenString = (
  expr: ts.Expression,
  checker: ts.TypeChecker,
  depth = 0,
): { value: string; literal?: ts.Node } | undefined => {
  const node = unwrapExpression(expr);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { value: node.text, literal: node };
  }
  if (depth > 4 || (!ts.isIdentifier(node) && !ts.isPropertyAccessExpression(node))) {
    return undefined;
  }
  const symbol = checker.getSymbolAtLocation(ts.isIdentifier(node) ? node : node.name);
  const target = symbol ? resolveAlias(checker, symbol) : undefined;
  const member = target?.declarations?.find(ts.isEnumMember);
  if (member) {
    const value = checker.getConstantValue(member);
    return typeof value === 'string' ? { value } : undefined;
  }
  const followed = constInitializer(target, checker);
  const value = followed ? provenString(followed.initializer, checker, depth + 1) : undefined;
  return value ? { value: value.value } : undefined;
};

/** A short, single-line rendering of a callee for a message. */
const calleeText = (site: ts.CallExpression | ts.JsxOpeningLikeElement): string => {
  const text = (ts.isCallExpression(site) ? site.expression : site.tagName)
    .getText()
    .replace(/\s+/g, ' ');
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
};

/** True when a call is an array method that selects elements with a predicate. */
const isArrayFilter = (site: ts.CallExpression, checker: ts.TypeChecker): boolean => {
  const callee = site.expression;
  if (!ts.isPropertyAccessExpression(callee) || !FILTER_METHODS.has(callee.name.text)) {
    return false;
  }
  const receiver = checker.getNonNullableType(checker.getTypeAtLocation(callee.expression));
  return checker.isArrayType(receiver) || checker.isTupleType(receiver);
};

/**
 * The consumer a node belongs to: the nearest enclosing named function declaration,
 * variable-declared arrow or function expression, method (`Class.method` in a class) or class.
 * Code at the top level of a module belongs to `<module>`.
 */
const enclosingSymbol = (
  node: ts.Node,
  checker: ts.TypeChecker,
): { symbol: string; decl?: ts.Node } => {
  for (let current = node.parent; !ts.isSourceFile(current); current = current.parent) {
    const named =
      ts.isClassDeclaration(current) && current.name ? current : namedDeclaration(current, checker);
    const name = named ? declaredName(named) : undefined;
    if (!named || name === undefined) {
      continue;
    }
    const owner = named.parent;
    const inClass =
      (ts.isMethodDeclaration(named) || ts.isPropertyDeclaration(named)) &&
      ts.isClassLike(owner) &&
      owner.name;
    return { symbol: inClass ? `${owner.name.text}.${name}` : name, decl: named };
  }
  return { symbol: MODULE_SYMBOL };
};

/** True when a string literal is written in a type, not in code that runs. */
const inTypePosition = (node: ts.Node): boolean =>
  ts.findAncestor(node.parent, (ancestor) =>
    ts.isSourceFile(ancestor) || ts.isStatement(ancestor)
      ? 'quit'
      : ts.isTypeNode(ancestor) && !ts.isExpressionWithTypeArguments(ancestor),
  ) !== undefined;

/** The name of a property in an object literal, when it is written as a plain name or string. */
const propertyName = (prop: ts.ObjectLiteralElementLike): string | undefined =>
  prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
    ? prop.name.text
    : undefined;

/**
 * True when a node sits inside an extension object literal: one with a `properties` property and
 * a `type` whose value the checker proves is a known point ID, or, when `type` is not written
 * (it comes from a spread), whose own type names a known point.
 */
const inExtensionLiteral = (
  node: ts.Node,
  checker: ts.TypeChecker,
  known: ReadonlySet<string>,
): boolean =>
  ts.findAncestor(node.parent, (ancestor) => {
    if (!ts.isObjectLiteralExpression(ancestor)) {
      return false;
    }
    const names = ancestor.properties.map(propertyName);
    const type = ancestor.properties.find(
      (prop): prop is ts.PropertyAssignment =>
        ts.isPropertyAssignment(prop) && propertyName(prop) === 'type',
    );
    if (!names.includes('properties')) {
      return false;
    }
    if (!type) {
      // `{ ...base, properties: { … } }`: the `type` comes from the spread, so read it off the
      // literal's own type.
      const ids = extensionTypeIds(checker.getTypeAtLocation(ancestor), checker);
      return ids?.some((id) => known.has(id)) ?? false;
    }
    const idType = checker.getTypeAtLocation(type.initializer);
    return idType.isStringLiteral() && known.has(idType.value);
  }) !== undefined;

/** Declarations a reference index entry may point at: what a consumer symbol can be. */
const isReferenceable = (decl: ts.Node): boolean =>
  ts.isFunctionDeclaration(decl) ||
  ts.isVariableDeclaration(decl) ||
  ts.isMethodDeclaration(decl) ||
  ts.isPropertyDeclaration(decl) ||
  ts.isClassDeclaration(decl);

/** True when a declaration sits in this repository's own sources, not in an installed package. */
const isRepoSource = (decl: ts.Node, repoRoot: string): boolean => {
  const { fileName } = decl.getSourceFile();
  return !fileName.includes('/node_modules/') && !relFile(repoRoot, fileName).startsWith('..');
};

/** True when every declaration of a member comes from TypeScript's default library. */
const isLibraryMember = (name: ts.Node, ctx: ProgramCtx): boolean => {
  const decls = ctx.checker.getSymbolAtLocation(name)?.declarations ?? [];
  return (
    decls.length > 0 &&
    decls.every((decl) => ctx.program.isSourceFileDefaultLibrary(decl.getSourceFile()))
  );
};

/**
 * The property chain read from an extension's `properties`, from that access outwards: each
 * further property (or string-keyed element) read from the previous one, stopping before a member
 * of TypeScript's default library (`.length`, `.map`), which belongs to the value's type and not
 * to the extension.
 */
const propertyChain = (
  start: ts.PropertyAccessExpression,
  ctx: ProgramCtx,
): { outer: ts.Expression; path: string[] } => {
  let outer: ts.Expression = start;
  const path = ['properties'];
  for (;;) {
    const wrapped = outermostWrapper(outer);
    const next = wrapped.parent;
    if (ts.isPropertyAccessExpression(next) && next.expression === wrapped) {
      if (isLibraryMember(next.name, ctx)) {
        break;
      }
      path.push(next.name.text);
      outer = next;
    } else if (
      ts.isElementAccessExpression(next) &&
      next.expression === wrapped &&
      ts.isStringLiteralLike(next.argumentExpression)
    ) {
      path.push(next.argumentExpression.text);
      outer = next;
    } else {
      return { outer, path };
    }
  }
  return { outer, path };
};

/**
 * Pass B: where code queries extensions. Every call argument and JSX attribute whose type is a
 * guard (see `guardPointIds`) is classified by the callee that receives it: a query hook or a
 * wrapper makes a query site, an array method a filter use, and anything else is reported as
 * `guard-unknown-callee`. A guard a wrapper receives and forwards is not a site of its own, and
 * a call that returns the guard it was given (`React.useCallback`) passes it on to be classified
 * where its result goes. String literals naming a known point outside the point's own files and
 * outside extension declarations are reported as `point-id-literal`.
 */
export const sitesCollector = (input: SitesInput): Collector<SitesResult> => {
  const { pointIds: known, pointFiles, wrappers } = input;
  const consumers = new Map<string, Consumer>();
  const querySites: QuerySite[] = [];
  const useSites: UseSite[] = [];
  const diagnostics: Diagnostic[] = [];
  const refs = new Map<string, Consumer['renderedIn']>();
  const consumerKeys = new Map<string, string>();

  const visitFile = (file: ts.SourceFile, ctx: ProgramCtx): void => {
    const { checker } = ctx;
    const rel = relFile(ctx.repoRoot, file.fileName);
    const pkg = pkgForFile(rel, ctx.ws) ?? pkgForFile(relFile(ctx.repoRoot, ctx.dir), ctx.ws);
    const isPointFile = pointFiles.has(rel);

    const consumerOf = (node: ts.Node): string => {
      const { symbol, decl } = enclosingSymbol(node, checker);
      const id = `${rel}#${symbol}`;
      if (!consumers.has(id) && pkg !== undefined) {
        if (decl) {
          consumerKeys.set(id, declKey(decl, ctx));
        }
        consumers.set(id, {
          id,
          pkg,
          symbol,
          loc: decl ? declLoc(decl, ctx) : { file: rel, line: 1 },
          renderedIn: [],
        });
      }
      return id;
    };

    const classify = (
      expr: ts.Expression,
      site: ts.CallExpression | ts.JsxOpeningLikeElement,
      param: number | string,
    ): void => {
      const ids = guardPointIds(expr, ctx, known);
      // A call that hands the guard back (`React.useCallback(guard, deps)`) is not where it is
      // consumed: its result is classified where it is passed.
      // Documented limit: any call returning a guard swallows its guard arguments, so a combinator
      // returning a different guard hides its input, and a result never passed on is dropped.
      if (!ids || (ts.isCallExpression(site) && guardPointIds(site, ctx, known))) {
        return;
      }
      const unknown = ids.filter((id) => !known.has(id));
      const pointIds = ids.filter((id) => known.has(id));
      if (unknown.length > 0) {
        diagnostics.push(
          makeDiagnostic(
            'query-unknown-point',
            `A guard selects ${unknown
              .map((id) => `'${id}'`)
              .join(', ')}, which no extension point declares.`,
            locOf(expr, ctx),
            pkg,
          ),
        );
      }
      if (pointIds.length === 0) {
        return;
      }
      // A wrapper's own guard parameter, passed on: the query site is the wrapper's caller.
      const ref = paramRefOf(expr, checker);
      const owner = ref ? namedDeclaration(ref.fn, checker) : undefined;
      if (
        ref &&
        owner &&
        (wrappers.get(declKey(owner, ctx)) ?? []).some((w) => w.param === ref.param)
      ) {
        return;
      }
      const target = calleeOf(site, ctx);
      const loc = locOf(site, ctx);
      if (target && typeof target.callee !== 'string' && param === 0) {
        const { hook } = target.callee;
        querySites.push({
          consumer: consumerOf(site),
          pointIds,
          hook,
          resolved: QUERY_HOOKS.some((entry) => entry.name === hook && entry.resolved),
          loc,
          provenance: 'type-resolved',
        });
        return;
      }
      const viaWrapper =
        target && typeof target.callee === 'string'
          ? (wrappers.get(target.callee) ?? []).filter((w) => w.param === param)
          : [];
      if (viaWrapper.length > 0) {
        viaWrapper.forEach((wrapper) =>
          querySites.push({
            consumer: consumerOf(site),
            pointIds,
            hook: wrapper.hook,
            wrapper: wrapper.name,
            resolved: wrapper.resolved,
            loc,
            provenance: 'type-resolved',
          }),
        );
        return;
      }
      if (ts.isCallExpression(site) && isArrayFilter(site, checker)) {
        pointIds.forEach((pointId) =>
          useSites.push({
            consumer: consumerOf(site),
            pointId,
            path: 'type',
            kind: 'filter',
            direct: true,
            ...(pointIds.length > 1 ? { oneOf: pointIds } : {}),
            loc,
            provenance: 'type-resolved',
          }),
        );
        return;
      }
      diagnostics.push(
        makeDiagnostic(
          'guard-unknown-callee',
          `A guard for ${pointIds.map((id) => `'${id}'`).join(', ')} is passed to '${calleeText(
            site,
          )}', which is not a query hook, a known wrapper or an array method.`,
          locOf(expr, ctx),
          pkg,
        ),
      );
    };

    /** Literals a `type-check` use already accounts for; they are not `point-id-literal`s. */
    const explained = new Set<ts.Node>();

    /**
     * A comparison of an extension's `type` with a constant that names a known point. Guard
     * bodies in point files are the point's own definition, not a use.
     */
    const checkTypeComparison = (
      site: ts.Node,
      read: ts.Expression,
      other: ts.Expression,
    ): void => {
      if (isPointFile || !isExtensionTypeRead(read, checker, known)) {
        return;
      }
      const proven = provenString(other, checker);
      if (!proven || !known.has(proven.value)) {
        return;
      }
      if (proven.literal) {
        explained.add(proven.literal);
      }
      useSites.push({
        consumer: consumerOf(site),
        pointId: proven.value,
        path: 'type',
        kind: 'type-check',
        direct: true,
        loc: locOf(site, ctx),
        provenance: 'type-resolved',
      });
    };

    const checkLiteral = (node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral): void => {
      if (
        isPointFile ||
        explained.has(node) ||
        !known.has(node.text) ||
        inTypePosition(node) ||
        inExtensionLiteral(node, checker, known)
      ) {
        return;
      }
      diagnostics.push(
        makeDiagnostic(
          'point-id-literal',
          `The string '${node.text}' names an extension point outside its declaration and outside an extension.`,
          locOf(node, ctx),
          pkg,
        ),
      );
    };

    /**
     * Uses of an extension's properties: a `.properties` read on a value whose type names known
     * points, followed outwards as far as the chain goes. A chain ending in an object
     * destructuring gives one use per destructured name. Reads inside extension declarations are
     * not uses, and a receiver whose `type` is not literal (a generic helper) names no point.
     */
    const checkPropertyUse = (node: ts.PropertyAccessExpression): void => {
      if (ts.isJsxClosingElement(outermostWrapper(node).parent)) {
        return;
      }
      const receiver = checker.getNonNullableType(checker.getTypeAtLocation(node.expression));
      const pointIds = (extensionTypeIds(receiver, checker) ?? []).filter((id) => known.has(id));
      if (pointIds.length === 0 || inExtensionLiteral(node, checker, known)) {
        return;
      }
      const { outer, path } = propertyChain(node, ctx);
      const consumer = consumerOf(outer);
      const record = (segments: string[], kind: UseSite['kind'], at: ts.Node): void =>
        pointIds.forEach((pointId) =>
          useSites.push({
            consumer,
            pointId,
            path: segments.join('.'),
            kind,
            direct: true,
            ...(pointIds.length > 1 ? { oneOf: pointIds } : {}),
            loc: locOf(at, ctx),
            provenance: 'type-resolved',
          }),
        );
      const holder = outermostWrapper(outer).parent;
      if (
        ts.isVariableDeclaration(holder) &&
        ts.isObjectBindingPattern(holder.name) &&
        holder.initializer !== undefined &&
        outermostWrapper(holder.initializer) === outermostWrapper(outer)
      ) {
        holder.name.elements.forEach((element) => {
          const key = element.propertyName ?? element.name;
          if (element.dotDotDotToken || !ts.isIdentifier(key)) {
            record(path, 'read', element);
            return;
          }
          if (!ts.isIdentifier(element.name)) {
            // A nested pattern (`{ field: { a, b } }`) reads the field; deeper names are not followed.
            record([...path, key.text], 'read', element);
            return;
          }
          record([...path, key.text], classifyUse(outer, ctx, element.name), element);
        });
        return;
      }
      record(path, classifyUse(outer, ctx), outer);
    };

    /** One-hop reference index: a JSX tag or call that invokes a declaration in the repo. */
    const recordReference = (node: ts.CallExpression | ts.JsxOpeningLikeElement): void => {
      const decl = calleeDeclaration(node, checker);
      if (!decl || !isReferenceable(decl) || !isRepoSource(decl, ctx.repoRoot)) {
        return;
      }
      const key = declKey(decl, ctx);
      const found = refs.get(key) ?? [];
      found.push({
        symbol: enclosingSymbol(node, checker).symbol,
        loc: locOf(node, ctx),
        how: ts.isCallExpression(node) ? 'call' : 'jsx',
      });
      refs.set(key, found);
    };

    // Documented limit: only direct call arguments and JSX attributes are seen; a guard nested
    // in an object-literal argument (`foo({ predicate: isX })`) is neither classified nor reported.
    const walk = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        recordReference(node);
        node.arguments.forEach((arg, index) => classify(arg, node, index));
      } else if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        recordReference(node);
      } else if (ts.isPropertyAccessExpression(node) && node.name.text === 'properties') {
        checkPropertyUse(node);
      } else if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
        const value = node.initializer;
        if (value && ts.isJsxExpression(value) && value.expression) {
          classify(value.expression, node.parent.parent, node.name.text);
        }
      } else if (ts.isBinaryExpression(node) && EQUALITY_OPERATORS.has(node.operatorToken.kind)) {
        checkTypeComparison(node, node.left, node.right);
        checkTypeComparison(node, node.right, node.left);
      } else if (ts.isCaseClause(node)) {
        checkTypeComparison(node, node.parent.parent.expression, node.expression);
      } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        checkLiteral(node);
      }
      node.forEachChild(walk);
    };
    walk(file);
  };

  return {
    visit: (ctx) => ctx.ownedFiles.forEach((file) => visitFile(file, ctx)),
    finish: () => ({
      consumers: [...consumers.values()],
      querySites,
      useSites,
      refs,
      consumerKeys,
      diagnostics,
    }),
  };
};
