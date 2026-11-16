import path from 'path';
import ts from 'typescript';
import { readDistributionConfig } from '../discovery/distribution';
import type { DistributionItem } from '../discovery/distribution';
import { hostFederatedMembers } from '../discovery/hostFederation';
import { CORE_PACKAGE, pkgForFile, relFile, toPosix } from '../discovery/workspace';
import { makeDiagnostic } from '../model/diagnostics';
import type {
  App,
  Diagnostic,
  Entry,
  ExtensionRecord,
  Loc,
  WorkspacePackage,
} from '../model/types';
import { locOf, resolveAlias } from '../programs/identity';
import type { Collector } from '../programs/stream';

const HOST = 'host';
const EXTENSIONS_EXPORT = './extensions';
const FEDERATED_KEY = 'mf:./extensions';
const EXTENSIONS_SUFFIX = '/extensions';

/** The package whose `loadRemote` loads a federated module at runtime. */
const RUNTIME_PACKAGE_DIR = '/node_modules/@module-federation/runtime/';

/** One call to `loadRemote` from `@module-federation/runtime`. */
export type LoadRemoteCall = {
  /** Repo-relative file of the call. */
  file: string;
  /** The first argument when it is a string literal, else `null`. */
  remote: string | null;
  /** Where the call is written. */
  loc: Loc;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * True when a symbol, through any aliases, is the `loadRemote` that the
 * `@module-federation/runtime` package declares.
 */
const isRuntimeLoadRemote = (symbol: ts.Symbol, checker: ts.TypeChecker): boolean => {
  const target = resolveAlias(checker, symbol);
  return (
    target.name === 'loadRemote' &&
    (target.declarations ?? []).some((decl) =>
      toPosix(decl.getSourceFile().fileName).includes(RUNTIME_PACKAGE_DIR),
    )
  );
};

/**
 * The symbol a callee names, without type-checking an arbitrary receiver: a bare name, or a
 * member of a namespace import (`mf.loadRemote`).
 */
const calleeSymbol = (callee: ts.Expression, checker: ts.TypeChecker): ts.Symbol | undefined => {
  if (ts.isIdentifier(callee)) {
    return checker.getSymbolAtLocation(callee);
  }
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
    const receiver = checker.getSymbolAtLocation(callee.expression);
    const target = receiver ? resolveAlias(checker, receiver) : undefined;
    return target && target.flags & ts.SymbolFlags.Module
      ? checker.getSymbolAtLocation(callee.name)
      : undefined;
  }
  return undefined;
};

/**
 * Finds every call to `loadRemote` from `@module-federation/runtime` (recognized by where the
 * callee's symbol is declared, not by its name), with its first argument when that is a literal.
 */
export const loadRemoteCollector = (): Collector<{ calls: LoadRemoteCall[] }> => {
  const calls: LoadRemoteCall[] = [];
  return {
    visit: (ctx) => {
      for (const file of ctx.ownedFiles) {
        if (file.isDeclarationFile) {
          continue;
        }
        const visit = (node: ts.Node): void => {
          if (ts.isCallExpression(node)) {
            const symbol = calleeSymbol(node.expression, ctx.checker);
            if (symbol && isRuntimeLoadRemote(symbol, ctx.checker)) {
              const arg = node.arguments.at(0);
              calls.push({
                file: relFile(ctx.repoRoot, file.fileName),
                remote:
                  arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))
                    ? arg.text
                    : null,
                loc: locOf(node, ctx),
              });
            }
          }
          ts.forEachChild(node, visit);
        };
        visit(file);
      }
    },
    finish: () => ({
      calls: calls.toSorted((a, b) =>
        a.loc.file === b.loc.file ? a.loc.line - b.loc.line : a.loc.file < b.loc.file ? -1 : 1,
      ),
    }),
  };
};

/**
 * `resolvePackages` of `generateDistributionExtensionsPlugin.js`: bundled, then local (then
 * env-injected, of which there are none), keeping only the last occurrence of each name.
 */
const resolvePackages = (
  bundled: DistributionItem[],
  local: DistributionItem[],
): DistributionItem[] => {
  const all = [...bundled, ...local];
  const lastIndex = new Map(all.map((item, index) => [item.name, index]));
  return all.filter((item, index) => lastIndex.get(item.name) === index);
};

/** `./extensions/static` for `extensions/static` or `./extensions/static`. */
const exportKey = (extensionsPath: string): string => `./${extensionsPath.replace(/^\.\//, '')}`;

/**
 * The apps that compose extensions: the host, and every distribution with a `distribution.yaml`.
 * Each app's entries are in catalog order; code-level `loadRemote('<remote>/extensions')` calls in
 * an app's own package add that remote's federated entry as a conditional one. Returns the
 * extensions with `apps` filled in.
 *
 * @param calls The `loadRemote` calls found in pass A.
 */
