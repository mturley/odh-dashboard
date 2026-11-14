import { discoverEntries } from './discovery/entries';
import { loadWorkspace } from './discovery/workspace';
import { emptyModel, sortModel } from './model/sort';
import type { ExtensionMapModel, WorkspacePackage } from './model/types';

export type AnalyzeOptions = {
  repoRoot: string;
  workspace?: WorkspacePackage[];
  /** Share parsed SourceFiles between programs. Defaults to true. */
  sourceCache?: boolean;
};

export const analyzeRepo = (opts: AnalyzeOptions): ExtensionMapModel => {
  const { sourceCache = true } = opts;
  void sourceCache;
  const workspace = opts.workspace ?? loadWorkspace(opts.repoRoot);
  const { entries, packages, diagnostics } = discoverEntries(workspace, opts.repoRoot);
  return sortModel({ ...emptyModel(), packages, entries, diagnostics });
};
