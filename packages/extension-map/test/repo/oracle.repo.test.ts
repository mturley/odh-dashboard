import path from 'path';
import ts from 'typescript';
import { getRepoModel } from './model';
import { queryHookOf, declaredName } from '../../src/consumers/hooks';
import { calleeDeclaration } from '../../src/consumers/wrappers';
import { isExcludedPath, loadWorkspace, relFile } from '../../src/discovery/workspace';
import { findTsconfigs } from '../../src/programs/stream';
import type { ProgramCtx } from '../../src/programs/stream';
import { findRepoRoot } from '../../src/repoRoot';

/**
 * An independent check on the walk (spec §4.2, approach C): TypeScript's own reference finder,
 * run on the declared guards of a few points in a few programs, must find exactly the query
 * sites the walk found for those guards.
 */

const POINTS = [
  'model-serving.platform/exclude-deployment',
  'model-serving.deployment/wizard-field',
  'app.route',
  'app.masthead/toolbar-item',
  // Queried only through the `useResolvedDeploymentExtension` wrapper.
  'model-serving.platform/delete-deployment',
];

const TSCONFIGS = [
  'packages/model-serving/tsconfig.json',
  'packages/kserve/tsconfig.json',
  'frontend/src/tsconfig.json',
  'distributions/base/tsconfig.json',
];

const repoRoot = findRepoRoot();

/** Directories of every in-scope tsconfig, so a file can be given to the deepest one. */
const configDirs = findTsconfigs(repoRoot, loadWorkspace(repoRoot)).map((config) =>
  path.posix.dirname(config),
);

/** True when a repo-relative file belongs to the program of `dir`, not to a deeper one. */
const ownedBy = (file: string, dir: string): boolean =>
  file.startsWith(`${dir}/`) &&
  !isExcludedPath(file) &&
  !configDirs.some((other) => other.length > dir.length && file.startsWith(`${other}/`));

/** The innermost node spanning a position. */
const nodeAt = (file: ts.SourceFile, pos: number): ts.Node => {
  let current: ts.Node = file;
  for (;;) {
    const next = current.getChildren(file).find((c) => c.getStart(file) <= pos && pos < c.getEnd());
    if (!next) {
      return current;
    }
    current = next;
  }
};

/** Climbs past parentheses, `as`, `satisfies` and `!` around an expression. */
const outermost = (node: ts.Node): ts.Node => {
  let current = node;
  while (
    ts.isParenthesizedExpression(current.parent) ||
    ts.isAsExpression(current.parent) ||
    ts.isSatisfiesExpression(current.parent) ||
    ts.isNonNullExpression(current.parent)
  ) {
    current = current.parent;
  }
  return current;
};

/** The call or JSX element a reference is passed to as an argument or attribute, if any. */
const receivingSite = (ref: ts.Node): ts.CallExpression | ts.JsxOpeningLikeElement | undefined => {
  const expr = outermost(ref);
  const { parent } = expr;
  if (ts.isCallExpression(parent) && parent.arguments.some((arg) => arg === expr)) {
    return parent;
  }
  if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) {
    return parent.parent.parent.parent;
  }
  return undefined;
};

const lineOf = (node: ts.Node): number => {
  const file = node.getSourceFile();
  return file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
};

const buildService = (configPath: string): ts.LanguageService => {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => undefined,
    },
  );
  if (!parsed) {
    throw new Error(`Cannot parse ${configPath}`);
  }
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => parsed.fileNames,
    getScriptVersion: () => '0',
    getScriptSnapshot: (fileName) => {
      const text = ts.sys.readFile(fileName);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => path.dirname(configPath),
    getCompilationSettings: () => ({ ...parsed.options, noEmit: true }),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath,
  };
  return ts.createLanguageService(host, ts.createDocumentRegistry());
};

/** `file:line` of every query-hook or wrapper call that `findReferences` sees a guard passed to. */
const oracleSites = (configRel: string, wrapperNames: Set<string>): string[] => {
  const dir = path.posix.dirname(configRel);
  const service = buildService(path.join(repoRoot, configRel));
  const program = service.getProgram();
  if (!program) {
    throw new Error(`No program for ${configRel}`);
  }
  const checker = program.getTypeChecker();
  const ctx: ProgramCtx = {
    repoRoot,
    tsconfig: path.join(repoRoot, configRel),
    dir: path.join(repoRoot, dir),
    program,
    checker,
    ownedFiles: [],
    ws: [],
    diagnostics: [],
  };
  const guards = getRepoModel().guards.filter((g) => g.pointIds.some((id) => POINTS.includes(id)));
  const found = new Set<string>();
  for (const guard of guards) {
    const file = program.getSourceFile(path.join(repoRoot, guard.loc.file));
    if (!file) {
      continue;
    }
    const linePos = file.getPositionOfLineAndCharacter(guard.loc.line - 1, 0);
    const namePos = file.text.indexOf(guard.name, linePos);
    const refs = service.findReferences(file.fileName, namePos) ?? [];
    for (const ref of refs.flatMap((entry) => entry.references)) {
      const refFile = program.getSourceFile(ref.fileName);
      const rel = relFile(repoRoot, ref.fileName);
      if (ref.isDefinition || !refFile || !ownedBy(rel, dir)) {
        continue;
      }
      const site = receivingSite(nodeAt(refFile, ref.textSpan.start));
      const decl = site ? calleeDeclaration(site, checker) : undefined;
      const name = decl ? declaredName(decl) : undefined;
      const isQuery =
        decl !== undefined &&
        (queryHookOf(decl, ctx) !== undefined || (name !== undefined && wrapperNames.has(name)));
      if (site && isQuery) {
        found.add(`${rel}:${lineOf(site)}`);
      }
    }
  }
  service.dispose();
  return [...found].toSorted();
};

describe('findReferences oracle', () => {
  const model = getRepoModel();
  const compared = model.querySites.filter((q) => q.pointIds.some((id) => POINTS.includes(id)));
  const wrapperNames = new Set(
    model.querySites.flatMap((q) => (q.wrapper === undefined ? [] : [q.wrapper])),
  );

  it('compares at least one site that goes through a wrapper', () => {
    expect(compared.filter((q) => q.wrapper !== undefined)).not.toEqual([]);
  });

  it.each(TSCONFIGS)('agrees with the walk in %s', (configRel) => {
    const dir = path.posix.dirname(configRel);
    const walked = [
      ...new Set(
        model.querySites
          .filter((q) => q.pointIds.some((id) => POINTS.includes(id)) && ownedBy(q.loc.file, dir))
          .map((q) => `${q.loc.file}:${q.loc.line}`),
      ),
    ].toSorted();
    // Every chosen program owns at least one such site, so agreement is never vacuous.
    expect(walked.length).toBeGreaterThan(0);
    expect(oracleSites(configRel, wrapperNames)).toEqual(walked);
  });
});
