import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { cachingHost } from './sourceCache';
import type { SourceFileCache } from './sourceCache';
import {
  hasExcludedSegment,
  isExcludedDirSegment,
  isTestFilePattern,
  keptWorkspacePackages,
  toRelPosix,
} from '../discovery/workspace';
import { isDirectory } from '../discovery/hostFederation';
import { makeDiagnostic } from '../model/diagnostics';
import type { Diagnostic, WorkspacePackage } from '../model/types';

/** One streamed tsconfig program, plus everything a collector may need from it. */
export type ProgramCtx = {
  repoRoot: string;
  tsconfig: string;
  dir: string;
  program: ts.Program;
  checker: ts.TypeChecker;
  ownedFiles: ts.SourceFile[];
  ws: WorkspacePackage[];
  diagnostics: Diagnostic[];
};

/**
 * A pass visitor. `visit` runs once per program, deepest tsconfig first.
 * Collectors keep only plain data (keys, `Loc`s, strings): no `ts.Node`,
 * `ts.Type`, `ts.Symbol` or `ts.SourceFile` may outlive its `visit` — the
 * dedicated source cache is the only allowed exception.
 */
export type Collector<R> = {
  visit: (ctx: ProgramCtx) => void;
  finish: () => R;
};

export type RunPassOptions = { sourceCache?: SourceFileCache };

const findTsconfigs = (dir: string, found: Set<string>): void => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!isExcludedDirSegment(entry.name)) {
        findTsconfigs(path.join(dir, entry.name), found);
      }
    } else if (entry.isFile() && entry.name === 'tsconfig.json') {
      found.add(path.join(dir, entry.name));
    }
  }
};

/** Deepest directory first, then by path. */
const byDepthThenPath = (a: string, b: string): number => {
  const depth = (p: string): number => p.split(path.sep).length;
  return depth(b) - depth(a) || (a < b ? -1 : a > b ? 1 : 0);
};

type ParsedTsconfig = { options: ts.CompilerOptions; fileNames: string[] };

const parseTsconfig = (
  tsconfig: string,
): { parsed: ParsedTsconfig | undefined; errors: string[] } => {
  const errors: string[] = [];
  const configFile = ts.readConfigFile(tsconfig, ts.sys.readFile);
  if (configFile.error) {
    errors.push(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
    return { parsed: undefined, errors };
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(tsconfig),
    { noEmit: true },
    tsconfig,
  );
  for (const error of parsed.errors) {
    errors.push(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  }
  return { parsed: { options: parsed.options, fileNames: parsed.fileNames }, errors };
};

/**
 * A program owns an included source file when the file lies under the
 * tsconfig's directory, is not yet claimed by a deeper program, is not a
 * declaration file, is not under `node_modules`, and matches no excluded
 * directory or test/mock pattern.
 */
const isOwnable = (
  file: ts.SourceFile,
  repoRoot: string,
  dir: string,
  claimed: Set<string>,
): boolean => {
  if (file.isDeclarationFile || claimed.has(file.fileName)) {
    return false;
  }
  const relPath = toRelPosix(repoRoot, file.fileName);
  if (relPath === '' || relPath.startsWith('../') || path.isAbsolute(relPath)) {
    return false;
  }
  const relDir = toRelPosix(repoRoot, dir);
  if (relDir !== '' && relPath !== relDir && !relPath.startsWith(`${relDir}/`)) {
    return false;
  }
  return !isTestFilePattern(relPath) && !hasExcludedSegment(relPath);
};

type TsconfigVisit = {
  repoRoot: string;
  tsconfig: string;
  ws: WorkspacePackage[];
  collectors: Collector<unknown>[];
  sourceCache: SourceFileCache | undefined;
  diagnostics: Diagnostic[];
  claimed: Set<string>;
};

/**
 * Creates one program from a tsconfig and lets every collector visit it. A
 * dedicated function so no reference to the program (or its checker) escapes
 * before the next one is created.
 */
const visitTsconfig = (spec: TsconfigVisit): void => {
  const { repoRoot, tsconfig, ws, collectors, sourceCache, diagnostics, claimed } = spec;
  const dir = path.dirname(tsconfig);
  const { parsed, errors } = parseTsconfig(tsconfig);
  if (errors.length > 0) {
    diagnostics.push(
      makeDiagnostic('tsconfig-error', errors.join('\n'), {
        file: toRelPosix(repoRoot, tsconfig),
        line: 1,
      }),
    );
  }
  if (!parsed || parsed.fileNames.length === 0) {
    return;
  }
  const options = { ...parsed.options, noEmit: true };
  const host = sourceCache ? cachingHost(options, sourceCache) : ts.createCompilerHost(options);
  const program = ts.createProgram({ rootNames: parsed.fileNames, options, host });
  const ownedFiles = program
    .getSourceFiles()
    .filter((file) => isOwnable(file, repoRoot, dir, claimed));
  for (const file of ownedFiles) {
    claimed.add(file.fileName);
  }
  const ctx: ProgramCtx = {
    repoRoot,
    tsconfig,
    dir,
    program,
    checker: program.getTypeChecker(),
    ownedFiles,
    ws,
    diagnostics,
  };
  for (const collector of collectors) {
    collector.visit(ctx);
  }
};

/**
 * Streams one program per relevant tsconfig (deepest directory first, then by
 * path), assigning every source file to exactly one owning program, and
 * returns the diagnostics collected along the way. Programs are visited and
 * dropped one at a time; only the shared source cache (when given) retains
 * `ts.SourceFile`s.
 */
export const runPass = (
  repoRoot: string,
  ws: WorkspacePackage[],
  collectors: Collector<unknown>[],
  opts: RunPassOptions = {},
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const claimed = new Set<string>();
  const found = new Set<string>();
  for (const pkg of keptWorkspacePackages(ws)) {
    // Workspace entries are data; one without an on-disk directory (e.g. a
    // data-only fixture package) simply contributes no programs.
    const pkgDir = path.resolve(repoRoot, pkg.dir);
    if (isDirectory(pkgDir)) {
      findTsconfigs(pkgDir, found);
    }
  }
  const tsconfigs = [...found].toSorted(byDepthThenPath);
  for (const tsconfig of tsconfigs) {
    visitTsconfig({
      repoRoot,
      tsconfig,
      ws,
      collectors,
      sourceCache: opts.sourceCache,
      diagnostics,
      claimed,
    });
  }
  return diagnostics;
};
