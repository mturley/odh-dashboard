import ts from 'typescript';
import { relFile } from '../discovery/workspace';
import { predicateInfo } from '../programs/identity';
import type { ProgramCtx } from '../programs/stream';

/** A hook that fetches extensions from the plugin store, given a guard as its first argument. */
export type QueryHook = {
  /** The name the hook is declared with. */
  name: string;
  /** Matches the repo-relative path of a file allowed to declare it. */
  module: RegExp;
  /** True when the hook resolves code references before returning extensions. */
  resolved: boolean;
};

/** The plugin SDK, however it is installed, or plugin-core's own re-exports and copies of it. */
const QUERY_HOOK_MODULE = /\/@openshift\/dynamic-plugin-sdk\/|^packages\/plugin-core\/src\/core\//;

/**
 * The hooks that query the plugin store. A callee is one of these only when its declaration has
 * this name and sits in one of these modules: a local function that happens to share the name is
 * not a query hook. Adding a hook is one line here.
 */
export const QUERY_HOOKS: readonly QueryHook[] = [
  { name: 'useExtensions', module: QUERY_HOOK_MODULE, resolved: false },
  { name: 'useResolvedExtensions', module: QUERY_HOOK_MODULE, resolved: true },
];

/** The name a function or variable declaration declares, when it declares a plain identifier. */
export const declaredName = (decl: ts.Node): string | undefined => {
  if (
    (ts.isFunctionDeclaration(decl) ||
      ts.isVariableDeclaration(decl) ||
      ts.isMethodDeclaration(decl) ||
      ts.isPropertyDeclaration(decl) ||
      ts.isClassDeclaration(decl)) &&
    decl.name &&
    ts.isIdentifier(decl.name)
  ) {
    return decl.name.text;
  }
  return undefined;
};

/** The query hook a declaration is, proven by its name and the module that declares it. */
export const queryHookOf = (decl: ts.Node, ctx: ProgramCtx): QueryHook | undefined => {
  const name = declaredName(decl);
  if (name === undefined) {
    return undefined;
  }
  const file = relFile(ctx.repoRoot, decl.getSourceFile().fileName);
  return QUERY_HOOKS.find((hook) => hook.name === name && hook.module.test(file));
};

/**
 * The extension point IDs an expression selects when it is a guard: its type has a call
 * signature whose type predicate narrows to an extension-shaped type. The same rule as for a
 * declared guard applies (see `pointsCollector`): the narrowed parameter must be the SDK's
 * generic `Extension`, or a union of `known` points only, so a predicate over some other union
 * that happens to carry `type` and `properties` is not a guard. The IDs are returned whether or
 * not they name known points.
 */
export const guardPointIds = (
  expr: ts.Expression,
  ctx: ProgramCtx,
  known: ReadonlySet<string>,
): string[] | undefined => {
  const type = ctx.checker.getTypeAtLocation(expr);
  if (type.getCallSignatures().length === 0) {
    return undefined;
  }
  const info = predicateInfo(type, ctx.checker);
  if (!info) {
    return undefined;
  }
  const isGuard = info.paramGeneric || (info.paramIds?.every((id) => known.has(id)) ?? false);
  return isGuard ? info.targetIds : undefined;
};
