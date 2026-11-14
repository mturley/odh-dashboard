import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { cachingHost, createHost } from './sourceCache';
import type { SourceFileCache } from './sourceCache';
import { isExcludedPath, relFile, toPosix } from '../discovery/workspace';
import type { Diagnostic, WorkspacePackage } from '../model/types';

/** One program, with the files it alone is responsible for analyzing. */
export type ProgramCtx = {
  repoRoot: string;
  /** Absolute path of the tsconfig this program was built from. */
  tsconfig: string;
  /** Absolute path of the tsconfig's directory. */
  dir: string;
  program: ts.Program;
  checker: ts.TypeChecker;
  ownedFiles: ts.SourceFile[];
  ws: WorkspacePackage[];
  diagnostics: Diagnostic[];
};

/**
 * One unit of analysis. `visit` is called once per program and may only keep plain data;
 * no `ts.Node`, `ts.Type`, `ts.Symbol` or `ts.SourceFile` may outlive its program.
 */
export type Collector<R> = {
  visit: (ctx: ProgramCtx) => void;
  finish: () => R;
};

/** Repo-relative paths of every in-scope `tsconfig.json` under the workspace packages. */
export const findTsconfigs = (repoRoot: string, ws: WorkspacePackage[]): string[] => {
  const dirs = ws.map((pkg) => toPosix(pkg.dir));
  const roots = dirs.filter((dir) => !dirs.some((other) => dir.startsWith(`${other}/`)));
  const found = new Set<string>();
  const walk = (relDir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(repoRoot, relDir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = `${relDir}/${entry.name}`;
      if (isExcludedPath(rel)) {
        continue;
      }
      if (entry.isDirectory()) {
        walk(rel);
      } else if (entry.name === 'tsconfig.json') {
        found.add(rel);
      }
    }
  };
  roots.forEach(walk);
  const depth = (file: string): number => {
    const dir = path.posix.dirname(file);
    return dir === '.' ? 0 : dir.split('/').length;
  };
  return [...found].toSorted((a, b) => depth(b) - depth(a) || a.localeCompare(b));
};

const parseConfig = (configPath: string): ts.ParsedCommandLine | undefined =>
  ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => undefined,
    },
  );

/**
 * Collects the released program before the next one is built. Without this V8 defers collection
 * and the peak RSS of a pass is about 0.8 GB higher; it only works under `--expose-gc`.
 */
const releaseProgram = (): void => {
  if (typeof gc === 'function') {
    gc();
  }
};

/**
 * Builds one program, hands it to every collector, and returns with no reference to it left.
 * Files already claimed by a deeper program are not visited again.
 */
const visitProgram = (
  repoRoot: string,
  configPath: string,
  ws: WorkspacePackage[],
  collectors: Collector<unknown>[],
  claimed: Set<string>,
  diagnostics: Diagnostic[],
  sourceCache: SourceFileCache | undefined,
): void => {
  const parsed = parseConfig(configPath);
  if (!parsed) {
    return;
  }
  const options: ts.CompilerOptions = { ...parsed.options, noEmit: true };
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options,
    host: sourceCache ? cachingHost(options, sourceCache) : createHost(options),
    projectReferences: parsed.projectReferences,
  });
  const dir = path.dirname(configPath);
  const prefix = `${toPosix(dir)}/`;
  const claimedFiles: ts.SourceFile[] = [];
  for (const file of program.getSourceFiles()) {
    const rel = relFile(repoRoot, file.fileName);
    const owned =
      !file.isDeclarationFile &&
      toPosix(file.fileName).startsWith(prefix) &&
      !isExcludedPath(rel) &&
      !claimed.has(rel);
    if (owned) {
      claimed.add(rel);
      claimedFiles.push(file);
    }
  }
  const ownedFiles = claimedFiles.toSorted((a, b) => a.fileName.localeCompare(b.fileName));
  const ctx: ProgramCtx = {
    repoRoot,
    tsconfig: configPath,
    dir,
    program,
    checker: program.getTypeChecker(),
    ownedFiles,
    ws,
    diagnostics,
  };
  collectors.forEach((collector) => collector.visit(ctx));
};

/**
 * Streams one program per in-scope tsconfig, deepest directory first, so that every source file
 * is analyzed exactly once by the deepest program that includes it. Only one program is alive at
 * a time. Returns the diagnostics the collectors appended.
 */
export const runPass = (
  repoRoot: string,
  ws: WorkspacePackage[],
  collectors: Collector<unknown>[],
  opts: { sourceCache?: SourceFileCache },
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const claimed = new Set<string>();
  for (const config of findTsconfigs(repoRoot, ws)) {
    visitProgram(
      repoRoot,
      path.join(repoRoot, config),
      ws,
      collectors,
      claimed,
      diagnostics,
      opts.sourceCache,
    );
    releaseProgram();
  }
  return diagnostics;
};
