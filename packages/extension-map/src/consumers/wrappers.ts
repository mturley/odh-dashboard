import ts from 'typescript';
import { QUERY_HOOKS, declaredName, queryHookOf } from './hooks';
import { declKey, resolveAlias, unwrapExpression } from '../programs/identity';
import type { Collector, ProgramCtx } from '../programs/stream';

/**
 * One place a function or component passes one of its own parameters on to another callee.
 * `fn` and a string `callee` are declaration keys; a query hook is named instead of keyed.
 * `param` and `calleeParam` are a parameter index, or a prop name for a destructured props
 * object or a JSX attribute.
 */
export type ForwardEdge = {
  fn: string;
  fnName: string;
  param: number | string;
  callee: string | { hook: string };
  calleeParam: number | string;
};

/** A function or component that forwards a guard parameter into a query hook. */
export type Wrapper = {
  /** The name the wrapper is declared with. */
  name: string;
  /** The parameter (index or prop name) that carries the guard. */
  param: number | string;
  /** The query hook the guard reaches in the end. */
  hook: string;
  /** True when that hook resolves code references. */
  resolved: boolean;
};

/** Function-like nodes that can carry parameters a caller fills. */
export type FunctionLike =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration;

const isFunctionLike = (node: ts.Node): node is FunctionLike =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node);

/** The nearest ancestor that is not a parenthesis, `as`, `satisfies` or non-null assertion. */
const outerParent = (node: ts.Node): ts.Node => {
  let current = node;
  while (
    ts.isParenthesizedExpression(current.parent) ||
    ts.isAsExpression(current.parent) ||
    ts.isSatisfiesExpression(current.parent) ||
    ts.isNonNullExpression(current.parent)
  ) {
    current = current.parent;
  }
  return current.parent;
};

/**
 * The named declaration a caller reaches a function through: the function or method itself, the
 * `const` (or class field) an arrow or function expression is assigned to, or the `const` a
 * call wrapping the function is assigned to when that call returns something callable
 * (`React.memo(() => …)`, `React.forwardRef(…)`). `undefined` for an anonymous callback.
 */
export const namedDeclaration = (
  fn: ts.Node,
  checker: ts.TypeChecker,
):
  | ts.FunctionDeclaration
  | ts.MethodDeclaration
  | ts.VariableDeclaration
  | ts.PropertyDeclaration
  | undefined => {
  if (ts.isFunctionDeclaration(fn)) {
    return fn.name ? fn : undefined;
  }
  if (ts.isMethodDeclaration(fn)) {
    return ts.isIdentifier(fn.name) ? fn : undefined;
  }
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) {
    return undefined;
  }
  const parent = outerParent(fn);
  if (
    (ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent)) &&
    ts.isIdentifier(parent.name)
  ) {
    return parent;
  }
  if (ts.isCallExpression(parent) && parent.arguments.some((arg) => unwrapExpression(arg) === fn)) {
    const holder = outerParent(parent);
    if (
      ts.isVariableDeclaration(holder) &&
      ts.isIdentifier(holder.name) &&
      checker.getTypeAtLocation(holder.name).getCallSignatures().length > 0
    ) {
      return holder;
    }
  }
  return undefined;
};

/** A reference to one of a function's own parameters, by index or (for props) by name. */
export type ParamRef = { fn: FunctionLike; param: number | string };

/** The parameter a declaration binds: a plain parameter, or a prop destructured from the first. */
const paramOfDeclaration = (decl: ts.Node): ParamRef | undefined => {
  if (ts.isParameter(decl) && ts.isIdentifier(decl.name) && isFunctionLike(decl.parent)) {
    return { fn: decl.parent, param: decl.parent.parameters.indexOf(decl) };
  }
  if (ts.isBindingElement(decl) && ts.isObjectBindingPattern(decl.parent)) {
    const holder = decl.parent.parent;
    const key = decl.propertyName ?? decl.name;
    if (
      ts.isParameter(holder) &&
      isFunctionLike(holder.parent) &&
      holder.parent.parameters.indexOf(holder) === 0 &&
      ts.isIdentifier(key) &&
      !decl.dotDotDotToken
    ) {
      return { fn: holder.parent, param: key.text };
    }
  }
  return undefined;
};

/**
 * The function parameter an expression passes along unchanged: a parameter by name, a prop
 * destructured from the first parameter, or `props.x` read from the first parameter.
 */
export const paramRefOf = (expr: ts.Expression, checker: ts.TypeChecker): ParamRef | undefined => {
  const node = unwrapExpression(expr);
  if (ts.isIdentifier(node)) {
    const decl = checker.getSymbolAtLocation(node)?.valueDeclaration;
    return decl ? paramOfDeclaration(decl) : undefined;
  }
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    const decl = checker.getSymbolAtLocation(node.expression)?.valueDeclaration;
    const owner = decl ? paramOfDeclaration(decl) : undefined;
    return owner?.param === 0 ? { fn: owner.fn, param: node.name.text } : undefined;
  }
  return undefined;
};

