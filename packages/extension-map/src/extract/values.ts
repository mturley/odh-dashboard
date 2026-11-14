import ts from 'typescript';
import { readSupplies } from './supplies';
import { relFile } from '../discovery/workspace';
import type { Loc, Value } from '../model/types';
import { locOf, resolveAlias, unwrapExpression } from '../programs/identity';
import type { ProgramCtx } from '../programs/stream';

/** How deep a value may nest before resolution stops; deeper than any real extension property. */
const MAX_DEPTH = 16;

/** Shared state of one `resolveValue` call: the program, the nesting depth and what it followed. */
type State = {
  ctx: ProgramCtx;
  depth: number;
  /** Declaration keys already followed, so a constant referring to itself cannot loop. */
  seen: Set<string>;
};

const unresolved = (reason: string, node: ts.Node, state: State): Value => ({
  kind: 'unresolved',
  reason,
  loc: locOf(node, state.ctx),
});

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

const deeper = (state: State): State => ({ ...state, depth: state.depth + 1 });

/** The literal a type names, when it names exactly one. */
const literalOfType = (
  type: ts.Type,
  checker: ts.TypeChecker,
): string | number | boolean | undefined => {
  if (type.isStringLiteral() || type.isNumberLiteral()) {
    return type.value;
  }
  if ((type.flags & ts.TypeFlags.BooleanLiteral) !== 0) {
    return checker.typeToString(type) === 'true';
  }
  return undefined;
};

/** The expression a concise or single-`return` arrow body carries. */
export const arrowBodyExpression = (
  fn: ts.ArrowFunction | ts.FunctionExpression,
): ts.Expression | undefined => {
  if (!ts.isBlock(fn.body)) {
    return fn.body;
  }
  const [statement] = fn.body.statements;
  return fn.body.statements.length === 1 && ts.isReturnStatement(statement)
    ? statement.expression
    : undefined;
};

const importCallOf = (expr: ts.Expression): ts.CallExpression | undefined =>
  ts.isCallExpression(expr) && expr.expression.kind === ts.SyntaxKind.ImportKeyword
    ? expr
    : undefined;

/** The export a `.then` callback picks out: `(m) => m.X` and `(m) => ({ default: m.X })`. */
const thenExport = (callback: ts.Expression | undefined): string | null => {
  if (!callback) {
    return null;
  }
  const fn = unwrapExpression(callback);
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) {
    return null;
  }
  const parameter = fn.parameters.length > 0 ? fn.parameters[0].name : undefined;
  const moduleName = parameter && ts.isIdentifier(parameter) ? parameter.text : undefined;
  const body = arrowBodyExpression(fn);
  if (!body || !moduleName) {
    return null;
  }
  const picked = unwrapExpression(body);
  const readsModule = (expr: ts.Expression): string | null =>
    ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === moduleName
      ? expr.name.text
      : null;
  if (ts.isObjectLiteralExpression(picked)) {
    const wrapped = picked.properties.find(
      (property): property is ts.PropertyAssignment =>
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) &&
        property.name.text === 'default',
    );
    return wrapped ? readsModule(unwrapExpression(wrapped.initializer)) : null;
  }
  return readsModule(picked);
};

/** The module an `import('…')` call names: its symbol, and the repo-relative file it resolved to. */
const importedModule = (
  call: ts.CallExpression,
  state: State,
): { file: string; symbol?: ts.Symbol } | undefined => {
  const specifier = call.arguments.length > 0 ? call.arguments[0] : undefined;
  if (!specifier || !ts.isStringLiteralLike(specifier)) {
    return undefined;
  }
  const { checker, repoRoot } = state.ctx;
  const promised = checker.getTypeAtLocation(call);
  const awaited = checker.getAwaitedType(promised);
  const symbol = awaited?.aliasSymbol ?? awaited?.getSymbol();
  const source = symbol?.declarations?.find(ts.isSourceFile);
  if (!source) {
    return { file: specifier.text };
  }
  const file = relFile(repoRoot, source.fileName);
  return file.startsWith('..') ? { file: specifier.text } : { file, symbol };
};

