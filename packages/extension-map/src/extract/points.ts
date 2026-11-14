import ts from 'typescript';
import { isEmptyDoc, readDoc } from './jsdoc';
import { pkgForFile, relFile, toPosix } from '../discovery/workspace';
import { makeDiagnostic } from '../model/diagnostics';
import type { Diagnostic, ExtensionPoint, Guard } from '../model/types';
import { declKey, locOf, predicateTargetIds, resolveAlias } from '../programs/identity';
import type { Collector, ProgramCtx } from '../programs/stream';

export type PointsResult = {
  points: ExtensionPoint[];
  guards: Guard[];
  diagnostics: Diagnostic[];
};

/** Path fragment every file of the plugin SDK shares, however it was installed. */
const SDK_MODULE = '/@openshift/dynamic-plugin-sdk/';

/** The code-reference aliases a point property may be declared with. */
const CODE_REF_NAMES: ReadonlySet<string> = new Set(['CodeRef', 'ComponentCodeRef']);

/** A declaration's own reference to a named type, with the type arguments written at that site. */
type TypeRef = { name: ts.Node; typeArguments?: ts.NodeArray<ts.TypeNode> };

type PointDecl = ts.TypeAliasDeclaration | ts.InterfaceDeclaration;

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

const isExported = (node: ts.Declaration): boolean =>
  (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;

const symbolOf = (node: ts.Node, checker: ts.TypeChecker): ts.Symbol | undefined => {
  const symbol = checker.getSymbolAtLocation(node);
  return symbol ? resolveAlias(checker, symbol) : undefined;
};

const inSdk = (decl: ts.Declaration): boolean =>
  toPosix(decl.getSourceFile().fileName).includes(SDK_MODULE);

/** The references a point declaration makes on its own: an alias body, an intersection member or a heritage clause. */
const declaredRefs = (node: PointDecl): TypeRef[] => {
  if (ts.isInterfaceDeclaration(node)) {
    return (node.heritageClauses ?? []).flatMap((clause) =>
      clause.types.map((type) => ({ name: type.expression, typeArguments: type.typeArguments })),
    );
  }
  const members = ts.isIntersectionTypeNode(node.type) ? [...node.type.types] : [node.type];
  return members.flatMap((member) =>
    ts.isTypeReferenceNode(member)
      ? [{ name: member.typeName, typeArguments: member.typeArguments }]
      : [],
  );
};

/** True when a reference resolves to the `Extension` type declared by the plugin SDK. */
const isSdkExtension = (ref: TypeRef, checker: ts.TypeChecker): boolean => {
  const symbol = symbolOf(ref.name, checker);
  return symbol?.name === 'Extension' && (symbol.declarations ?? []).some(inSdk);
};

/** True when a reference resolves to the SDK's `CodeRef`, directly or through a repo alias of it. */
const isCodeRef = (ref: TypeRef, checker: ts.TypeChecker, depth: number): boolean => {
  const symbol = symbolOf(ref.name, checker);
  if (!symbol || !CODE_REF_NAMES.has(symbol.name)) {
    return false;
  }
  const declarations = symbol.declarations ?? [];
  if (declarations.some(inSdk)) {
    return true;
  }
  return (
    depth < 2 &&
    declarations.some(
      (decl) =>
        ts.isTypeAliasDeclaration(decl) &&
        ts.isTypeReferenceNode(decl.type) &&
        isCodeRef(
          { name: decl.type.typeName, typeArguments: decl.type.typeArguments },
          checker,
          depth + 1,
        ),
    )
  );
};

/** The type argument a code reference carries, written at the use site or defaulted by the alias. */
const innerTypeNode = (ref: TypeRef, checker: ts.TypeChecker): ts.TypeNode | undefined => {
  const explicit = ref.typeArguments?.[0];
  if (explicit) {
    return explicit;
  }
  const alias = symbolOf(ref.name, checker)?.declarations?.find(ts.isTypeAliasDeclaration);
  return alias?.typeParameters?.[0]?.default;
};

const isNamedTypeDecl = (decl: ts.Declaration): boolean =>
  ts.isTypeAliasDeclaration(decl) ||
  ts.isInterfaceDeclaration(decl) ||
  ts.isClassDeclaration(decl) ||
  ts.isEnumDeclaration(decl);

/** The cross-program key of a type's own declaration, when it has a named one in repo source. */
const namedDeclKey = (type: ts.Type, ctx: ProgramCtx): string | undefined => {
  const symbol = type.aliasSymbol ?? type.getSymbol();
  const decl = symbol?.declarations?.find(isNamedTypeDecl);
  if (!decl || decl.getSourceFile().isDeclarationFile) {
    return undefined;
  }
  return relFile(ctx.repoRoot, decl.getSourceFile().fileName).startsWith('..')
    ? undefined
    : declKey(decl, ctx);
};

const codeRefOf = (
  typeNode: ts.TypeNode | undefined,
  ctx: ProgramCtx,
): ExtensionPoint['properties'][number]['codeRef'] => {
  if (!typeNode || !ts.isTypeReferenceNode(typeNode)) {
    return undefined;
  }
  const ref = { name: typeNode.typeName, typeArguments: typeNode.typeArguments };
  if (!isCodeRef(ref, ctx.checker, 0)) {
    return undefined;
  }
  const inner = innerTypeNode(ref, ctx.checker);
  if (!inner) {
    return { inner: collapse(typeNode.getText()) };
  }
  const innerType = ctx.checker.getTypeFromTypeNode(inner);
  const key = namedDeclKey(innerType, ctx);
  return { inner: ctx.checker.typeToString(innerType), ...(key ? { innerKey: key } : {}) };
};

/** The declared properties of a point, read from the `Extension` reference's second type argument. */
const propertiesOf = (
  typeNode: ts.TypeNode | undefined,
  ctx: ProgramCtx,
): { properties: ExtensionPoint['properties']; diagnostics: Diagnostic[] } => {
  if (!typeNode) {
    return { properties: [], diagnostics: [] };
  }
  const diagnostics: Diagnostic[] = [];
  const properties = ctx.checker.getTypeFromTypeNode(typeNode).getProperties();
  return {
    properties: properties.map((symbol) => {
      const decl = symbol.declarations?.find(ts.isPropertySignature);
      const declaredType = decl?.type;
      const doc = decl ? readDoc(decl, ctx) : undefined;
      if (doc) {
        diagnostics.push(...doc.diagnostics);
      }
      const codeRef = codeRefOf(declaredType, ctx);
      const summary = doc?.doc.summary;
      return {
        name: symbol.name,
        optional: (symbol.flags & ts.SymbolFlags.Optional) !== 0,
        typeText: declaredType
          ? collapse(declaredType.getText())
          : ctx.checker.typeToString(ctx.checker.getTypeOfSymbol(symbol)),
        ...(codeRef ? { codeRef } : {}),
        ...(summary === undefined ? {} : { doc: summary }),
      };
    }),
    diagnostics,
  };
};

/** The string literal a guard body compares `.type` against, when it compares against one at all. */
const comparedLiteral = (node: ts.Node): string | undefined => {
  let found: string | undefined;
  const walk = (current: ts.Node): void => {
    if (found !== undefined) {
      return;
    }
    if (
      ts.isBinaryExpression(current) &&
      (current.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        current.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)
    ) {
      const sides = [current.left, current.right];
      const reads = sides.some(
        (side) => ts.isPropertyAccessExpression(side) && side.name.text === 'type',
      );
      const literal = sides.find(ts.isStringLiteralLike);
      if (reads && literal) {
        found = literal.text;
        return;
      }
    }
    current.forEachChild(walk);
  };
  walk(node);
  return found;
};

const firstStringArgument = (call: ts.CallExpression): string | undefined =>
  call.arguments.find(ts.isStringLiteralLike)?.text;

/** The ids the first call signature of `type` returns a predicate for, one level in. */
const returnedPredicateIds = (type: ts.Type, checker: ts.TypeChecker): string[] | undefined =>
  type
    .getCallSignatures()
    .map((signature) => predicateTargetIds(signature.getReturnType(), checker))
    .find((ids) => ids !== undefined);

const guardOf = (
  name: ts.Identifier,
  decl: ts.Node,
  initializer: ts.Expression | undefined,
  ctx: ProgramCtx,
): { guard: Guard; literal?: string } | undefined => {
  const type = ctx.checker.getTypeAtLocation(name);
  const direct = predicateTargetIds(type, ctx.checker);
  const returned = direct ? undefined : returnedPredicateIds(type, ctx.checker);
  const pointIds = direct ?? returned;
  if (!pointIds) {
    return undefined;
  }
  const factoryCall = initializer && ts.isCallExpression(initializer) ? initializer : undefined;
  const style: Guard['style'] = direct ? (factoryCall ? 'factory' : 'inline') : 'parameterized';
  const literal = factoryCall
    ? firstStringArgument(factoryCall)
    : comparedLiteral(initializer ?? decl);
  return {
    // A union that repeats a `type` literal yields it once per member; a guard names each id once.
    guard: { name: name.text, loc: locOf(decl, ctx), style, pointIds: [...new Set(pointIds)] },
    ...(literal === undefined ? {} : { literal }),
  };
};

/**
 * Finds every extension point type, its JSDoc and its guards. Points are identified by the
 * `Extension` type the declaration itself references, and guards by the type the checker says
 * their predicate narrows to, so neither rule depends on a naming convention.
 */
export const pointsCollector = (): Collector<PointsResult> => {
  const points: ExtensionPoint[] = [];
  const guards: Guard[] = [];
  /** The declaring package of each guard; `Guard` itself does not carry one. */
  const guardPkgs = new Map<Guard, string>();
  const diagnostics: Diagnostic[] = [];

  const addPoint = (node: PointDecl, pkg: string, ctx: ProgramCtx): void => {
    for (const ref of declaredRefs(node)) {
      if (!isSdkExtension(ref, ctx.checker)) {
        continue;
      }
      const idNode = ref.typeArguments?.[0];
      const idType = idNode ? ctx.checker.getTypeFromTypeNode(idNode) : undefined;
      if (!idType?.isStringLiteral()) {
        continue;
      }
      const loc = locOf(node, ctx);
      const { doc, diagnostics: docDiagnostics } = readDoc(node, ctx);
      const { properties, diagnostics: propDiagnostics } = propertiesOf(
        ref.typeArguments?.[1],
        ctx,
      );
      diagnostics.push(...docDiagnostics, ...propDiagnostics);
      if (isEmptyDoc(doc)) {
        diagnostics.push(
          makeDiagnostic(
            'point-no-jsdoc',
            `Extension point '${idType.value}' (${node.name.text}) has no JSDoc.`,
            loc,
            pkg,
          ),
        );
      }
      points.push({
        id: idType.value,
        pkg,
        typeName: node.name.text,
        loc,
        typeParams: (node.typeParameters ?? []).map((param) => param.name.text),
        guards: [],
        doc,
        properties,
      });
      return;
    }
  };

  const addGuard = (
    name: ts.Identifier,
    decl: ts.Node,
    initializer: ts.Expression | undefined,
    pkg: string,
    ctx: ProgramCtx,
  ): void => {
    const found = guardOf(name, decl, initializer, ctx);
    if (!found) {
      return;
    }
    guards.push(found.guard);
    guardPkgs.set(found.guard, pkg);
    if (found.literal !== undefined && !found.guard.pointIds.includes(found.literal)) {
      diagnostics.push(
        makeDiagnostic(
          'guard-literal-mismatch',
          `Guard '${name.text}' compares against '${
            found.literal
          }' but narrows to ${found.guard.pointIds.map((id) => `'${id}'`).join(', ')}.`,
          found.guard.loc,
          pkg,
        ),
      );
    }
  };

  return {
    visit: (ctx) => {
      for (const file of ctx.ownedFiles) {
        const rel = relFile(ctx.repoRoot, file.fileName);
        // A file outside every workspace package dir (`frontend/config`, say) is attributed to the
        // package of the program that owns it; with neither, there is nothing to attribute it to.
        const pkg = pkgForFile(rel, ctx.ws) ?? pkgForFile(relFile(ctx.repoRoot, ctx.dir), ctx.ws);
        if (pkg === undefined) {
          continue;
        }
        file.forEachChild((node) => {
          if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
            if (isExported(node)) {
              addPoint(node, pkg, ctx);
            }
          } else if (ts.isFunctionDeclaration(node)) {
            if (node.name && isExported(node)) {
              addGuard(node.name, node, undefined, pkg, ctx);
            }
          } else if (ts.isVariableStatement(node)) {
            node.declarationList.declarations.forEach((decl) => {
              if (ts.isIdentifier(decl.name) && isExported(decl)) {
                addGuard(decl.name, decl, decl.initializer, pkg, ctx);
              }
            });
          }
        });
      }
    },

    finish: () => {
      const known = new Set(points.map((point) => point.id));
      const namesById = new Map<string, Set<string>>();
      guards.forEach((guard) =>
        guard.pointIds.forEach((id) => {
          const names = namesById.get(id) ?? new Set<string>();
          names.add(guard.name);
          namesById.set(id, names);
        }),
      );
      const joined: Diagnostic[] = [];
      const resolved = points.map((point) => ({
        ...point,
        guards: [...(namesById.get(point.id) ?? [])].toSorted(),
      }));
      const byId = new Map<string, ExtensionPoint[]>();
      resolved.forEach((point) => {
        byId.set(point.id, [...(byId.get(point.id) ?? []), point]);
        if (point.guards.length === 0) {
          joined.push(
            makeDiagnostic(
              'point-no-guard',
              `Extension point '${point.id}' has no type guard.`,
              point.loc,
              point.pkg,
            ),
          );
        }
      });
      byId.forEach((declared, id) => {
        if (declared.length > 1) {
          const where = declared.map((point) => `${point.loc.file}#L${point.loc.line}`).join(', ');
          joined.push(
            makeDiagnostic(
              'point-duplicate-id',
              `Extension point id '${id}' is declared ${declared.length} times: ${where}.`,
              declared[0].loc,
              declared[0].pkg,
            ),
          );
        }
      });
      guards.forEach((guard) => {
        if (!guard.pointIds.some((id) => known.has(id))) {
          joined.push(
            makeDiagnostic(
              'guard-no-point',
              `Guard '${guard.name}' narrows to ${guard.pointIds
                .map((id) => `'${id}'`)
                .join(', ')}, which no extension point declares.`,
              guard.loc,
              guardPkgs.get(guard),
            ),
          );
        }
      });
      return { points: resolved, guards, diagnostics: [...diagnostics, ...joined] };
    },
  };
};
