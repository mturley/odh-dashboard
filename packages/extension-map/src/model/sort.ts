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

const byLoc = (a: { loc: Loc }, b: { loc: Loc }): number =>
  byString(a.loc.file, b.loc.file) || a.loc.line - b.loc.line;

/** Diagnostics may carry no location; those sort first. */
const byOptionalLoc = (a: { loc?: Loc }, b: { loc?: Loc }): number => {
  const aFile = a.loc?.file ?? '';
  const bFile = b.loc?.file ?? '';
  return byString(aFile, bFile) || (a.loc?.line ?? 0) - (b.loc?.line ?? 0);
};

const sortPoint = (point: ExtensionPoint): ExtensionPoint => ({
  ...point,
  guards: point.guards.toSorted(byString),
  // properties stay in the point type's declared order
});

const sortGuard = (guard: Guard): Guard => ({
  ...guard,
  pointIds: guard.pointIds.toSorted(byString),
});

const sortExtension = (extension: ExtensionRecord): ExtensionRecord => ({
  ...extension,
  entries: extension.entries.toSorted(byString),
});

const sortConsumer = (consumer: Consumer): Consumer => ({
  ...consumer,
  renderedIn: consumer.renderedIn.toSorted(byLoc),
});

const sortCarriedType = (carried: CarriedType): CarriedType => ({
  ...carried,
  pointIds: carried.pointIds.toSorted(byString),
});

/**
 * Returns a model with every array sorted by its stable key (`id` / `key` /
 * `name` / `loc.file` + `loc.line`), so output is deterministic. Exceptions:
 * `App.entries` and `ExtensionPoint.properties` keep their order-significant
 * order.
 */
export const sortModel = (m: ExtensionMapModel): ExtensionMapModel => ({
  version: m.version,
  packages: m.packages.toSorted(byKey((p: Pkg) => p.name)),
  entries: m.entries.toSorted(byKey((e: Entry) => e.id)),
  apps: m.apps.toSorted(byKey((a: App) => a.id)), // App.entries stays in catalog order
  points: m.points.toSorted(byKey((p: ExtensionPoint) => p.id)).map(sortPoint),
  guards: m.guards.toSorted(byKey((g: Guard) => g.name)).map(sortGuard),
  extensions: m.extensions.toSorted(byKey((e: ExtensionRecord) => e.key)).map(sortExtension),
  overrides: m.overrides.toSorted(byKey((o: Override) => `${o.app}\0${o.by}\0${o.kind}`)),
  consumers: m.consumers.toSorted(byKey((c: Consumer) => c.id)).map(sortConsumer),
  querySites: m.querySites.toSorted(byLoc),
  useSites: m.useSites.toSorted(byLoc),
  carriedTypes: m.carriedTypes.toSorted(byKey((c: CarriedType) => c.name)).map(sortCarriedType),
  diagnostics: m.diagnostics.toSorted(
    (a: Diagnostic, b: Diagnostic) =>
      byOptionalLoc(a, b) || byString(a.code, b.code) || byString(a.message, b.message),
  ),
});
