import ts from 'typescript';
import { readDoc } from './jsdoc';
import type { Collector, ProgramCtx } from '../programs/stream';
import {
  declKey,
  extensionTypeIds,
  isStringLiteralType,
  locOf,
  resolveAlias,
} from '../programs/identity';
import { pkgForFile, toRelPosix } from '../discovery/workspace';
import { makeDiagnostic } from '../model/diagnostics';
import type { Diagnostic, ExtensionPoint, Guard, WorkspacePackage } from '../model/types';

/**
 * Pass A extraction of extension points, guards and point JSDoc (spec §5.4).
 *
 * A point is an exported type alias or interface in an owned file whose own
 * declaration directly references the SDK `Extension` (alias body,
 * intersection member, or interface heritage clause) with a first type
 * argument the checker resolves to a single string literal — so
 * `Extension<typeof CONST, …>` works, and specializations and unions of other
 * points are not points. Guards are recognized by their call signature's type
 * predicate narrowing to a type with a string-literal `type` property, never
 * by name. Everything retained is plain data (keys, `Loc`s, strings): no AST,
 * type or symbol outlives the program that produced it.
 */

/** Pass A result: points, guards and their diagnostics, joined across programs. */
export type PointsResult = {
  points: ExtensionPoint[];
  guards: Guard[];
  diagnostics: Diagnostic[];
};

/** The SDK `Extension` type arguments a point declaration references. */
type SdkExtensionRef = { typeArguments: readonly ts.TypeNode[] };

/** The SDK package, recognized by declaration-file path, not by name text. */
const SDK_PACKAGE_DIR = '/@openshift/dynamic-plugin-sdk/';

const isSdkFile = (fileName: string): boolean =>
  fileName.split(/[\\/]/).join('/').includes(SDK_PACKAGE_DIR);

const isExported = (node: ts.Node): boolean => {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }
  return node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword) ?? false;
};

const isSdkDeclaration = (node: ts.Declaration): boolean =>
  isSdkFile(node.getSourceFile().fileName);

/**
 * The SDK `Extension` reference at `nameNode`, when its resolved declaration
 * lives inside `@openshift/dynamic-plugin-sdk`.
 */
const namedSdkExtensionRef = (
  nameNode: ts.Node,
  typeArguments: readonly ts.TypeNode[] | undefined,
  ctx: ProgramCtx,
): SdkExtensionRef | undefined => {
  const symbol = ctx.checker.getSymbolAtLocation(nameNode);
  if (symbol === undefined) {
    return undefined;
  }
  const resolved = resolveAlias(ctx.checker, symbol);
  const declaration = resolved.declarations?.[0];
  if (declaration === undefined || !isSdkDeclaration(declaration)) {
    return undefined;
  }
  return { typeArguments: typeArguments ?? [] };
};

const typeNodeSdkExtensionRef = (node: ts.TypeNode, ctx: ProgramCtx): SdkExtensionRef | undefined =>
  ts.isTypeReferenceNode(node)
    ? namedSdkExtensionRef(node.typeName, node.typeArguments, ctx)
    : undefined;

/**
 * The SDK `Extension` reference directly on the point declaration: the alias
 * body, an intersection member, or an interface heritage clause. Unions of
 * other points yield nothing, which is what excludes them.
 */