/** The declaration of one of a module's exports, with aliases followed. */
const exportedDeclaration = (
  moduleSymbol: ts.Symbol,
  name: string,
  state: State,
): ts.Declaration | undefined => {
  const exported = state.ctx.checker
    .getExportsOfModule(moduleSymbol)
    .find((symbol) => symbol.name === name);
  return exported ? resolveAlias(state.ctx.checker, exported).declarations?.[0] : undefined;
};

const resolveCodeRefIn = (fn: ts.ArrowFunction, state: State): Value | undefined => {
  const body = arrowBodyExpression(fn);
  if (!body) {
    return undefined;
  }
  const expr = unwrapExpression(body);
  let call = importCallOf(expr);
  let exportName: string | null = 'default';
  if (!call && ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
    if (expr.expression.name.text !== 'then') {
      return undefined;
    }
    call = importCallOf(unwrapExpression(expr.expression.expression));
    exportName = call ? thenExport(expr.arguments[0]) : 'default';
  }
  if (!call) {
    return undefined;
  }
  const module = importedModule(call, state);
  if (!module) {
    return undefined;
  }
  const decl =
    module.symbol && exportName !== null
      ? exportedDeclaration(module.symbol, exportName, state)
      : undefined;
  const target: Loc | undefined = decl ? locOf(decl, state.ctx) : undefined;
  const key = target ? `${target.file}:${target.line}` : undefined;
  const supplies =
    decl && key !== undefined && !state.seen.has(key)
      ? readSupplies(decl, state.ctx, (expr2) =>
          resolveIn(expr2, { ...deeper(state), seen: new Set([...state.seen, key]) }),
        )
      : undefined;
  return {
    kind: 'codeRef',
    module: module.file,
    export: exportName,
    ...(target ? { target } : {}),
    ...(supplies ? { supplies } : {}),
  };
};

/** The enum member a reference names, when it names one with a literal value. */
const enumMemberValue = (symbol: ts.Symbol, state: State): Value | undefined => {
  if ((symbol.flags & ts.SymbolFlags.EnumMember) === 0) {
    return undefined;
  }
  const decl = symbol.declarations?.find(ts.isEnumMember);
  const owner = decl && ts.isEnumDeclaration(decl.parent) ? decl.parent.name.text : undefined;
  const value = literalOfType(state.ctx.checker.getTypeOfSymbol(symbol), state.ctx.checker);
  return owner !== undefined && (typeof value === 'string' || typeof value === 'number')
    ? { kind: 'enumMember', enumName: owner, member: symbol.name, value }
    : undefined;
};

/** The literal a named reference carries: from its type, else from its `const` initializer. */
const referencedConstant = (
  expr: ts.Identifier | ts.PropertyAccessExpression,
  symbol: ts.Symbol | undefined,
  state: State,
): Value | undefined => {
  const name = collapse(expr.getText());
  const direct = literalOfType(state.ctx.checker.getTypeAtLocation(expr), state.ctx.checker);
  if (direct !== undefined) {
    return { kind: 'constant', name, value: direct };
  }
  const decl = symbol?.declarations?.find(ts.isVariableDeclaration);
  if (!decl?.initializer) {
    return undefined;
  }
  const key = `${decl.getSourceFile().fileName}:${decl.getStart(decl.getSourceFile())}`;
  if (state.seen.has(key)) {
    return undefined;
  }
  const value = resolveIn(decl.initializer, {
    ...deeper(state),
    seen: new Set([...state.seen, key]),
  });
  return value.kind === 'literal' && value.value !== null
    ? { kind: 'constant', name, value: value.value }
    : undefined;
};

const resolveReference = (
  expr: ts.Identifier | ts.PropertyAccessExpression,
  state: State,
): Value => {
  const raw = state.ctx.checker.getSymbolAtLocation(expr);
  const symbol = raw ? resolveAlias(state.ctx.checker, raw) : undefined;
  const member = symbol ? enumMemberValue(symbol, state) : undefined;
  return (
    member ??
    referencedConstant(expr, symbol, state) ??
    unresolved(`'${collapse(expr.getText())}' does not resolve to a literal`, expr, state)
  );
};

