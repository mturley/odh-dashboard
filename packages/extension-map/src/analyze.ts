import { catalogOf, composeApps, loadRemoteCollector } from './composition/apps';
import { applyOverrides } from './composition/overrides';
import { sitesCollector } from './consumers/sites';
import { forwardingCollector, resolveWrappers } from './consumers/wrappers';
import { discoverEntries } from './discovery/entries';
import { loadWorkspace } from './discovery/workspace';
import { extensionsCollector } from './extract/extensionRecords';
import { pointsCollector } from './extract/points';
import { makeDiagnostic } from './model/diagnostics';
import { emptyModel, sortModel } from './model/sort';
import type {
  Consumer,
  Diagnostic,
  ExtensionMapModel,
  ExtensionPoint,
  ExtensionRecord,
  QuerySite,
  UseSite,
  WorkspacePackage,
} from './model/types';
import { createSourceFileCache } from './programs/sourceCache';
import { runPass } from './programs/stream';

export type AnalyzeOptions = {
  repoRoot: string;
  workspace?: WorkspacePackage[];
  /** Share parsed SourceFiles between programs. Defaults to true. */
  sourceCache?: boolean;
};

/** Where each consumer symbol is rendered or called, one hop up, from the reference index. */
const withRenderedIn = (
  consumers: Consumer[],
  refs: Map<string, Consumer['renderedIn']>,
  consumerKeys: Map<string, string>,
): Consumer[] =>
  consumers.map((consumer) => {
    const key = consumerKeys.get(consumer.id);
    const found = key === undefined ? [] : refs.get(key) ?? [];
    const unique = new Map(
      found.map((ref) => [`${ref.loc.file}\0${ref.loc.line}\0${ref.symbol}\0${ref.how}`, ref]),
    );
    return {
      ...consumer,
      renderedIn: [...unique.values()].toSorted(
        (a, b) =>
          a.loc.file.localeCompare(b.loc.file) ||
          a.loc.line - b.loc.line ||
          a.symbol.localeCompare(b.symbol),
      ),
    };
  });

/**
 * Points nothing uses: `point-unused` when nothing contributes to a point and nothing queries or
 * uses it, else `point-no-contributors` or `point-no-consumers` for the side that is missing.
 */
const pointUsage = (
  points: ExtensionPoint[],
  extensions: ExtensionRecord[],
  querySites: QuerySite[],
  useSites: UseSite[],
): Diagnostic[] => {
  const contributed = new Set(extensions.map((record) => record.type));
  const consumed = new Set([
    ...querySites.flatMap((site) => site.pointIds),
    ...useSites.map((site) => site.pointId),
  ]);
  return points.flatMap((point) => {
    const hasContributors = contributed.has(point.id);
    const hasConsumers = consumed.has(point.id);
    if (!hasContributors && !hasConsumers) {
      return [
        makeDiagnostic(
          'point-unused',
          `Nothing in this repository contributes an extension of '${point.id}' or queries or uses it.`,
          point.loc,
          point.pkg,
          point.id,
        ),
      ];
    }
    if (!hasContributors) {
      return [
        makeDiagnostic(
          'point-no-contributors',
          `No package in this repository contributes an extension of '${point.id}'.`,
          point.loc,
          point.pkg,
          point.id,
        ),
      ];
    }
    return hasConsumers
      ? []
      : [
          makeDiagnostic(
            'point-no-consumers',
            `No code in this repository queries or uses extensions of '${point.id}'.`,
            point.loc,
            point.pkg,
            point.id,
          ),
        ];
  });
};

export const analyzeRepo = (opts: AnalyzeOptions): ExtensionMapModel => {
  const { sourceCache = true } = opts;
  const workspace = opts.workspace ?? loadWorkspace(opts.repoRoot);
  const { entries, packages, diagnostics } = discoverEntries(workspace, opts.repoRoot);

  // Pass A: definitions. Every collector shares the one walk over the repo.
  const points = pointsCollector();
  const extensions = extensionsCollector(entries);
  const remoteLoads = loadRemoteCollector();
  const forwarding = forwardingCollector();
  const passOpts = {
    sourceCache: sourceCache ? createSourceFileCache() : undefined,
    extraRoots: entries.map((entry) => entry.file),
  };
  const passA = runPass(
    opts.repoRoot,
    workspace,
    [points, extensions, remoteLoads, forwarding],
    passOpts,
  );
  const found = points.finish();
  const contributed = extensions.finish();
  const pointIds = new Set(found.points.map((point) => point.id));

  // Pass B: uses. Query sites need every point and every wrapper, which only pass A can supply.
  const sites = sitesCollector({
    pointIds,
    pointFiles: new Set([
      ...found.points.map((point) => point.loc.file),
      ...found.guards.map((guard) => guard.loc.file),
    ]),
    wrappers: resolveWrappers(forwarding.finish()),
    carried: new Map(),
  });
  const passB = runPass(opts.repoRoot, workspace, [sites], passOpts);
  const used = sites.finish();
  // Both passes build the same programs, so a tsconfig error or a stale @mf-types copy is found
  // twice: keep pass B's own findings only.
  const seenInPassA = new Set(passA.map((diagnostic) => JSON.stringify(diagnostic)));
  const passBOnly = passB.filter((diagnostic) => !seenInPassA.has(JSON.stringify(diagnostic)));

  // App composition: which apps include each extension, and what their overrides do.
  const composed = composeApps(
    workspace,
    opts.repoRoot,
    entries,
    contributed.extensions,
    remoteLoads.finish().calls,
  );
  const resolved = composed.apps.map((app) =>
    applyOverrides(app, catalogOf(app, composed.extensions, contributed.order)),
  );

  // An extension whose type matches no declared point is the safety net on both collectors.
  const unknownPoints: Diagnostic[] = contributed.extensions
    .filter((extension) => !pointIds.has(extension.type))
    .map((extension) =>
      makeDiagnostic(
        'extension-unknown-point',
        `Extension of type '${extension.type}' matches no declared extension point.`,
        extension.loc,
        extension.pkg,
      ),
    );

  return sortModel({
    ...emptyModel(),
    packages,
    entries,
    points: found.points,
    guards: found.guards,
    apps: composed.apps,
    extensions: composed.extensions,
    overrides: resolved.flatMap((result) => result.overrides),
    consumers: withRenderedIn(used.consumers, used.refs, used.consumerKeys),
    querySites: used.querySites,
    useSites: used.useSites,
    diagnostics: [
      ...diagnostics,
      ...passA,
      ...found.diagnostics,
      ...contributed.diagnostics,
      ...unknownPoints,
      ...composed.diagnostics,
      ...resolved.flatMap((result) => result.diagnostics),
      ...passBOnly,
      ...used.diagnostics,
      ...pointUsage(found.points, contributed.extensions, used.querySites, used.useSites),
    ],
  });
};