const sdkExtensionRefOf = (
  declaration: ts.TypeAliasDeclaration | ts.InterfaceDeclaration,
  ctx: ProgramCtx,
): SdkExtensionRef | undefined => {
  if (ts.isTypeAliasDeclaration(declaration)) {
    const body = declaration.type;
    if (ts.isIntersectionTypeNode(body)) {
      for (const member of body.types) {
        const found = typeNodeSdkExtensionRef(member, ctx);
        if (found !== undefined) {
          return found;
        }
      }
      return undefined;
    }
    return typeNodeSdkExtensionRef(body, ctx);
  }
  for (const clause of declaration.heritageClauses ?? []) {
    for (const heritageType of clause.types) {
      const found = namedSdkExtensionRef(heritageType.expression, heritageType.typeArguments, ctx);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
};

/** The single string-literal value the checker resolves `node` to. */
const literalValueOf = (node: ts.TypeNode, ctx: ProgramCtx): string | undefined => {
  const type = ctx.checker.getTypeAtLocation(node);
  return isStringLiteralType(type) ? type.value : undefined;
};

/** Whether the alias is `CodeRef` / `ComponentCodeRef` from the SDK or plugin-core. */
const isCodeRefAliasOwner = (aliasSymbol: ts.Symbol, ctx: ProgramCtx): boolean =>
  (aliasSymbol.declarations ?? []).some((declaration) => {
    const { fileName } = declaration.getSourceFile();
    return (
      isSdkFile(fileName) || toRelPosix(ctx.repoRoot, fileName).startsWith('packages/plugin-core/')
    );
  });

/** The inner type's symbol when it is a named type (not an anonymous `__type`). */
const namedSymbolOf = (type: ts.Type): ts.Symbol | undefined => {
  const symbol = type.getSymbol();
  return symbol !== undefined && symbol.name !== '__type' ? symbol : undefined;
};

/**
 * The properties of the point's second `Extension` type argument, in declared
 * order: name, optionality, declared type text, JSDoc, and `codeRef` with the
 * inner type (plus its declaration keys, recorded for Task 11's carried types).
 */
const propertiesOf = (node: ts.TypeNode, ctx: ProgramCtx): ExtensionPoint['properties'] => {
  const type = ctx.checker.getTypeAtLocation(node);
  const properties: ExtensionPoint['properties'] = [];
  for (const symbol of ctx.checker.getPropertiesOfType(type)) {
    const declaration = symbol.declarations?.find(ts.isPropertySignature);
    // The written type node keeps alias information (`CodeRef<X>`) that the
    // symbol's type would lose to a `| undefined` union on optional properties.
    const declaredType =
      declaration?.type !== undefined
        ? ctx.checker.getTypeAtLocation(declaration.type)
        : ctx.checker.getTypeOfSymbol(symbol);
    const property: ExtensionPoint['properties'][number] = {
      name: symbol.name,
      optional: (symbol.flags & ts.SymbolFlags.Optional) !== 0,
      typeText: ctx.checker.typeToString(declaredType),
    };
    const doc = ts.displayPartsToString(symbol.getDocumentationComment(ctx.checker)).trim();
    if (doc !== '') {
      property.doc = doc;
    }
    const { aliasSymbol } = declaredType;
    if (
      aliasSymbol !== undefined &&
      (aliasSymbol.name === 'CodeRef' || aliasSymbol.name === 'ComponentCodeRef') &&
      isCodeRefAliasOwner(aliasSymbol, ctx)
    ) {
      const inner = declaredType.aliasTypeArguments?.[0];
      property.codeRef = {
        inner: inner === undefined ? 'unknown' : ctx.checker.typeToString(inner),
      };
      // Only named inner types (aliases, interfaces) carry a joinable
      // declaration identity; anonymous type literals (`__type`) do not.
      const innerSymbol =
        inner === undefined ? undefined : inner.aliasSymbol ?? namedSymbolOf(inner);
      const keys = innerSymbol?.declarations?.map((d) => declKey(d, ctx)) ?? [];
      if (keys.length > 0) {
        property.innerDeclKeys = keys;
      }
    }
    properties.push(property);
  }
  return properties;
};

/** The expression subtree whose `.type === …` comparisons belong to the guard. */
const guardScanRoot = (
  declaration: ts.FunctionDeclaration | ts.VariableDeclaration,
): ts.Node | undefined =>
  ts.isFunctionDeclaration(declaration) ? declaration.body : declaration.initializer;

const isTypePropertyAccess = (expression: ts.Expression): boolean =>
  ts.isPropertyAccessExpression(expression) && expression.name.text === 'type';

/**
 * String-literal values positively equated with `.type` anywhere in `root`.
 * Only `===` counts: an exclusion (`!==`) cannot prove that a literal
 * disagrees with the predicate, so it is never cross-checked.
 */
const comparisonLiterals = (root: ts.Node | undefined, ctx: ProgramCtx): string[] => {
  const found: string[] = [];
  if (root === undefined) {
    return found;
  }
  const walk = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    ) {
      const candidate = isTypePropertyAccess(node.left)
        ? node.right
        : isTypePropertyAccess(node.right)
        ? node.left
        : undefined;
      const type = candidate === undefined ? undefined : ctx.checker.getTypeAtLocation(candidate);
      if (type !== undefined && isStringLiteralType(type)) {
        found.push(type.value);
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(root);
  return found;
};

/** String-literal values among a factory call's arguments. */
const argumentLiterals = (call: ts.CallExpression, ctx: ProgramCtx): string[] =>
  call.arguments.flatMap((argument) => {
    const type = ctx.checker.getTypeAtLocation(argument);
    return isStringLiteralType(type) ? [type.value] : [];
  });

/**
 * Collects extension points, guards and their JSDoc across the streamed
 * programs. `finish` joins the per-program data by point id and declaration
 * keys, links guards to points, and reports the gap diagnostics.
 */
export const pointsCollector = (): Collector<PointsResult> => {
  const points: ExtensionPoint[] = [];
  const guards: Guard[] = [];
  const diagnostics: Diagnostic[] = [];
  // The workspace array is shared by every program of the run (runPass passes
  // one instance); remembered so finish can attribute diagnostics by file.
  let ws: WorkspacePackage[] = [];

  const visitPointDeclaration = (
    declaration: ts.TypeAliasDeclaration | ts.InterfaceDeclaration,
    ctx: ProgramCtx,
  ): void => {
    const ref = sdkExtensionRefOf(declaration, ctx);
    if (ref === undefined || ref.typeArguments.length === 0) {
      return;
    }
    const id = literalValueOf(ref.typeArguments[0], ctx);
    if (id === undefined) {
      return;
    }
    const loc = locOf(declaration, ctx);
    const { doc, diagnostics: docDiagnostics } = readDoc(declaration, ctx.checker);
    for (const diagnostic of docDiagnostics) {
      diagnostics.push({ ...diagnostic, loc });
    }
    points.push({
      id,
      pkg: pkgForFile(loc.file, ctx.ws) ?? '',
      typeName: declaration.name.text,
      loc,
      typeParams: declaration.typeParameters?.map((tp) => tp.name.text) ?? [],
      guards: [],
      doc,
      properties: ref.typeArguments.length > 1 ? propertiesOf(ref.typeArguments[1], ctx) : [],
    });
  };

  /** Records the guard and reports literals disagreeing with the predicate's ids. */
  const recordGuard = (
    name: string,
    style: Guard['style'],
    ids: string[],
    declaration: ts.FunctionDeclaration | ts.VariableDeclaration,
    ctx: ProgramCtx,
  ): void => {
    const loc = locOf(declaration, ctx);
    const initializer = ts.isVariableDeclaration(declaration) ? declaration.initializer : undefined;
    const literals =
      initializer !== undefined && ts.isCallExpression(initializer)
        ? argumentLiterals(initializer, ctx)
        : comparisonLiterals(guardScanRoot(declaration), ctx);
    for (const literal of [...new Set(literals)]) {
      if (!ids.includes(literal)) {
        diagnostics.push(
          makeDiagnostic(
            'guard-literal-mismatch',
            `guard '${name}' compares extension type '${literal}' but its predicate selects ${ids.join(
              ', ',
            )}`,
            loc,
            pkgForFile(loc.file, ctx.ws),
          ),
        );
      }
    }
    guards.push({ name, loc, style, pointIds: [...new Set(ids)] });
  };

  const visitGuardDeclaration = (
    declaration: ts.FunctionDeclaration | ts.VariableDeclaration,
    ctx: ProgramCtx,
  ): void => {
    const { name } = declaration;
    if (name === undefined || !ts.isIdentifier(name)) {
      return;
    }
    const symbol = ctx.checker.getSymbolAtLocation(name);
    if (symbol === undefined) {
      return;
    }
    const initializer = ts.isVariableDeclaration(declaration) ? declaration.initializer : undefined;
    const type = ctx.checker.getTypeOfSymbol(symbol);
    for (const signature of type.getCallSignatures()) {
      const predicate = ctx.checker.getTypePredicateOfSignature(signature);
      if (predicate !== undefined && predicate.kind === ts.TypePredicateKind.Identifier) {
        const ids = extensionTypeIds(predicate.type, ctx.checker);
        if (ids !== undefined) {
          const style: Guard['style'] =
            initializer !== undefined && ts.isCallExpression(initializer) ? 'factory' : 'inline';
          recordGuard(name.text, style, ids, declaration, ctx);
          return;
        }
      }
      for (const inner of signature.getReturnType().getCallSignatures()) {
        const innerPredicate = ctx.checker.getTypePredicateOfSignature(inner);
        if (
          innerPredicate !== undefined &&
          innerPredicate.kind === ts.TypePredicateKind.Identifier
        ) {
          const ids = extensionTypeIds(innerPredicate.type, ctx.checker);
          if (ids !== undefined) {
            recordGuard(name.text, 'parameterized', ids, declaration, ctx);
            return;
          }
        }
      }
    }
  };

  const finish = (): PointsResult => {
    const knownIds = new Set(points.map((p) => p.id));

    for (const guard of guards) {
      for (const id of guard.pointIds) {
        for (const point of points) {
          if (point.id === id && !point.guards.includes(guard.name)) {
            point.guards.push(guard.name);
          }
        }
      }
    }

    const byId = new Map<string, ExtensionPoint[]>();
    for (const point of points) {
      byId.set(point.id, [...(byId.get(point.id) ?? []), point]);
    }
    for (const [id, group] of byId) {
      // Both declarations are kept and both stay linked; the report is per
      // extra declaration.
      for (const duplicate of group.slice(1)) {
        diagnostics.push(
          makeDiagnostic(
            'point-duplicate-id',
            `extension point id '${id}' is declared ${group.length} times, including '${duplicate.typeName}'`,
            duplicate.loc,
            duplicate.pkg,
          ),
        );
      }
    }

    for (const point of points) {
      if (point.doc.summary === undefined) {
        diagnostics.push(
          makeDiagnostic(
            'point-no-jsdoc',
            `extension point '${point.id}' (${point.typeName}) has no JSDoc summary`,
            point.loc,
            point.pkg,
          ),
        );
      }
      if (point.guards.length === 0) {
        diagnostics.push(
          makeDiagnostic(
            'point-no-guard',
            `extension point '${point.id}' (${point.typeName}) has no type guard`,
            point.loc,
            point.pkg,
          ),
        );
      }
    }

    for (const guard of guards) {
      if (!guard.pointIds.some((id) => knownIds.has(id))) {
        diagnostics.push(
          makeDiagnostic(
            'guard-no-point',
            `guard '${guard.name}' selects ${guard.pointIds.join(
              ', ',
            )}, which names no declared extension point`,
            guard.loc,
            pkgForFile(guard.loc.file, ws),
          ),
        );
      }
    }

    return { points, guards, diagnostics };
  };

  const visit = (ctx: ProgramCtx): void => {
    ws = ctx.ws;
    for (const file of ctx.ownedFiles) {
      for (const statement of file.statements) {
        if (!isExported(statement)) {
          continue;
        }
        if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
          visitPointDeclaration(statement, ctx);
        } else if (ts.isFunctionDeclaration(statement)) {
          visitGuardDeclaration(statement, ctx);
        } else if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            visitGuardDeclaration(declaration, ctx);
          }
        }
      }
    }
  };

  return { visit, finish };
};
