import { catalogOf, composeApps, loadRemoteCollector } from './composition/apps';
import { applyOverrides } from './composition/overrides';
import { discoverEntries } from './discovery/entries';
import { loadWorkspace } from './discovery/workspace';
import { extensionsCollector } from './extract/extensionRecords';
import { pointsCollector } from './extract/points';
import { makeDiagnostic } from './model/diagnostics';
import { emptyModel, sortModel } from './model/sort';
import type { Diagnostic, ExtensionMapModel, WorkspacePackage } from './model/types';
import { createSourceFileCache } from './programs/sourceCache';
import { runPass } from './programs/stream';

export type AnalyzeOptions = {
  repoRoot: string;
  workspace?: WorkspacePackage[];
  /** Share parsed SourceFiles between programs. Defaults to true. */
  sourceCache?: boolean;
};

export const analyzeRepo = (opts: AnalyzeOptions): ExtensionMapModel => {
  const { sourceCache = true } = opts;
  const workspace = opts.workspace ?? loadWorkspace(opts.repoRoot);
  const { entries, packages, diagnostics } = discoverEntries(workspace, opts.repoRoot);

  // Pass A: definitions. Every collector shares the one walk over the repo.
  const points = pointsCollector();
  const extensions = extensionsCollector(entries);
  const remoteLoads = loadRemoteCollector();
  const passA = runPass(opts.repoRoot, workspace, [points, extensions, remoteLoads], {
    sourceCache: sourceCache ? createSourceFileCache() : undefined,
    extraRoots: entries.map((entry) => entry.file),
  });
  const found = points.finish();
  const contributed = extensions.finish();

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
  const pointIds = new Set(found.points.map((point) => point.id));
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
    diagnostics: [
      ...diagnostics,
      ...passA,
      ...found.diagnostics,
      ...contributed.diagnostics,
      ...unknownPoints,
      ...composed.diagnostics,
      ...resolved.flatMap((result) => result.diagnostics),
    ],
  });
};
