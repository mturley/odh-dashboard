import type {
  App,
  CarriedType,
  Consumer,
  Diagnostic,
  Entry,
  ExtensionMapModel,
  ExtensionRecord,
  ExtensionPoint,
  Guard,
  Loc,
  Override,
  Pkg,
  QuerySite,
  UseSite,
} from './types';

export const emptyModel = (): ExtensionMapModel => ({
  version: 1,
  packages: [],
  entries: [],
  apps: [],
  points: [],
  guards: [],
  extensions: [],
  overrides: [],
  consumers: [],
  querySites: [],
  useSites: [],
  carriedTypes: [],
  diagnostics: [],
});

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const byKey =
  <T>(key: (item: T) => string): ((a: T, b: T) => number) =>
  (a, b) =>
    byString(key(a), key(b));

const byLocValue = (a: Loc, b: Loc): number =>
  byString(a.file, b.file) || a.line - b.line || (a.endLine ?? a.line) - (b.endLine ?? b.line);

const byLoc = (a: { loc: Loc }, b: { loc: Loc }): number => byLocValue(a.loc, b.loc);

/** Diagnostics may carry no location; those sort first. */
const byOptionalLoc = (a: { loc?: Loc }, b: { loc?: Loc }): number => {
  const aFile = a.loc?.file ?? '';
  const bFile = b.loc?.file ?? '';
  return byString(aFile, bFile) || (a.loc?.line ?? 0) - (b.loc?.line ?? 0);
};

const byAppInclusion = (a: { app: string; via: string }, b: { app: string; via: string }): number =>
  byString(a.app, b.app) || byString(a.via, b.via);

const sortPkg = (pkg: Pkg): Pkg => ({
  ...pkg,
  upstreamDirs: pkg.upstreamDirs.toSorted(byString),
});

const sortPoint = (point: ExtensionPoint): ExtensionPoint => ({
  ...point,
  guards: point.guards.toSorted(byString),
  // typeParams and properties stay in declaration order
});

const sortGuard = (guard: Guard): Guard => ({
  ...guard,
  pointIds: guard.pointIds.toSorted(byString),
});

const sortExtension = (extension: ExtensionRecord): ExtensionRecord => ({
  ...extension,
  entries: extension.entries.toSorted(byString),
  apps: extension.apps.toSorted(byAppInclusion),
  // flags and mappedValues stay in source order
});

const sortOverride = (override: Override): Override => ({
  ...override,
  targets: override.targets.toSorted(byString),
  ignoredKeys: override.ignoredKeys?.toSorted(byString),
});

/** Overrides have no id/key/loc; sort by identity, then by (sorted) targets. */
const byOverride = (a: Override, b: Override): number =>
  byString(a.app, b.app) ||
  byString(a.by, b.by) ||
  byString(a.kind, b.kind) ||
  byString(a.targets.join('\0'), b.targets.join('\0'));

const sortConsumer = (consumer: Consumer): Consumer => ({
  ...consumer,
  renderedIn: consumer.renderedIn.toSorted(
    (a, b) => byLoc(a, b) || byString(a.symbol, b.symbol) || byString(a.how, b.how),
  ),
});

const sortQuerySite = (querySite: QuerySite): QuerySite => ({
  ...querySite,
  pointIds: querySite.pointIds.toSorted(byString),
});

const byQuerySite = (a: QuerySite, b: QuerySite): number =>
  byLoc(a, b) || byString(a.consumer, b.consumer) || byString(a.hook, b.hook);

const sortUseSite = (useSite: UseSite): UseSite => ({
  ...useSite,
  oneOf: useSite.oneOf?.toSorted(byString),
});

const byUseSite = (a: UseSite, b: UseSite): number =>
  byLoc(a, b) ||
  byString(a.consumer, b.consumer) ||
  byString(a.pointId, b.pointId) ||
  byString(a.path, b.path);

const sortCarriedType = (carried: CarriedType): CarriedType => ({
  ...carried,
  pointIds: carried.pointIds.toSorted(byString),
  builtOutsideExtensions: carried.builtOutsideExtensions.toSorted(byLocValue),
});

/**
 * Returns a model with every array sorted by its stable key (`id` / `key` /
 * `name` / `app` / `loc.file` + `loc.line`), with secondary keys breaking ties,
 * so output never depends on discovery order. Exceptions that keep their
 * order-significant order: `App.entries` (catalog), `ExtensionPoint.typeParams`
 * and `properties` (declaration), `Doc` arrays and source `Value` arrays
 * (`flags`, `mappedValues`, array/object values).
 */
export const sortModel = (m: ExtensionMapModel): ExtensionMapModel => ({
  version: m.version,
  packages: m.packages.toSorted(byKey((p: Pkg) => p.name)).map(sortPkg),
  entries: m.entries.toSorted(byKey((e: Entry) => e.id)),
  apps: m.apps.toSorted(byKey((a: App) => a.id)), // App.entries stays in catalog order
  points: m.points.toSorted(byKey((p: ExtensionPoint) => p.id)).map(sortPoint),
  guards: m.guards
    .toSorted((a: Guard, b: Guard) => byString(a.name, b.name) || byLoc(a, b))
    .map(sortGuard),
  extensions: m.extensions.toSorted(byKey((e: ExtensionRecord) => e.key)).map(sortExtension),
  overrides: m.overrides.map(sortOverride).toSorted(byOverride),
  consumers: m.consumers.toSorted(byKey((c: Consumer) => c.id)).map(sortConsumer),
  querySites: m.querySites.map(sortQuerySite).toSorted(byQuerySite),
  useSites: m.useSites.map(sortUseSite).toSorted(byUseSite),
  carriedTypes: m.carriedTypes
    .toSorted((a: CarriedType, b: CarriedType) => byString(a.name, b.name) || byLoc(a, b))
    .map(sortCarriedType),
  diagnostics: m.diagnostics.toSorted(
    (a: Diagnostic, b: Diagnostic) =>
      byOptionalLoc(a, b) || byString(a.code, b.code) || byString(a.message, b.message),
  ),
});
