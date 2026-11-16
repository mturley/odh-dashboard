import type { ExtensionMapModel, WorkspacePackage } from './model/types';
import { emptyModel, sortModel } from './model/sort';
import { discoverEntries } from './discovery/entries';
import { keptWorkspacePackages, loadWorkspace } from './discovery/workspace';
import { pointsCollector } from './extract/points';
import { extensionsCollector } from './extract/extensionCollector';
import { runPass } from './programs/stream';
import { createSourceFileCache } from './programs/sourceCache';
import { cacheModeFor } from './runtime/memory';
import { makeDiagnostic } from './model/diagnostics';

export type AnalyzeOptions = {
  repoRoot: string;
  /** Workspace packages as data; discovered from `repoRoot` when omitted. */
  workspace?: WorkspacePackage[];
  /**
   * Share `ts.SourceFile`s across programs. A preference: `false` always
   * disables the cache; `true` requests it but a safe memory budget may still
   * select uncached (unknown availability is always uncached); omitted
   * auto-selects by available memory.
   */
  sourceCache?: boolean;
  /** Test seam replacing `process.availableMemory()` for the cache decision. */
  availableMemory?: () => number | undefined;
};

/** Reads process-available memory, which the OS may not report. */
const readAvailableMemory = (): number | undefined => process.availableMemory();

/**
 * Whether one analysis run uses the shared source cache — the runtime memory
 * policy (`cacheModeFor`) is the single decision source, so the in-process
 * analyzer and the isolated runner can never disagree.
 */
export const analysisSourceCache = (
  preference: boolean | undefined,
  availableMemory: () => number | undefined,
): boolean => cacheModeFor(availableMemory(), preference) === 'cached';

/**
 * Analyzes the repo into an `ExtensionMapModel`.
 *
 * Pass A streams one program per tsconfig and extracts extension points,
 * guards, point JSDoc and entry extensions.
 */
export const analyzeRepo = (opts: AnalyzeOptions): ExtensionMapModel => {
  const ws = keptWorkspacePackages(opts.workspace ?? loadWorkspace(opts.repoRoot));
  const { entries, packages, diagnostics } = discoverEntries(ws, opts.repoRoot);

  const points = pointsCollector();
  const extensions = extensionsCollector(entries);
  const availableMemory = opts.availableMemory ?? readAvailableMemory;
  const sourceCache = analysisSourceCache(opts.sourceCache, availableMemory)
    ? createSourceFileCache()
    : undefined;
  const passDiagnostics = runPass(
    opts.repoRoot,
    ws,
    [points, extensions],
    sourceCache === undefined ? {} : { sourceCache },
  );
  const { points: extractedPoints, guards, diagnostics: pointDiagnostics } = points.finish();
  const { extensions: extractedExtensions, diagnostics: extensionDiagnostics } =
    extensions.finish();
  const knownPointIds = new Set(extractedPoints.map((point) => point.id));
  const unknownPointDiagnostics = extractedExtensions.flatMap((extension) =>
    knownPointIds.has(extension.type)
      ? []
      : [
          makeDiagnostic(
            'extension-unknown-point',
            `extension '${extension.type}' does not match a declared extension point`,
            extension.loc,
            extension.pkg,
          ),
        ],
  );

  return sortModel({
    ...emptyModel(),
    entries,
    packages,
    points: extractedPoints,
    guards,
    extensions: extractedExtensions,
    diagnostics: [
      ...diagnostics,
      ...passDiagnostics,
      ...pointDiagnostics,
      ...extensionDiagnostics,
      ...unknownPointDiagnostics,
    ],
  });
};
