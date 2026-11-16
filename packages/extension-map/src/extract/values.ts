import path from 'node:path';
import ts from 'typescript';
import { readSupplies } from './supplies';
import type { ProgramCtx } from '../programs/stream';
import { declKey, isStringLiteralType, locOf, resolveAlias } from '../programs/identity';
import { toRelPosix } from '../discovery/workspace';
import type { Loc, SymbolRef, Value } from '../model/types';

/** TypeScript literal values accepted by the extension map. */
type LiteralValue = string | number | boolean | null;

const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
};

const isNumberLiteralType = (type: ts.Type): type is ts.NumberLiteralType =>
  (type.flags & ts.TypeFlags.NumberLiteral) !== 0;

const literalTypeValue = (expression: ts.Expression, ctx: ProgramCtx): LiteralValue | undefined => {
  const type = ctx.checker.getTypeAtLocation(expression);
  if (isStringLiteralType(type)) {
    return type.value;
  }
  if (isNumberLiteralType(type)) {
    return type.value;
  }
  if ((type.flags & ts.TypeFlags.BooleanLiteral) !== 0) {
    const text = ctx.checker.typeToString(type);
    return text === 'true' ? true : text === 'false' ? false : undefined;
  }
  return (type.flags & ts.TypeFlags.Null) !== 0 ? null : undefined;
};

