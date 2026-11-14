import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { cachingHost, createHost } from './sourceCache';
import type { SourceFileCache } from './sourceCache';
import { isExcludedPath, pkgForFile, relFile, toPosix } from '../discovery/workspace';
import { makeDiagnostic } from '../model/diagnostics';
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

/** "No inputs were found in config file": an empty program is not an analysis failure. */
const NO_INPUTS_FOUND = 18003;

const messageOf = (diagnostic: ts.Diagnostic): string =>
  ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');

/**
 * Parses a tsconfig, reporting every error it carries. A tsconfig that cannot be parsed, or whose
 * `extends` chain is broken, would otherwise drop a whole package from the map without a trace.
 */
const parseConfig = (
  configPath: string,
  report: (message: string) => void,
): ts.ParsedCommandLine | undefined => {
  const messages: string[] = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => messages.push(messageOf(diagnostic)),
    },
  );
  if (parsed) {
    parsed.errors
      .filter((error) => error.code !== NO_INPUTS_FOUND)
      .forEach((error) => messages.push(messageOf(error)));
  } else if (messages.length === 0) {
    messages.push('The TypeScript configuration file could not be read.');
  }
  messages.forEach(report);
  return parsed;
};

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
  extraRoots: readonly string[],
): void => {
  const loc = { file: relFile(repoRoot, configPath), line: 1 };
  const parsed = parseConfig(configPath, (message) => {
    diagnostics.push(makeDiagnostic('tsconfig-error', message, loc, pkgForFile(loc.file, ws)));
  });
  if (!parsed) {
    return;
  }
  const dir = path.dirname(configPath);
  const prefix = `${toPosix(dir)}/`;
  // A file a caller insists on (an entry module) that this tsconfig excludes would otherwise
  // belong to no program at all, and so would never be analyzed: some packages exclude their
  // federated entry module from type-checking. Adding it as a root keeps it in the deepest
  // program under its directory, which is the program that then claims it.
  const roots = new Set(parsed.fileNames.map(toPosix));
  for (const extra of extraRoots) {
    const absolute = toPosix(path.join(repoRoot, extra));
    if (absolute.startsWith(prefix) && !roots.has(absolute) && fs.existsSync(absolute)) {
      roots.add(absolute);
    }
  }
  const options: ts.CompilerOptions = { ...parsed.options, noEmit: true };
  const program = ts.createProgram({
    rootNames: [...roots],
    options,
    host: sourceCache ? cachingHost(options, sourceCache) : createHost(options),
    projectReferences: parsed.projectReferences,
  });
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
 * a time. `extraRoots` names repo-relative files that must be in a program even when their own
 * tsconfig excludes them. Returns the diagnostics the collectors appended.
 */
export const runPass = (
  repoRoot: string,
  ws: WorkspacePackage[],
  collectors: Collector<unknown>[],
  opts: { sourceCache?: SourceFileCache; extraRoots?: readonly string[] },
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
      opts.extraRoots ?? [],
    );
    releaseProgram();
  }
  return diagnostics;
};