export const composeApps = (
  ws: WorkspacePackage[],
  repoRoot: string,
  entries: Entry[],
  extensions: ExtensionRecord[],
  calls: LoadRemoteCall[],
): { apps: App[]; extensions: ExtensionRecord[]; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];
  const entryIds = new Set(entries.map((entry) => entry.id));
  const displayOf = (pkg: WorkspacePackage): string => pkgForFile(pkg.dir, ws) ?? pkg.name;

  // The host: static entries in `discoverPluginPackages` order, then the federated entries of
  // the members it loads, by package name.
  const hostEntries: App['entries'] = [];
  const addOnce = (list: App['entries'], entry: string): void => {
    if (entryIds.has(entry) && !list.some((item) => item.entry === entry)) {
      list.push({ entry });
    }
  };
  ws.filter(
    (pkg) =>
      isRecord(pkg.packageJson.exports) && pkg.packageJson.exports[EXTENSIONS_EXPORT] !== undefined,
  ).forEach((pkg) => addOnce(hostEntries, `${displayOf(pkg)}#${EXTENSIONS_EXPORT}`));
  hostFederatedMembers(ws, repoRoot)
    .filter((member) => member.loaded)
    .map((member) => member.pkg)
    .toSorted()
    .forEach((pkg) => addOnce(hostEntries, `${pkg}#${FEDERATED_KEY}`));
  // A workspace with neither the core app nor anything the host would load has no host.
  const hasHost = hostEntries.length > 0 || ws.some((pkg) => pkg.name === CORE_PACKAGE);
  const apps: { app: App; pkg: string }[] = hasHost
    ? [{ app: { id: HOST, entries: hostEntries, featureFlags: {} }, pkg: CORE_PACKAGE }]
    : [];

  // The distributions.
  for (const pkg of ws) {
    const display = displayOf(pkg);
    const config = pkg.dir.startsWith('distributions/')
      ? readDistributionConfig(pkg.dir, repoRoot)
      : undefined;
    if (!config || display !== pkg.name) {
      continue;
    }
    const id = config.name ?? path.posix.basename(pkg.dir);
    const featureFlags: Record<string, boolean> = { ...config.featureFlags };
    const appEntries: App['entries'] = [];
    resolvePackages(config.bundled, config.local).forEach((item) => {
      Object.assign(featureFlags, item.featureFlags);
      if (item.local) {
        // A local entry that resolves to no file is reported by entry discovery.
        addOnce(appEntries, `${display}#local:${item.extensionsPath}`);
        return;
      }
      const bundledPkg = ws.find((candidate) => candidate.name === item.name);
      const entry = bundledPkg
        ? `${displayOf(bundledPkg)}#${exportKey(item.extensionsPath)}`
        : undefined;
      if (entry && entryIds.has(entry)) {
        addOnce(appEntries, entry);
        return;
      }
      diagnostics.push(
        makeDiagnostic(
          'unresolved-distribution',
          `${id} bundles ${item.name} at ${item.extensionsPath}, but ${
            bundledPkg
              ? 'that package exports no such extensions entry'
              : 'no workspace package has that name'
          }.`,
          { file: `${pkg.dir}/distribution.yaml`, line: 1 },
          display,
        ),
      );
    });
    apps.push({ app: { id, entries: appEntries, featureFlags }, pkg: display });
  }

  // Code-level remote loads in each app's own package.
  const remoteNames = new Map<string, string>();
  ws.forEach((pkg) => {
    const config = pkg.packageJson['module-federation'];
    if (isRecord(config) && typeof config.name === 'string') {
      remoteNames.set(config.name, displayOf(pkg));
    }
  });
  calls.forEach((call) => {
    const owner = apps.find(({ pkg }) => pkgForFile(call.file, ws) === pkg);
    if (!owner) {
      return;
    }
    if (call.remote === null) {
      diagnostics.push(
        makeDiagnostic(
          'unresolved-loadremote',
          `${owner.app.id} calls loadRemote with an argument that is not a string literal, so what it loads is unknown.`,
          call.loc,
          owner.pkg,
        ),
      );
      return;
    }
    if (!call.remote.endsWith(EXTENSIONS_SUFFIX)) {
      return;
    }
    const remote = call.remote.slice(0, -EXTENSIONS_SUFFIX.length);
    const pkg = remoteNames.get(remote);
    const entry = pkg ? `${pkg}#${FEDERATED_KEY}` : undefined;
    if (!entry || !entryIds.has(entry)) {
      diagnostics.push(
        makeDiagnostic(
          'unresolved-loadremote',
          `${owner.app.id} loads '${call.remote}', but ${
            pkg
              ? `${pkg} has no federated extensions entry`
              : `no workspace package is the remote '${remote}'`
          }.`,
          call.loc,
          owner.pkg,
        ),
      );
      return;
    }
    if (!owner.app.entries.some((item) => item.entry === entry)) {
      owner.app.entries.push({ entry, conditional: call.loc });
    }
  });

  const composed = apps.map(({ app }) => app);
  const withApps = extensions.map((record) => ({
    ...record,
    apps: composed
      .flatMap((app) =>
        app.entries
          .filter((item) => record.entries.includes(item.entry))
          .map((item) => ({
            app: app.id,
            via: item.entry,
            ...(item.conditional ? { conditional: true as const } : {}),
          })),
      )
      .toSorted((a, b) => (a.app === b.app ? (a.via < b.via ? -1 : 1) : a.app < b.app ? -1 : 1)),
  }));
  return { apps: composed, extensions: withApps, diagnostics };
};

/**
 * One app's catalog: the extensions of its entries, entry by entry in catalog order, each entry's
 * extensions in the order its array registers them.
 *
 * @param order Per entry, the record keys in registration order (from the extensions collector).
 */
export const catalogOf = (
  app: App,
  extensions: ExtensionRecord[],
  order: Record<string, string[]>,
): ExtensionRecord[] => {
  const byKey = new Map(extensions.map((record) => [record.key, record]));
  return app.entries.flatMap((item) =>
    (Object.hasOwn(order, item.entry) ? order[item.entry] : []).flatMap((key) => {
      const record = byKey.get(key);
      return record ? [record] : [];
    }),
  );
};
