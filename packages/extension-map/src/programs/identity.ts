import ts from 'typescript';
import { mapMfTypesDecl, reportStaleMfTypes } from './mfTypes';
import type { ProgramCtx } from './stream';
import { relFile } from '../discovery/workspace';
import type { Loc } from '../model/types';

/**
 * The cross-program identity of a declaration that carries no ID literal of its own:
 * `<repo-relative file>:<start position>`. A declaration reached through a committed `@mf-types`
 * copy gets the key of the source declaration it was generated from, so that a reference through
 * a copy and a reference to the source join. A copy that no longer matches its source keeps its
 * own key and is reported as `stale-mf-types`; callers that write keys into the model should
 * treat such a reference as unresolved instead.
 */
export const declKey = (node: ts.Node, ctx: ProgramCtx): string => {
  const mapped = mapMfTypesDecl(node, ctx);
  if (mapped) {
    if (!('stale' in mapped)) {
      return mapped.key;
    }
    reportStaleMfTypes(mapped.stale, node, ctx);
  }
  const file = node.getSourceFile();
  return `${relFile(ctx.repoRoot, file.fileName)}:${node.getStart(file)}`;
};

/** The 1-based line range a node spans. `endLine` is omitted for a single-line node. */
export const locOf = (node: ts.Node, ctx: ProgramCtx): Loc => {
  const file = node.getSourceFile();
  const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const endLine = file.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  return {
    file: relFile(ctx.repoRoot, file.fileName),
    line,
    ...(endLine > line ? { endLine } : {}),
  };
};

/**
 * Where a declaration is shown: the source declaration for one reached through a committed
 * `@mf-types` copy, so a generated copy is never linked to, and `locOf` for everything else.
 */
export const declLoc = (node: ts.Node, ctx: ProgramCtx): Loc => {
  const mapped = mapMfTypesDecl(node, ctx);
  return mapped && !('stale' in mapped) ? mapped.loc : locOf(node, ctx);
};

/**
 * Everything `satisfies`, `as`, `as const`, a type assertion, a non-null assertion and
 * parentheses wrap, down to the expression that carries the value.
 */
export const unwrapExpression = (expr: ts.Expression): ts.Expression => {
  let current = expr;
  for (;;) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current)
    ) {
      current = current.expression;
    } else {
      return current;
    }
  }
};

/** Array methods that change the array they are called on. */
const MUTATING_METHODS: ReadonlySet<string> = new Set([
  'push',
  'unshift',
  'pop',
  'shift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
]);

/** `Object` helpers that change their first argument. */
const OBJECT_MUTATORS: ReadonlySet<string> = new Set([
  'assign',
  'defineProperty',
  'defineProperties',
  'setPrototypeOf',
]);

const isAssignment = (kind: ts.SyntaxKind): boolean =>
  kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;

/** The expression a property or element access chain reads from, however deep the chain. */
const accessRoot = (expr: ts.Expression): ts.Expression | undefined => {
  let current = unwrapExpression(expr);
  if (!ts.isPropertyAccessExpression(current) && !ts.isElementAccessExpression(current)) {
    return undefined;
  }
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    current = unwrapExpression(current.expression);
  }
  return current;
};

/**
 * True when the declaring file changes the thing a binding holds after declaring it: an array
 * method that mutates, an assignment or `delete` through the binding, or an `Object` helper that
 * writes into it. Mutation from another file is not detected, which is an accepted limit: a value
 * the tool cannot see changed would be reported as declared.
 */
