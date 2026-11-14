import ts from 'typescript';
import { readSupplies } from './supplies';
import { relFile } from '../discovery/workspace';
import type { Loc, Value } from '../model/types';
import {
  constInitializer,
  declLoc,
  locOf,
  resolveAlias,
  unwrapExpression,
} from '../programs/identity';
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

const isFunctionLike = (expr: ts.Expression): boolean =>
  ts.isArrowFunction(expr) || ts.isFunctionExpression(expr);

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
): { file: string; external?: boolean; symbol?: ts.Symbol } | undefined => {
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
    return { file: specifier.text, external: true };
  }
  const file = relFile(repoRoot, source.fileName);
  const outside =
    file.startsWith('..') || file.startsWith('node_modules/') || file.includes('/node_modules/');
  return outside ? { file: specifier.text, external: true } : { file, symbol };
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
  const target: Loc | undefined = decl ? declLoc(decl, state.ctx) : undefined;
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
    ...(module.external ? { external: true } : {}),
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

/**
 * The value a named reference carries: a literal from its type, else what its `const`
 * initializer resolves to, when that is data (a literal, an array or an object). A reference to
 * a function is left to `referencedFunction`, which keeps the name it was declared under.
 */
const referencedValue = (
  expr: ts.Identifier | ts.PropertyAccessExpression,
  symbol: ts.Symbol | undefined,
  state: State,
): Value | undefined => {
  const name = collapse(expr.getText());
  const direct = literalOfType(state.ctx.checker.getTypeAtLocation(expr), state.ctx.checker);
  if (direct !== undefined) {
    return { kind: 'constant', name, value: direct };
  }
  const followed = constInitializer(symbol, state.ctx.checker);
  if (!followed) {
    return undefined;
  }
  const key = nodeKey(followed.decl);
  if (state.seen.has(key)) {
    return undefined;
  }
  const value = resolveIn(followed.initializer, {
    ...deeper(state),
    seen: new Set([...state.seen, key]),
  });
  if (value.kind === 'literal' && value.value !== null) {
    return { kind: 'constant', name, value: value.value };
  }
  return value.kind === 'array' || value.kind === 'object' ? value : undefined;
};

/** The function a reference names: a function declaration, or a `const` holding a function. */
const referencedFunction = (
  expr: ts.Identifier | ts.PropertyAccessExpression,
  symbol: ts.Symbol | undefined,
  state: State,
): Value | undefined => {
  const followed = constInitializer(symbol, state.ctx.checker);
  const holdsFunction =
    followed !== undefined && isFunctionLike(unwrapExpression(followed.initializer));
  const decl = holdsFunction ? followed.decl : symbol?.declarations?.find(ts.isFunctionDeclaration);
  return decl
    ? { kind: 'function', name: collapse(expr.getText()), loc: declLoc(decl, state.ctx) }
    : undefined;
};

/**
 * The array literal an expression stands for: written inline, or held by a `const` that can be
 * trusted (see `constInitializer`). `undefined` when the elements cannot be counted.
 */
export const arrayLiteralFor = (
  expr: ts.Expression,
  ctx: ProgramCtx,
  depth = 0,
): ts.ArrayLiteralExpression | undefined => {
  if (depth > MAX_DEPTH) {
    return undefined;
  }
  const node = unwrapExpression(expr);
  if (ts.isArrayLiteralExpression(node)) {
    return node;
  }
  if (!ts.isIdentifier(node)) {
    return undefined;
  }
  const raw = ctx.checker.getSymbolAtLocation(node);
  const followed = constInitializer(raw ? resolveAlias(ctx.checker, raw) : undefined, ctx.checker);
  return followed ? arrayLiteralFor(followed.initializer, ctx, depth + 1) : undefined;
};

/**
 * True when a reference names the parameter of the callback of a `.map()` call whose source array
 * the walk can read: the element the generated value was built from, which the record carries as
 * `mappedValues`. A `.map()` over something else leaves the value unresolved, as it must.
 */