const literalExpressionValue = (
  expression: ts.Expression,
  ctx: ProgramCtx,
): LiteralValue | undefined => {
  const current = unwrapExpression(expression);
  if (ts.isStringLiteralLike(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
    return current.text;
  }
  if (ts.isNumericLiteral(current)) {
    return Number(current.text.replaceAll('_', ''));
  }
  if (current.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (current.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  if (current.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }
  if (
    ts.isPrefixUnaryExpression(current) &&
    (current.operator === ts.SyntaxKind.MinusToken ||
      current.operator === ts.SyntaxKind.PlusToken) &&
    ts.isNumericLiteral(current.operand)
  ) {
    const value = Number(current.operand.text.replaceAll('_', ''));
    return current.operator === ts.SyntaxKind.MinusToken ? -value : value;
  }
  return literalTypeValue(current, ctx);
};

const unresolved = (expression: ts.Node, ctx: ProgramCtx, reason: string): Value => ({
  kind: 'unresolved',
  reason,
  loc: locOf(expression, ctx),
});

const UNRESOLVED_SPREAD_PREFIX = '<unresolved spread:';

/** Reserved model-key namespace for unresolved spread contributions. */
export const isUnresolvedSpreadKey = (key: string): boolean =>
  key.startsWith(UNRESOLVED_SPREAD_PREFIX);

export const unresolvedSpreadKey = (node: ts.Node, ctx: ProgramCtx): string => {
  const loc = locOf(node, ctx);
  return `${UNRESOLVED_SPREAD_PREFIX}${loc.file}:${loc.line}:${node.getStart()}>`;
};

const enumMemberValue = (
  expression: ts.PropertyAccessExpression,
  ctx: ProgramCtx,
): Extract<Value, { kind: 'enumMember' }> | undefined => {
  const symbol = ctx.checker.getSymbolAtLocation(expression.name);
  const declaration = symbol?.valueDeclaration;
  if (!declaration || !ts.isEnumMember(declaration) || !ts.isEnumDeclaration(declaration.parent)) {
    return undefined;
  }
  const value = ctx.checker.getConstantValue(declaration);
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }
  return {
    kind: 'enumMember',
    enumName: declaration.parent.name.text,
    member: declaration.name.getText(),
    value,
  };
};

const constantValue = (
  expression: ts.Identifier | ts.PropertyAccessExpression,
  ctx: ProgramCtx,
): Extract<Value, { kind: 'constant' }> | undefined => {
  const value = literalTypeValue(expression, ctx);
  if (value === undefined || value === null) {
    return undefined;
  }
  return { kind: 'constant', name: expression.getText(), value };
};

const unwrapTemplatePart = (value: Value): LiteralValue | undefined => {
  if (value.kind === 'literal' || value.kind === 'constant' || value.kind === 'enumMember') {
    return value.value;
  }
  return undefined;
};

const templateValue = (expression: ts.TemplateExpression, ctx: ProgramCtx): Value => {
  let value = expression.head.text;
  for (const span of expression.templateSpans) {
    const part = resolveValue(span.expression, ctx);
    const literal = unwrapTemplatePart(part);
    if (literal === undefined) {
      return unresolved(span.expression, ctx, 'template expression contains a non-literal value');
    }
    value += String(literal) + span.literal.text;
  }
  return { kind: 'literal', value };
};

const propertyName = (name: ts.PropertyName): string => {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
};

const objectValue = (expression: ts.ObjectLiteralExpression, ctx: ProgramCtx): Value => {
  const props: Record<string, Value> = {};
  for (const property of expression.properties) {
    if (ts.isPropertyAssignment(property)) {
      props[propertyName(property.name)] = resolveValue(property.initializer, ctx);
    } else if (ts.isShorthandPropertyAssignment(property)) {
      props[property.name.text] = resolveValue(property.name, ctx);
    } else if (ts.isSpreadAssignment(property)) {
      for (const key of Object.keys(props)) {
        if (!isUnresolvedSpreadKey(key)) {
          delete props[key];
        }
      }
      props[unresolvedSpreadKey(property, ctx)] = unresolved(
        property,
        ctx,
        'object spread contribution is not statically resolved',
      );
    } else {
      const name = ts.isMethodDeclaration(property)
        ? propertyName(property.name)
        : property.getText();
      props[name] = unresolved(property, ctx, 'object member is not a statically resolvable value');
    }
  }
  return { kind: 'object', props };
};

const moduleSpecifierOf = (expression: ts.CallExpression): string | undefined => {
  if (
    expression.expression.kind !== ts.SyntaxKind.ImportKeyword ||
    expression.arguments.length !== 1 ||
    !ts.isStringLiteralLike(expression.arguments[0])
  ) {
    return undefined;
  }
  return expression.arguments[0].text;
};

const resolveModuleFile = (
  specifier: string,
  arrow: ts.ArrowFunction,
  ctx: ProgramCtx,
): string | undefined => {
  const resolved = ts.resolveModuleName(
    specifier,
    arrow.getSourceFile().fileName,
    ctx.program.getCompilerOptions(),
    ts.sys,
  ).resolvedModule?.resolvedFileName;
  if (resolved === undefined) {
    return undefined;
  }
  const relative = toRelPosix(ctx.repoRoot, path.resolve(resolved));
  return relative === '' || relative.startsWith('../') || path.isAbsolute(relative)
    ? undefined
    : relative;
};

type CodeRefTarget = { target?: Loc; supplies?: Record<string, Value | SymbolRef> };

const targetDeclaration = (
  node: ts.Declaration,
  ctx: ProgramCtx,
  seen: Set<string>,
): ts.Declaration | undefined => {
  const key = declKey(node, ctx);
  if (seen.has(key)) {
    return undefined;
  }
  seen.add(key);
  if (ts.isExportAssignment(node)) {
    const expression = unwrapExpression(node.expression);
    if (ts.isIdentifier(expression)) {
      const symbol = ctx.checker.getSymbolAtLocation(expression);
      const declaration =
        symbol === undefined ? undefined : resolveAlias(ctx.checker, symbol).valueDeclaration;
      return declaration === undefined ? node : targetDeclaration(declaration, ctx, seen) ?? node;
    }
  }
  if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
    return node;
  }
  return node;
};

const codeRefTarget = (
  sourceFile: ts.SourceFile | undefined,
  exportName: string,
  ctx: ProgramCtx,
): CodeRefTarget => {
  const moduleSymbol =
    sourceFile === undefined ? undefined : ctx.checker.getSymbolAtLocation(sourceFile);
  const exportSymbol =
    moduleSymbol === undefined
      ? undefined
      : ctx.checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === exportName);
  if (exportSymbol === undefined) {
    return {};
  }
  const resolvedSymbol = resolveAlias(ctx.checker, exportSymbol);
  const declaration = resolvedSymbol.valueDeclaration ?? resolvedSymbol.declarations?.[0];
  if (declaration === undefined) {
    return {};
  }
  const target = targetDeclaration(declaration, ctx, new Set());
  if (target === undefined) {
    return {};
  }
  const result: CodeRefTarget = { target: locOf(target, ctx) };
  const supplies = readSupplies(target, ctx);
  if (supplies !== undefined) {
    result.supplies = supplies;
  }
  return result;
};