const isMutatedInFile = (symbol: ts.Symbol, checker: ts.TypeChecker): boolean => {
  const file = symbol.declarations?.[0]?.getSourceFile();
  if (!file) {
    return false;
  }
  const isBinding = (expr: ts.Expression | undefined): boolean => {
    if (!expr) {
      return false;
    }
    const node = unwrapExpression(expr);
    if (!ts.isIdentifier(node)) {
      return false;
    }
    const found = checker.getSymbolAtLocation(node);
    return found !== undefined && resolveAlias(checker, found) === symbol;
  };
  let mutated = false;
  const walk = (node: ts.Node): void => {
    if (mutated) {
      return;
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const callee = node.expression;
      const method = callee.name.text;
      if (MUTATING_METHODS.has(method) && isBinding(callee.expression)) {
        mutated = true;
        return;
      }
      const owner = unwrapExpression(callee.expression);
      if (
        OBJECT_MUTATORS.has(method) &&
        ts.isIdentifier(owner) &&
        owner.text === 'Object' &&
        isBinding(node.arguments[0])
      ) {
        mutated = true;
        return;
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      isAssignment(node.operatorToken.kind) &&
      isBinding(accessRoot(node.left))
    ) {
      mutated = true;
      return;
    }
    if (ts.isDeleteExpression(node) && isBinding(accessRoot(node.expression))) {
      mutated = true;
      return;
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken) &&
      isBinding(accessRoot(node.operand))
    ) {
      mutated = true;
      return;
    }
    node.forEachChild(walk);
  };
  walk(file);
  return mutated;
};

/** True when a variable declaration is part of a `const` declaration list. */
const isConstDeclaration = (node: ts.Node): node is ts.VariableDeclaration =>
  ts.isVariableDeclaration(node) &&
  ts.isVariableDeclarationList(node.parent) &&
  (node.parent.flags & ts.NodeFlags.Const) !== 0;

/**
 * The `const` declaration of a symbol, whatever its initializer and whether or not its file
 * mutates what it holds. Use `constInitializer` to read the value; this only says what it is.
 */
export const constDeclaration = (
  symbol: ts.Symbol | undefined,
): ts.VariableDeclaration | undefined => symbol?.declarations?.find(isConstDeclaration);

/**
 * The name of the `const` whose initializer is this expression, once `as`, `satisfies`,
 * type assertions, non-null assertions and parentheses around it are set aside. `undefined` for
 * an expression written anywhere else (inline in an array, returned from a callback, assigned to
 * a `let`), or bound by destructuring.
 */
export const constBindingName = (expr: ts.Expression): string | undefined => {
  let current: ts.Node = expr;
  while (
    ts.isParenthesizedExpression(current.parent) ||
    ts.isAsExpression(current.parent) ||
    ts.isSatisfiesExpression(current.parent) ||
    ts.isTypeAssertionExpression(current.parent) ||
    ts.isNonNullExpression(current.parent)
  ) {
    current = current.parent;
  }
  const { parent } = current;
  return isConstDeclaration(parent) &&
    parent.initializer === current &&
    ts.isIdentifier(parent.name)
    ? parent.name.text
    : undefined;
};

/** True when an initializer is written `as const`. */
const isAsConst = (expr: ts.Expression): boolean =>
  ts.isAsExpression(expr) &&
  ts.isTypeReferenceNode(expr.type) &&
  ts.isIdentifier(expr.type.typeName) &&
  expr.type.typeName.text === 'const';

/** True when the type of a binding says its contents cannot change. */
const isReadonlyType = (symbol: ts.Symbol, checker: ts.TypeChecker): boolean =>
  checker.typeToString(checker.getTypeOfSymbol(symbol)).startsWith('readonly ');

/**
 * The initializer of the `const` a symbol declares, when the value it holds can be trusted to be
 * the one written there: `let` and `var` are never followed (they can be reassigned), and a
 * `const` holding an array or object literal is not followed when its own file mutates it in
 * place. An `as const` initializer, or a readonly type, skips the mutation scan.
 */
export const constInitializer = (
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
): { decl: ts.VariableDeclaration; initializer: ts.Expression } | undefined => {
  const decl = constDeclaration(symbol);
  const { initializer } = decl ?? {};
  if (!decl || !initializer || !symbol) {
    return undefined;
  }
  const unwrapped = unwrapExpression(initializer);
  const holdsMembers =
    ts.isArrayLiteralExpression(unwrapped) || ts.isObjectLiteralExpression(unwrapped);
  if (
    holdsMembers &&
    !isAsConst(initializer) &&
    !isReadonlyType(symbol, checker) &&
    isMutatedInFile(symbol, checker)
  ) {
    return undefined;
  }
  return { decl, initializer };
};