/** The node naming what a call or JSX element invokes. */
const calleeNameNode = (
  node: ts.CallExpression | ts.JsxOpeningLikeElement,
): ts.Node | undefined => {
  const target = ts.isCallExpression(node) ? unwrapExpression(node.expression) : node.tagName;
  if (ts.isIdentifier(target)) {
    return target;
  }
  if (ts.isPropertyAccessExpression(target)) {
    return target.name;
  }
  return undefined;
};

/**
 * The declaration a call or JSX element invokes, following import aliases. A function with
 * overloads resolves to its implementation.
 */
export const calleeDeclaration = (
  node: ts.CallExpression | ts.JsxOpeningLikeElement,
  checker: ts.TypeChecker,
): ts.Declaration | undefined => {
  const name = calleeNameNode(node);
  const symbol = name ? checker.getSymbolAtLocation(name) : undefined;
  if (!symbol) {
    return undefined;
  }
  const declarations = resolveAlias(checker, symbol).declarations ?? [];
  return (
    declarations.find((decl) => ts.isFunctionDeclaration(decl) && decl.body !== undefined) ??
    declarations[0]
  );
};

/** What a call or JSX element invokes: a query hook by name, or any other declaration by key. */
export const calleeOf = (
  node: ts.CallExpression | ts.JsxOpeningLikeElement,
  ctx: ProgramCtx,
): { callee: string | { hook: string }; decl: ts.Declaration } | undefined => {
  const decl = calleeDeclaration(node, ctx.checker);
  if (!decl) {
    return undefined;
  }
  const hook = queryHookOf(decl, ctx);
  return { callee: hook ? { hook: hook.name } : declKey(decl, ctx), decl };
};

/**
 * Pass A: every place a named function or component in an owned file passes one of its own
 * parameters, unchanged, as a call argument or JSX attribute. The query hooks themselves are
 * skipped: plugin-core's `useResolvedExtensions` forwards its predicate to `useExtensions`, but it
 * is a query hook, not a wrapper.
 */
export const forwardingCollector = (): Collector<ForwardEdge[]> => {
  const edges = new Map<string, ForwardEdge>();

  const record = (
    expr: ts.Expression,
    site: ts.CallExpression | ts.JsxOpeningLikeElement,
    calleeParam: number | string,
    ctx: ProgramCtx,
  ): void => {
    const ref = paramRefOf(expr, ctx.checker);
    const decl = ref ? namedDeclaration(ref.fn, ctx.checker) : undefined;
    const fnName = decl ? declaredName(decl) : undefined;
    if (!ref || !decl || fnName === undefined || queryHookOf(decl, ctx)) {
      return;
    }
    const target = calleeOf(site, ctx);
    if (!target) {
      return;
    }
    const edge: ForwardEdge = {
      fn: declKey(decl, ctx),
      fnName,
      param: ref.param,
      callee: target.callee,
      calleeParam,
    };
    const callee = typeof edge.callee === 'string' ? edge.callee : `hook:${edge.callee.hook}`;
    edges.set(`${edge.fn}\0${edge.param}\0${callee}\0${edge.calleeParam}`, edge);
  };

  return {
    visit: (ctx) => {
      for (const file of ctx.ownedFiles) {
        const walk = (node: ts.Node): void => {
          if (ts.isCallExpression(node)) {
            node.arguments.forEach((arg, index) => record(arg, node, index, ctx));
          } else if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
            const value = node.initializer;
            if (value && ts.isJsxExpression(value) && value.expression) {
              record(value.expression, node.parent.parent, node.name.text, ctx);
            }
          }
          node.forEachChild(walk);
        };
        walk(file);
      }
    },
    finish: () =>
      [...edges.entries()].toSorted(([a], [b]) => a.localeCompare(b)).map(([, edge]) => edge),
  };
};

const isResolvedHook = (name: string): boolean =>
  QUERY_HOOKS.find((hook) => hook.name === name)?.resolved ?? false;

/**
 * The wrappers, by declaration key: a fixed point from the query hooks backwards over the
 * forwarding edges, so a wrapper of a wrapper is found however many levels deep and wherever its
 * packages are. A guard reaches a query hook only as its first argument. A wrapper that forwards
 * the same guard into two hooks is listed once per hook.
 */
export const resolveWrappers = (edges: ForwardEdge[]): Map<string, Wrapper[]> => {
  const wrappers = new Map<string, Wrapper[]>();
  const add = (fn: string, wrapper: Wrapper): boolean => {
    const known = wrappers.get(fn) ?? [];
    if (known.some((w) => w.param === wrapper.param && w.hook === wrapper.hook)) {
      return false;
    }
    wrappers.set(fn, [...known, wrapper]);
    return true;
  };
  edges.forEach((edge) => {
    if (typeof edge.callee !== 'string' && edge.calleeParam === 0) {
      add(edge.fn, {
        name: edge.fnName,
        param: edge.param,
        hook: edge.callee.hook,
        resolved: isResolvedHook(edge.callee.hook),
      });
    }
  });
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      const { callee } = edge;
      const inner = typeof callee === 'string' ? wrappers.get(callee) ?? [] : [];
      for (const wrapper of inner.filter((w) => w.param === edge.calleeParam)) {
        if (add(edge.fn, { ...wrapper, name: edge.fnName, param: edge.param })) {
          changed = true;
        }
      }
    }
  }
  return wrappers;
};
