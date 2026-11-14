import { discoverEntries } from './discovery/entries';
import { loadWorkspace } from './discovery/workspace';
import { pointsCollector } from './extract/points';
import { emptyModel, sortModel } from './model/sort';
import type { ExtensionMapModel, WorkspacePackage } from './model/types';
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

  // Pass A: definitions.
  const points = pointsCollector();
  const passA = runPass(opts.repoRoot, workspace, [points], {
    sourceCache: sourceCache ? createSourceFileCache() : undefined,
  });
  const found = points.finish();

  return sortModel({
    ...emptyModel(),
    packages,
    entries,
    points: found.points,
    guards: found.guards,
    diagnostics: [...diagnostics, ...passA, ...found.diagnostics],
  });
};
