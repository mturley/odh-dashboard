import { execFileSync } from 'child_process';
import path from 'path';
import type { WorkspacePackage } from '../model/types';

/** The core application package: its sources are `frontend/src`, its docs `frontend/docs`. */
export const CORE_PACKAGE = '@odh-dashboard/internal';

/** Workspace packages that are infrastructure for the repo rather than part of the product. */
const EXCLUDED_PACKAGE_DIRS: ReadonlySet<string> = new Set([
  'packages/eslint-config',
  'packages/eslint-plugin',
  'packages/jest-config',
  'packages/tsconfig',
  'packages/plugin-template',
  'packages/extension-map',
]);

/** Directory names that are never analyzed, wherever they appear. */
const EXCLUDED_SEGMENTS: ReadonlySet<string> = new Set([
  'node_modules',
  'cypress',
  '__tests__',
  '__mocks__',
  'contract-tests',
  'bff',
  '@mf-types',
]);

/** Repo-root directories that are never analyzed. */
const EXCLUDED_ROOTS: readonly string[] = ['backend', 'dashboard-operator'];

const TEST_FILE = /\.(?:spec|test)\./;

/** Normalizes a path to forward slashes so comparisons work the same everywhere. */
export const toPosix = (p: string): string => p.split(path.sep).join('/');

/** Repo-relative, forward-slashed path of an absolute file name. */
export const relFile = (repoRoot: string, file: string): string =>
  toPosix(path.relative(repoRoot, file));

/**
 * True when a repo-relative path is out of scope for analysis: tests, mocks, cypress,
 * contract tests, BFFs, the backend, the operator, the committed `@mf-types` copies and
 * anything inside `node_modules`.
 */
export const isExcludedPath = (relPath: string): boolean => {
  const segments = toPosix(relPath).split('/');
  if (EXCLUDED_ROOTS.includes(segments[0])) {
    return true;
  }
  if (segments.some((segment) => EXCLUDED_SEGMENTS.has(segment))) {
    return true;
  }
  const base = segments[segments.length - 1];
  return TEST_FILE.test(base);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The package.json fields, without the `path` and `location` keys the script adds. */
const packageJsonOf = (record: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== 'path' && key !== 'location'),
  );

/**
 * Lists the workspace packages that are in scope for analysis, by running the repo's own
 * `scripts/query-workspace-packages.js` (pnpm is the source of truth for workspace globs).
 * The repo root package and the excluded packages (infrastructure, tests, backends) are dropped.
 */
export const loadWorkspace = (repoRoot: string): WorkspacePackage[] => {
  const script = path.join(repoRoot, 'scripts', 'query-workspace-packages.js');
  const stdout = execFileSync(process.execPath, [script], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) {
    throw new Error(`${script} did not print an array of workspace packages`);
  }
  return parsed.flatMap((entry): WorkspacePackage[] => {
    if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.path !== 'string') {
      throw new Error(`${script} printed a workspace package without a name or path`);
    }
    const dir = toPosix(entry.path);
    if (dir === '.' || EXCLUDED_PACKAGE_DIRS.has(dir) || isExcludedPath(dir)) {
      return [];
    }
    return [{ name: entry.name, dir, packageJson: packageJsonOf(entry) }];
  });
};

const findPackage = (dir: string, ws: WorkspacePackage[]): WorkspacePackage | undefined =>
  ws.find((p) => p.dir === dir);

/**
 * The package a nested package's files are displayed under: a `<parent>/frontend` package and a
 * package inside `<parent>/upstream/` are shown as `<parent>`. The core package is kept as is.
 */
const rollUp = (pkg: WorkspacePackage, ws: WorkspacePackage[]): string => {
  if (pkg.name === CORE_PACKAGE) {
    return pkg.name;
  }
  const upstream = pkg.dir.indexOf('/upstream/');
  const parentDir =
    upstream !== -1
      ? pkg.dir.slice(0, upstream)
      : pkg.dir.endsWith('/frontend')
      ? pkg.dir.slice(0, -'/frontend'.length)
      : undefined;
  const parent = parentDir === undefined ? undefined : findPackage(parentDir, ws);
  return parent ? parent.name : pkg.name;
};

/**
 * The display package of a repo-relative file: the workspace package with the deepest matching
 * directory, rolled up to its parent package where one owns it.
 */
export const pkgForFile = (relPath: string, ws: WorkspacePackage[]): string | undefined => {
  const file = toPosix(relPath);
  let best: WorkspacePackage | undefined;
  for (const pkg of ws) {
    const dir = toPosix(pkg.dir);
    const matches = file === dir || file.startsWith(`${dir}/`);
    if (matches && (!best || dir.length > best.dir.length)) {
      best = pkg;
    }
  }
  return best ? rollUp(best, ws) : undefined;
};

/** The directory a package's generated docs are written to. */
export const docsDirFor = (pkg: WorkspacePackage): string =>
  pkg.name === CORE_PACKAGE ? 'frontend/docs' : `${toPosix(pkg.dir)}/docs`;
