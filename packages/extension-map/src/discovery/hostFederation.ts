import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { toRelPosix } from './workspace';
import type { WorkspacePackage } from '../model/types';

/**
 * The host federation filter (spec §5.2): which declared `module-federation`
 * remotes the host would actually load, plus the static reading of a
 * package's `moduleFederation.js` expose both this filter and entry
 * discovery need. Package code is never executed: `moduleFederation.js` is
 * parsed with the TypeScript parser as data.
 */

/** Result of reading a package's federation expose statically. */
export type FederationExpose = { file: string } | { unresolved: string };

/** A workspace package that declares a `module-federation` config. */
export type HostFederatedMember = {
  pkg: string;
  loaded: boolean;
  reason?: 'no-remoteEntry' | 'no-extensions-expose';
};

const MODULE_FEDERATION_CONFIG = 'frontend/config/moduleFederation.js';

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** True when `absPath` is an existing directory. */
export const isDirectory = (absPath: string): boolean => {
  try {
    return fs.statSync(absPath).isDirectory();
  } catch {
    return false;
  }
};

/** Repo-relative POSIX join of a package dir and a relative path. */
const pkgRel = (pkgDir: string, rel: string): string =>
  path.posix.normalize(path.posix.join(pkgDir, rel));

/**
 * Candidates for `upstream` copies of the config: a `frontend/config/`
 * `moduleFederation.js` at any depth under the package's `upstream/` tree
 * (model-registry, notebooks).
 */
const upstreamConfigCandidates = (pkgDir: string, repoRoot: string): string[] => {
  const upstreamRoot = path.join(repoRoot, pkgDir, 'upstream');
  if (!isDirectory(upstreamRoot)) {
    return [];
  }
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const child = path.join(dir, entry.name);
      if (entry.name === 'frontend') {
        const config = path.join(child, 'config', 'moduleFederation.js');
        if (fs.existsSync(config)) {
          found.push(toRelPosix(repoRoot, config));
        }
      }
      walk(child);
    }
  };
  walk(upstreamRoot);
  return found;
};

/** The property name text of a `PropertyName`, or undefined when computed. */
const nameText = (name: ts.PropertyName): string | undefined =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;

type ParsedExpose = { value: string } | { unresolved: string };

/** What a subtree says about the `exposes['./extensions']` value. */
type ExposeScan = { literal?: string; nonLiteral: boolean; hasExposes: boolean };

const mergeScans = (a: ExposeScan, b: ExposeScan): ExposeScan => ({
  literal: a.literal ?? b.literal,
  nonLiteral: a.nonLiteral || b.nonLiteral,
  hasExposes: a.hasExposes || b.hasExposes,
});

/** Scans a node and its subtree for the `exposes` object literal. */
const scanExpose = (node: ts.Node): ExposeScan => {
  let scan: ExposeScan = { nonLiteral: false, hasExposes: false };
  if (
    ts.isPropertyAssignment(node) &&
    nameText(node.name) === 'exposes' &&
    ts.isObjectLiteralExpression(node.initializer)
  ) {
    scan = { ...scan, hasExposes: true };
    for (const prop of node.initializer.properties) {
      if (ts.isPropertyAssignment(prop) && nameText(prop.name) === './extensions') {
        scan = ts.isStringLiteral(prop.initializer)
          ? { ...scan, literal: prop.initializer.text }
          : { ...scan, nonLiteral: true };
      }
    }
  }
  node.forEachChild((child) => {
    scan = mergeScans(scan, scanExpose(child));
  });
  return scan;
};

/**
 * Reads `exposes['./extensions']` from a `moduleFederation.js` by parsing it
 * with `ts.createSourceFile` (never `require`d). Any shape where the value is
 * not a string literal is reported, never guessed.
 */
const parseExpose = (configFile: string, repoRoot: string): ParsedExpose => {
  const absFile = path.join(repoRoot, configFile);
  const source = ts.createSourceFile(
    absFile,
    fs.readFileSync(absFile, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const scan = scanExpose(source);
  if (scan.literal !== undefined) {
    return { value: scan.literal };
  }
  if (scan.nonLiteral) {
    return { unresolved: `${configFile}: exposes './extensions' is not a string literal` };
  }
  if (scan.hasExposes) {
    return { unresolved: `${configFile}: exposes has no './extensions' entry` };
  }
  return { unresolved: `${configFile}: no exposes object literal` };
};

/**
 * Locates the package's `frontend/config/moduleFederation.js` (or its
 * upstream copy at any depth, first match in sorted candidate order), reads its `./extensions` expose and resolves it relative to that
 * `frontend/` dir (trying `.ts`, `.tsx`, `/index.ts`). Returns undefined
 * when the package has no `moduleFederation.js`; an unresolved expose is
 * reported, never guessed.
 */
export const readFederationExpose = (
  pkgDir: string,
  repoRoot: string,
): FederationExpose | undefined => {
  const candidates = [
    pkgRel(pkgDir, MODULE_FEDERATION_CONFIG),
    ...upstreamConfigCandidates(pkgDir, repoRoot),
  ]
    .filter((rel) => fs.existsSync(path.join(repoRoot, rel)))
    .toSorted(byString);
  const configFile = candidates.at(0);
  if (configFile === undefined) {
    return undefined;
  }
  const parsed = parseExpose(configFile, repoRoot);
  if ('unresolved' in parsed) {
    return parsed;
  }
  const frontendDir = path.posix.dirname(path.posix.dirname(configFile));
  for (const suffix of ['.ts', '.tsx', '/index.ts']) {
    const file = path.posix.normalize(path.posix.join(frontendDir, parsed.value + suffix));
    if (fs.existsSync(path.join(repoRoot, file))) {
      return { file };
    }
  }
  return {
    unresolved: `${configFile}: exposes './extensions' (${parsed.value}) resolves to no .ts/.tsx/index.ts file`,
  };
};

/**
 * Every workspace package declaring a `module-federation` config, with
 * whether the host would load it as a remote. Mirrors
 * `packages/app-config/src/module-federation.ts` normalization: a top-level
 * `remoteEntry` is the old format; otherwise the remote entry is
 * `config.backend?.remoteEntry`. Loading additionally requires an
 * `./extensions` expose (`useAppExtensions` loads `<name>/extensions`).
 */
export const hostFederatedMembers = (
  ws: WorkspacePackage[],
  repoRoot: string,
): HostFederatedMember[] =>
  ws.flatMap((pkg) => {
    const config = pkg.packageJson['module-federation'];
    if (!isRecord(config)) {
      return [];
    }
    const hasRemoteEntry =
      'remoteEntry' in config || (isRecord(config.backend) && 'remoteEntry' in config.backend);
    const expose = readFederationExpose(pkg.dir, repoRoot);
    const loaded = hasRemoteEntry && expose !== undefined && 'file' in expose;
    return [
      {
        pkg: pkg.name,
        loaded,
        reason: loaded ? undefined : hasRemoteEntry ? 'no-extensions-expose' : 'no-remoteEntry',
      },
    ];
  });