/** Follows import/export aliases to the symbol that actually declares the thing. */
export const resolveAlias = (checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol => {
  let current = symbol;
  const seen = new Set<ts.Symbol>();
  while ((current.flags & ts.SymbolFlags.Alias) !== 0 && !seen.has(current)) {
    seen.add(current);
    const next = checker.getAliasedSymbol(current);
    if (next === current) {
      break;
    }
    current = next;
  }
  return current;
};

/**
 * The extension point ID(s) a type names, read from the type and not from the syntax: the
 * string-literal value(s) of its `type` property, when it also has a `properties` property.
 * `undefined` when either property is absent or the `type` property is not all string literals
 * (a plain `string`, say). Each ID appears once, sorted, however many union members name it.
 * Callers unwrap `| undefined | null` and array element types first.
 */
export const extensionTypeIds = (type: ts.Type, checker: ts.TypeChecker): string[] | undefined => {
  const typeProperty = type.getProperty('type');
  if (!typeProperty || !type.getProperty('properties')) {
    return undefined;
  }
  const idType = checker.getTypeOfSymbol(typeProperty);
  const parts = idType.isUnion() ? idType.types : [idType];
  const ids = parts.flatMap((part) => (part.isStringLiteral() ? [part.value] : []));
  return ids.length === parts.length && ids.length > 0 ? [...new Set(ids)].toSorted() : undefined;
};

/** True when a type is extension-shaped with an open `type`, i.e. the SDK's `Extension` itself. */
const isExtensionGeneric = (type: ts.Type, checker: ts.TypeChecker): boolean => {
  const typeProperty = type.getProperty('type');
  if (!typeProperty || !type.getProperty('properties')) {
    return false;
  }
  return (checker.getTypeOfSymbol(typeProperty).flags & ts.TypeFlags.String) !== 0;
};

/** What a type predicate narrows to, and what it narrows *from*. */
export type PredicateInfo = {
  /** The `extensionTypeIds` of the predicate's target type. */
  targetIds: string[];
  /** True when the narrowed parameter is the SDK's generic extension type (`type: string`). */
  paramGeneric: boolean;
  /** The `extensionTypeIds` of the narrowed parameter, when it names them as literals. */
  paramIds?: string[];
};

/**
 * Reads the type predicate of the first call signature of `type` that narrows to an
 * extension-shaped target. The narrowed parameter is reported too: a predicate over the SDK's
 * `Extension` is an extension guard, while one over some other union that happens to carry
 * `type` and `properties` is not, and only its caller can tell the two apart.
 */
export const predicateInfo = (
  type: ts.Type,
  checker: ts.TypeChecker,
): PredicateInfo | undefined => {
  for (const signature of type.getCallSignatures()) {
    const predicate = checker.getTypePredicateOfSignature(signature);
    const targetIds = predicate?.type ? extensionTypeIds(predicate.type, checker) : undefined;
    if (!predicate || !targetIds) {
      continue;
    }
    const index = 'parameterIndex' in predicate ? predicate.parameterIndex : undefined;
    const parameter = index === undefined ? undefined : signature.getParameters()[index];
    const paramType = parameter ? checker.getTypeOfSymbol(parameter) : undefined;
    const paramIds = paramType ? extensionTypeIds(paramType, checker) : undefined;
    return {
      targetIds,
      paramGeneric: paramType !== undefined && isExtensionGeneric(paramType, checker),
      ...(paramIds ? { paramIds } : {}),
    };
  }
  return undefined;
};

/** The extension point ID(s) a type predicate narrows to; see `predicateInfo`. */
export const predicateTargetIds = (type: ts.Type, checker: ts.TypeChecker): string[] | undefined =>
  predicateInfo(type, checker)?.targetIds;
