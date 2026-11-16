import ts from 'typescript';
import { declaredName } from './hooks';
import { calleeDeclaration } from './wrappers';
import type { UseSite } from '../model/types';
import { declLoc } from '../programs/identity';
import type { ProgramCtx } from '../programs/stream';

/** What a use of a value can be classified as; `filter` and `type-check` are found elsewhere. */
export type UseKind = Extract<
  UseSite['kind'],
  'lazy-render' | 'jsx-render' | 'hook-run' | 'call' | 'read'
>;

/** Files that declare plugin-core's helper components (or a copy of them). */
const PLUGIN_CORE_MODULE = /^packages\/plugin-core\/src\//;

/** Plugin-core helpers that do something with an extension value they are given, by prop. */
const HELPER_PROPS: Record<string, { prop: string; kind: UseKind }> = {
  LazyCodeRefComponent: { prop: 'component', kind: 'lazy-render' },
  HookNotify: { prop: 'useHook', kind: 'hook-run' },
};

/** The stronger of two classifications of one value: the order is the most specific first. */
const RANK: readonly UseKind[] = ['lazy-render', 'jsx-render', 'hook-run', 'call', 'read'];

const stronger = (a: UseKind, b: UseKind): UseKind => (RANK.indexOf(a) <= RANK.indexOf(b) ? a : b);

/** The outermost expression that only wraps `node` in parentheses, `as`, `satisfies` or `!`. */
export const outermostWrapper = (node: ts.Expression): ts.Expression => {
  let current = node;
  while (
    ts.isParenthesizedExpression(current.parent) ||
    ts.isAsExpression(current.parent) ||
    ts.isSatisfiesExpression(current.parent) ||
    ts.isNonNullExpression(current.parent)
  ) {
    current = current.parent;
  }
  return current;
};

/**
 * The plugin-core helper a JSX element renders, proven by resolving its tag to a declaration in
 * plugin-core with that name; `undefined` for any other element.
 */
const pluginCoreHelper = (
  element: ts.JsxOpeningLikeElement,
  ctx: ProgramCtx,
): { prop: string; kind: UseKind } | undefined => {
  const decl = calleeDeclaration(element, ctx.checker);
  const name = decl ? declaredName(decl) : undefined;
  if (!decl || name === undefined || !PLUGIN_CORE_MODULE.test(declLoc(decl, ctx).file)) {
    return undefined;
  }
  return Object.hasOwn(HELPER_PROPS, name) ? HELPER_PROPS[name] : undefined;
};

/** A call through a name that starts with `use` runs a hook (the rules-of-hooks convention). */
const callKind = (name: string | undefined): UseKind =>
  name !== undefined && /^use([A-Z0-9]|$)/.test(name) ? 'hook-run' : 'call';

/** The name a callee expression is written with: an identifier or the last property name. */
const calleeName = (expr: ts.Expression): string | undefined => {
  if (ts.isIdentifier(expr)) {
    return expr.text;
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return expr.name.text;
  }
  if (ts.isElementAccessExpression(expr) && ts.isStringLiteralLike(expr.argumentExpression)) {
    return expr.argumentExpression.text;
  }
  return undefined;
};

/** How the value of an expression is used where it is written, without following bindings. */
const directKind = (node: ts.Expression, ctx: ProgramCtx): UseKind | undefined => {
  const outer = outermostWrapper(node);
  const { parent } = outer;
  if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) {
    const attribute = parent.parent;
    const helper = pluginCoreHelper(attribute.parent.parent, ctx);
    return helper && ts.isIdentifier(attribute.name) && attribute.name.text === helper.prop
      ? helper.kind
      : undefined;
  }
  if (
    (ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) &&
    parent.tagName === node
  ) {
    return 'jsx-render';
  }
  if (ts.isCallExpression(parent) && parent.expression === outer) {
    return callKind(calleeName(node));
  }
  return undefined;
};

/**
 * How a local binding's value is used: every reference to it in the block that declares it,
 * classified where it is written, the most specific winning. A binding called through its own
 * name is a hook run when that name starts with `use`.
 */
const bindingKind = (name: ts.Identifier, ctx: ProgramCtx): UseKind => {
  const symbol = ctx.checker.getSymbolAtLocation(name);
  if (!symbol) {
    return 'read';
  }
  let kind: UseKind = 'read';
  const walk = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      node !== name &&
      ctx.checker.getSymbolAtLocation(node) === symbol
    ) {
      const found = directKind(node, ctx);
      if (found) {
        kind = stronger(kind, found);
      }
    }
    node.forEachChild(walk);
  };
  walk(
    ts.findAncestor(name.parent, (node) => ts.isBlock(node) || ts.isSourceFile(node)) ??
      name.getSourceFile(),
  );
  return kind;
};

/**
 * How a value read from an extension is used:
 * - `lazy-render` when it is the `component` of plugin-core's `LazyCodeRefComponent`;
 * - `jsx-render` when it is rendered as a JSX tag;
 * - `hook-run` when it is the `useHook` of plugin-core's `HookNotify`, or is called through a name
 *   starting with `use`;
 * - `call` when it is called;
 * - `read` otherwise.
 * A value bound to a local `const` (or a destructured name, passed as `binding`) is classified by
 * how that binding is used.
 */
export const classifyUse = (
  node: ts.Expression,
  ctx: ProgramCtx,
  binding?: ts.Identifier,
): UseKind => {
  if (binding) {
    return bindingKind(binding, ctx);
  }
  const direct = directKind(node, ctx);
  if (direct) {
    return direct;
  }
  const { parent } = outermostWrapper(node);
  if (
    ts.isVariableDeclaration(parent) &&
    ts.isIdentifier(parent.name) &&
    ts.isVariableDeclarationList(parent.parent) &&
    (parent.parent.flags & ts.NodeFlags.Const) !== 0
  ) {
    return bindingKind(parent.name, ctx);
  }
  return 'read';
};