const resolveTemplate = (expr: ts.TemplateExpression, state: State): Value => {
  const direct = literalOfType(state.ctx.checker.getTypeAtLocation(expr), state.ctx.checker);
  if (typeof direct === 'string') {
    return { kind: 'literal', value: direct };
  }
  let { text } = expr.head;
  for (const span of expr.templateSpans) {
    const part = resolveIn(span.expression, deeper(state));
    const value =
      part.kind === 'literal' || part.kind === 'constant' || part.kind === 'enumMember'
        ? part.value
        : undefined;
    if (value === undefined || value === null) {
      return unresolved('template literal with a part that is not a literal', expr, state);
    }
    text += `${String(value)}${span.literal.text}`;
  }
  return { kind: 'literal', value: text };
};

const resolveArray = (expr: ts.ArrayLiteralExpression, state: State): Value => ({
  kind: 'array',
  items: expr.elements.map((element) =>
    ts.isSpreadElement(element) || ts.isOmittedExpression(element)
      ? unresolved('array element that is not a value', element, state)
      : resolveIn(element, deeper(state)),
  ),
});

const resolveObject = (expr: ts.ObjectLiteralExpression, state: State): Value => {
  const props: Record<string, Value> = {};
  for (const property of expr.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      props[property.name.text] = resolveIn(property.name, deeper(state));
    } else if (
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))
    ) {
      props[property.name.text] = resolveIn(property.initializer, deeper(state));
    } else {
      props[collapse(property.getText())] = unresolved(
        'object member that is not a named property',
        property,
        state,
      );
    }
  }
  return { kind: 'object', props };
};

const resolveIn = (expr: ts.Expression, state: State): Value => {
  if (state.depth > MAX_DEPTH) {
    return unresolved('value nests too deeply to resolve', expr, state);
  }
  const node = unwrapExpression(expr);
  if (ts.isStringLiteralLike(node)) {
    return { kind: 'literal', value: node.text };
  }
  if (ts.isNumericLiteral(node)) {
    return { kind: 'literal', value: Number(node.text) };
  }
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return { kind: 'literal', value: -Number(node.operand.text) };
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
    return { kind: 'literal', value: node.kind === ts.SyntaxKind.TrueKeyword };
  }
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return { kind: 'literal', value: null };
  }
  if (ts.isTemplateExpression(node)) {
    return resolveTemplate(node, state);
  }
  if (ts.isArrayLiteralExpression(node)) {
    return resolveArray(node, state);
  }
  if (ts.isObjectLiteralExpression(node)) {
    return resolveObject(node, state);
  }
  if (ts.isArrowFunction(node)) {
    return (
      resolveCodeRefIn(node, state) ??
      unresolved('function that is not a code reference', node, state)
    );
  }
  if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
    return resolveReference(node, state);
  }
  return unresolved(`${ts.SyntaxKind[node.kind]} is not a resolvable value`, node, state);
};

const freshState = (ctx: ProgramCtx): State => ({ ctx, depth: 0, seen: new Set<string>() });

/**
 * The value an expression carries, proven rather than guessed: literals, enum members, named
 * constants, code references, arrays and objects of those. Anything else is `unresolved`.
 */
export const resolveValue = (expr: ts.Expression, ctx: ProgramCtx): Value =>
  resolveIn(expr, freshState(ctx));

/**
 * The code reference an arrow function declares: the module it imports, the export it picks out
 * (`null` when the `.then` callback builds something new), where that export is declared, and
 * what it supplies when it declares an object literal.
 */
export const resolveCodeRef = (fn: ts.ArrowFunction, ctx: ProgramCtx): Value => {
  const state = freshState(ctx);
  return (
    resolveCodeRefIn(fn, state) ?? unresolved('function that is not a code reference', fn, state)
  );
};
