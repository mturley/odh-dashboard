import type { ExtensionMapModel, WorkspacePackage } from './model/types';
import { emptyModel, sortModel } from './model/sort';
import { discoverEntries } from './discovery/entries';
import { keptWorkspacePackages, loadWorkspace } from './discovery/workspace';

export type AnalyzeOptions = {
  repoRoot: string;
  /** Workspace packages as data; discovered from `repoRoot` when omitted. */
  workspace?: WorkspacePackage[];
  /**
   * Share `ts.SourceFile`s across programs. A preference: `false` always
   * disables the cache; `true` requests it but a safe memory budget may still
   * select uncached; omitted auto-selects by available memory.
   */
  sourceCache?: boolean;
};

/**
 * Analyzes the repo into an `ExtensionMapModel`.
 *
 * Discovery passes land incrementally; the collection passes (programs,
 * entries' extensions) are still to come.
 */
export const analyzeRepo = (opts: AnalyzeOptions): ExtensionMapModel => {
  const ws = keptWorkspacePackages(opts.workspace ?? loadWorkspace(opts.repoRoot));
  const { entries, packages, diagnostics } = discoverEntries(ws, opts.repoRoot);
  return sortModel({ ...emptyModel(), entries, packages, diagnostics });
};