const selectedExport = (callback: ts.Expression): string | null => {
  const expression = unwrapExpression(callback);
  if (!ts.isArrowFunction(expression) || expression.parameters.length !== 1) {
    return null;
  }
  const parameter = expression.parameters[0].name;
  if (!ts.isIdentifier(parameter) || ts.isBlock(expression.body)) {
    return null;
  }
  const body = unwrapExpression(expression.body);
  if (
    ts.isPropertyAccessExpression(body) &&
    ts.isIdentifier(body.expression) &&
    body.expression.text === parameter.text
  ) {
    return body.name.text;
  }
  if (!ts.isObjectLiteralExpression(body)) {
    return null;
  }
  const defaultProperty = body.properties.find(
    (property) => ts.isPropertyAssignment(property) && propertyName(property.name) === 'default',
  );
  if (!defaultProperty || !ts.isPropertyAssignment(defaultProperty)) {
    return null;
  }
  const value = unwrapExpression(defaultProperty.initializer);
  return ts.isPropertyAccessExpression(value) &&
    ts.isIdentifier(value.expression) &&
    value.expression.text === parameter.text
    ? value.name.text
    : null;
};

/** Resolves a supported dynamic-import arrow without executing package code. */
export const resolveCodeRef = (arrow: ts.ArrowFunction, ctx: ProgramCtx): Value => {
  if (ts.isBlock(arrow.body)) {
    return unresolved(arrow, ctx, 'CodeRef body is not a supported dynamic import');
  }
  const body = unwrapExpression(arrow.body);
  let importCall: ts.CallExpression | undefined;
  let exportName: string | null = 'default';
  if (ts.isCallExpression(body) && body.expression.kind === ts.SyntaxKind.ImportKeyword) {
    importCall = body;
  } else if (
    ts.isCallExpression(body) &&
    ts.isPropertyAccessExpression(body.expression) &&
    body.expression.name.text === 'then' &&
    ts.isCallExpression(body.expression.expression) &&
    body.expression.expression.expression.kind === ts.SyntaxKind.ImportKeyword
  ) {
    importCall = body.expression.expression;
    exportName = body.arguments.length === 1 ? selectedExport(body.arguments[0]) : null;
  }
  const specifier = importCall === undefined ? undefined : moduleSpecifierOf(importCall);
  if (importCall === undefined || specifier === undefined) {
    return unresolved(arrow, ctx, 'CodeRef body is not a supported dynamic import');
  }
  const module = resolveModuleFile(specifier, arrow, ctx);
  if (module === undefined) {
    return unresolved(arrow, ctx, `CodeRef module '${specifier}' could not be resolved`);
  }
  const sourceFile = ctx.program.getSourceFile(path.resolve(ctx.repoRoot, module));
  const target = exportName === null ? {} : codeRefTarget(sourceFile, exportName, ctx);
  return {
    kind: 'codeRef',
    module,
    export: exportName,
    ...target,
  };
};

const resolveIdentifier = (
  expression: ts.Identifier | ts.PropertyAccessExpression,
  ctx: ProgramCtx,
): Value => {
  if (ts.isPropertyAccessExpression(expression)) {
    const member = enumMemberValue(expression, ctx);
    if (member !== undefined) {
      return member;
    }
  }
  const constant = constantValue(expression, ctx);
  if (constant !== undefined) {
    return constant;
  }
  const symbol = ctx.checker.getSymbolAtLocation(
    ts.isIdentifier(expression) ? expression : expression.name,
  );
  const resolved = symbol === undefined ? undefined : resolveAlias(ctx.checker, symbol);
  const declaration = resolved?.valueDeclaration;
  if (
    declaration !== undefined &&
    ts.isVariableDeclaration(declaration) &&
    declaration.initializer !== undefined &&
    ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0
  ) {
    const value = literalExpressionValue(declaration.initializer, ctx);
    if (value !== undefined && value !== null) {
      return { kind: 'constant', name: expression.getText(), value };
    }
  }
  return unresolved(expression, ctx, 'identifier does not resolve to a literal value');
};

/** Resolves an expression to plain model data, without executing package code. */
export const resolveValue = (expression: ts.Expression, ctx: ProgramCtx): Value => {
  const current = unwrapExpression(expression);
  if (ts.isIdentifier(current) || ts.isPropertyAccessExpression(current)) {
    return resolveIdentifier(current, ctx);
  }
  const literal = literalExpressionValue(current, ctx);
  if (literal !== undefined) {
    return { kind: 'literal', value: literal };
  }
  if (ts.isArrayLiteralExpression(current)) {
    return { kind: 'array', items: current.elements.map((element) => resolveValue(element, ctx)) };
  }
  if (ts.isObjectLiteralExpression(current)) {
    return objectValue(current, ctx);
  }
  if (ts.isTemplateExpression(current)) {
    return templateValue(current, ctx);
  }
  if (ts.isArrowFunction(current)) {
    return resolveCodeRef(current, ctx);
  }
  return unresolved(current, ctx, 'expression is not a statically resolvable value');
};
