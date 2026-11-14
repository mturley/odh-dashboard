import type { ExtensionMapModel, WorkspacePackage } from './model/types';
import { emptyModel, sortModel } from './model/sort';

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
 * Stub for now: returns the empty model until the collection passes land.
 */
export const analyzeRepo = (opts: AnalyzeOptions): ExtensionMapModel => {
  void opts;
  return sortModel(emptyModel());
};
