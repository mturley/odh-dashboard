import type { ExtensionMapModel, WorkspacePackage } from './model/types';
import { emptyModel, sortModel } from './model/sort';
import { discoverEntries } from './discovery/entries';
import { keptWorkspacePackages, loadWorkspace } from './discovery/workspace';
import { pointsCollector } from './extract/points';
import { runPass } from './programs/stream';
import { createSourceFileCache } from './programs/sourceCache';
import { CACHED_MODE_THRESHOLD_BYTES } from './runtime/memory';

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
 * Whether the shared source cache is used: `false` always disables it; `true`
 * and omitted are subject to the same safe available-memory threshold the
 * isolated CLI child uses, and an explicit request is honored when the OS
 * reports no usable availability figure.
 */
const useSharedSourceCache = (preference: boolean | undefined): boolean => {
  if (preference === false) {
    return false;
  }
  const available = process.availableMemory();
  if (typeof available !== 'number' || !Number.isFinite(available) || available <= 0) {
    return preference === true;
  }
  return available >= CACHED_MODE_THRESHOLD_BYTES;
};

/**
 * Analyzes the repo into an `ExtensionMapModel`.
 *
 * Pass A streams one program per tsconfig and extracts extension points,
 * guards and point JSDoc. Pass B (uses) and the entry extension walk are
 * still to come.
 */
export const analyzeRepo = (opts: AnalyzeOptions): ExtensionMapModel => {
  const ws = keptWorkspacePackages(opts.workspace ?? loadWorkspace(opts.repoRoot));
  const { entries, packages, diagnostics } = discoverEntries(ws, opts.repoRoot);

  const points = pointsCollector();
  const passDiagnostics = runPass(
    opts.repoRoot,
    ws,
    [points],
    useSharedSourceCache(opts.sourceCache) ? { sourceCache: createSourceFileCache() } : {},
  );
  const { points: extractedPoints, guards, diagnostics: collectorDiagnostics } = points.finish();

  return sortModel({
    ...emptyModel(),
    entries,
    packages,
    points: extractedPoints,
    guards,
    diagnostics: [...diagnostics, ...passDiagnostics, ...collectorDiagnostics],
  });
};
