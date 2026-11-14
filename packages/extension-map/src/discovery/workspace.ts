import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { WorkspacePackage } from '../model/types';

/**
 * Workspace packages excluded from analysis by name (global constraints):
 * infra packages and the tool itself. `eslint-*`, cypress, contract-tests
 * and backend packages are caught by name prefix / directory segment below.
 */
const EXCLUDED_PACKAGE_NAMES = new Set([
  '@odh-dashboard/tsconfig',
  '@odh-dashboard/jest-config',
  '@odh-dashboard/template', // packages/plugin-template
  '@odh-dashboard/extension-map',
  '@odh-dashboard/contract-tests',
  '@odh-dashboard/cypress',
  'odh-dashboard-backend', // backend/
]);

/**
 * Directory segments excluded from analysis (global constraints): tests,
 * mocks, cypress trees, BFF backends, generated type copies, infra and tool
 * package directories — plus directories never worth walking.
 */
const EXCLUDED_DIR_SEGMENTS = new Set([
  'node_modules',
  '.git',
  'dist',
  '__tests__',
  '__mocks__',
  'cypress',
  'contract-tests',
  'bff',
  'backend',
  'dashboard-operator',
  '@mf-types',
  'tsconfig',
  'jest-config',
  'eslint-config',
  'eslint-plugin',
  'plugin-template',
  'extension-map',
]);

const isExcludedPackageName = (name: string): boolean =>
  EXCLUDED_PACKAGE_NAMES.has(name) || name.startsWith('@odh-dashboard/eslint-');

/** True for excluded directory segments, including `*-cypress` artifacts. */
export const isExcludedDirSegment = (segment: string): boolean =>
  EXCLUDED_DIR_SEGMENTS.has(segment) || segment.endsWith('-cypress');

/** Repo-relative POSIX path from `from` to `to`. */
export const toRelPosix = (from: string, to: string): string =>
  path.relative(from, to).split(path.sep).join('/');

/** True when any segment of a repo-relative POSIX path is excluded. */
export const hasExcludedSegment = (relPath: string): boolean =>
  relPath.split('/').some(isExcludedDirSegment);

/** True for `*.spec.*` / `*.test.*` basenames. */
export const isTestFilePattern = (fileName: string): boolean =>
  /(^|\/)[^/]+\.(spec|test)\.[^/]+$/.test(fileName);

/** Drops the packages excluded from analysis (global constraints). */
export const keptWorkspacePackages = (ws: WorkspacePackage[]): WorkspacePackage[] =>
  ws.filter((pkg) => !isExcludedPackageName(pkg.name) && !hasExcludedSegment(pkg.dir));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const requireString = (entry: Record<string, unknown>, key: string): string => {
  const value = entry[key];
  if (typeof value !== 'string') {
    throw new Error(`workspace package entry is missing a string '${key}'`);
  }
  return value;
};

/**
 * Loads the pnpm workspace packages as data by running the repo's workspace
 * query script (the same source the build uses). Package code is never
 * executed; excluded packages (global constraints) are dropped.
 */
export const loadWorkspace = (repoRoot: string): WorkspacePackage[] => {
  const stdout = execFileSync(process.execPath, ['scripts/query-workspace-packages.js'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const raw: unknown = JSON.parse(stdout);
  if (!Array.isArray(raw)) {
    throw new Error('query-workspace-packages.js output is not a JSON array');
  }
  const packages: WorkspacePackage[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      throw new Error('workspace package entry is not an object');
    }
    const name = requireString(entry, 'name');
    const dir = requireString(entry, 'path');
    if (isExcludedPackageName(name) || hasExcludedSegment(dir)) {
      continue;
    }
    const packageJson: Record<string, unknown> = { ...entry };
    delete packageJson.path;
    delete packageJson.location;
    packages.push({ name, dir, packageJson });
  }
  return packages;
};

const pkgAtDir = (ws: WorkspacePackage[], dir: string): WorkspacePackage | undefined =>
  ws.find((pkg) => pkg.dir === dir);

/**
 * The display package for a repo-relative file: the workspace package with
 * the deepest matching `dir`, rolled up so a package at `<parent>/frontend`
 * or inside `<parent>/upstream/` maps to `<parent>`'s name.
 * `@odh-dashboard/internal` (`frontend/src`) is kept as is.
 */
export const pkgForFile = (relFile: string, ws: WorkspacePackage[]): string | undefined => {
  let best: WorkspacePackage | undefined;
  let bestDepth = -1;
  for (const pkg of ws) {
    if (pkg.dir !== '.' && relFile !== pkg.dir && !relFile.startsWith(`${pkg.dir}/`)) {
      continue;
    }
    const depth = pkg.dir === '.' ? 0 : pkg.dir.length;
    if (depth > bestDepth) {
      best = pkg;
      bestDepth = depth;
    }
  }
  if (!best) {
    return undefined;
  }
  const segments = best.dir === '.' ? [] : best.dir.split('/');
  if (segments[segments.length - 1] === 'frontend') {
    const parent = pkgAtDir(ws, segments.slice(0, -1).join('/') || '.');
    if (parent) {
      return parent.name;
    }
  }
  const upstreamIndex = segments.indexOf('upstream');
  if (upstreamIndex > 0) {
    const parent = pkgAtDir(ws, segments.slice(0, upstreamIndex).join('/'));
    if (parent) {
      return parent.name;
    }
  }
  return best.name;
};

/**
 * The package's generated-docs directory: `<dir>/docs`, except
 * `@odh-dashboard/internal` (`frontend/src`), which writes `frontend/docs`.
 */
export const docsDirFor = (pkg: WorkspacePackage): string =>
  pkg.name === '@odh-dashboard/internal'
    ? 'frontend/docs'
    : `${pkg.dir === '.' ? '' : `${pkg.dir}/`}docs`;
