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
  return sortModel(emptyModel());
};