const isMapParameter = (symbol: ts.Symbol | undefined, state: State): boolean => {
  const decl = symbol?.declarations?.find(ts.isParameter);
  const fn = decl?.parent;
  if (!fn || (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn))) {
    return false;
  }
  const call = fn.parent;
  return (
    ts.isCallExpression(call) &&
    ts.isPropertyAccessExpression(call.expression) &&
    call.expression.name.text === 'map' &&
    call.arguments.includes(fn) &&
    arrayLiteralFor(call.expression.expression, state.ctx) !== undefined
  );
};

const resolveReference = (
  expr: ts.Identifier | ts.PropertyAccessExpression,
  state: State,
): Value => {
  // The symbol at a shorthand property's name is the property, not what it reads.
  const shorthand = ts.isShorthandPropertyAssignment(expr.parent) ? expr.parent : undefined;
  const raw = shorthand
    ? state.ctx.checker.getShorthandAssignmentValueSymbol(shorthand)
    : state.ctx.checker.getSymbolAtLocation(expr);
  const symbol = raw ? resolveAlias(state.ctx.checker, raw) : undefined;
  if (isMapParameter(symbol, state)) {
    return { kind: 'mapped' };
  }
  const member = symbol ? enumMemberValue(symbol, state) : undefined;
  return (
    member ??
    referencedValue(expr, symbol, state) ??
    referencedFunction(expr, symbol, state) ??
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

/** The position key of a node, so the same declaration is not followed twice in one chain. */
const nodeKey = (node: ts.Node): string => {
  const file = node.getSourceFile();
  return `${file.fileName}:${node.getStart(file)}`;
};

/**
 * The object literal a spread reads: an object literal, a name holding one, or a property of
 * one, followed through imports and `satisfies` / `as`. `undefined` when it is anything else.
 * A property access is followed structurally, because the symbol at a property of a
 * contextually typed object literal is the declared property of its *type*, not the literal.
 */
const spreadObject = (
  expr: ts.Expression,
  state: State,
  depth = 0,
): ts.ObjectLiteralExpression | undefined => {
  if (depth > MAX_DEPTH) {
    return undefined;
  }
  const node = unwrapExpression(expr);
  if (ts.isObjectLiteralExpression(node)) {
    return node;
  }
  if (ts.isPropertyAccessExpression(node)) {
    const owner = spreadObject(node.expression, state, depth + 1);
    const member = owner?.properties.find(
      (property): property is ts.PropertyAssignment =>
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) &&
        property.name.text === node.name.text,
    );
    return member ? spreadObject(member.initializer, state, depth + 1) : undefined;
  }
  if (!ts.isIdentifier(node)) {
    return undefined;
  }
  const raw = state.ctx.checker.getSymbolAtLocation(node);
  const symbol = raw ? resolveAlias(state.ctx.checker, raw) : undefined;
  const followed = constInitializer(symbol, state.ctx.checker);
  return followed ? spreadObject(followed.initializer, state, depth + 1) : undefined;
};

const resolveObject = (expr: ts.ObjectLiteralExpression, state: State): Value => {
  const props: Record<string, Value> = {};
  for (const property of expr.properties) {
    if (ts.isSpreadAssignment(property)) {
      // Spread members merge in source order, so a later key wins. A spread the walk cannot
      // read makes the whole object unresolved: a partial object would be a guess.
      const object = spreadObject(property.expression, state);
      const key = object ? nodeKey(object) : undefined;
      const spread =
        object && key !== undefined && !state.seen.has(key)
          ? resolveObject(object, { ...deeper(state), seen: new Set([...state.seen, key]) })
          : undefined;
      if (spread?.kind !== 'object') {
        return unresolved(
          `spread of '${collapse(property.expression.getText())}' is not an object literal`,
          property,
          state,
        );
      }
      Object.assign(props, spread.props);
    } else if (ts.isShorthandPropertyAssignment(property)) {
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
    return resolveCodeRefIn(node, state) ?? { kind: 'function', loc: locOf(node, state.ctx) };
  }
  if (ts.isFunctionExpression(node)) {
    return {
      kind: 'function',
      ...(node.name ? { name: node.name.text } : {}),
      loc: locOf(node, state.ctx),
    };
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
