import type { Diagnostic, ExtensionMapModel, Loc, UseSite } from './types';

const cmp = (a: string | number, b: string | number): number => {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
};

const byLoc =
  <T extends { loc: Loc }>(extra: (t: T) => string) =>
  (a: T, b: T): number =>
    cmp(a.loc.file, b.loc.file) || cmp(a.loc.line, b.loc.line) || cmp(extra(a), extra(b));

const byField =
  <T>(get: (t: T) => string) =>
  (a: T, b: T): number =>
    cmp(get(a), get(b));

const byDiagnostic = (a: Diagnostic, b: Diagnostic): number =>
  cmp(a.loc?.file ?? '', b.loc?.file ?? '') ||
  cmp(a.loc?.line ?? 0, b.loc?.line ?? 0) ||
  cmp(a.code, b.code) ||
  cmp(a.message, b.message);

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

/** Sorts every array by its stable key. `App.entries` stays in catalog order. */
export const sortModel = (m: ExtensionMapModel): ExtensionMapModel => ({
  version: m.version,
  packages: m.packages.toSorted(byField((p) => p.name)),
  entries: m.entries.toSorted(byField((e) => e.id)),
  apps: m.apps.toSorted(byField((a) => a.id)),
  points: m.points.toSorted(byField((p) => p.id)),
  guards: m.guards.toSorted(byLoc((g) => g.name)),
  extensions: m.extensions.toSorted(byField((e) => e.key)),
  overrides: m.overrides.toSorted(byField((o) => `${o.app}\0${o.by}`)),
  consumers: m.consumers.toSorted(byField((c) => c.id)),
  querySites: m.querySites.toSorted(byLoc((q) => q.consumer)),
  useSites: m.useSites.toSorted(byLoc<UseSite>((u) => `${u.consumer}\0${u.pointId}\0${u.path}`)),
  carriedTypes: m.carriedTypes.toSorted(byField((c) => c.name)),
  diagnostics: m.diagnostics.toSorted(byDiagnostic),
});
