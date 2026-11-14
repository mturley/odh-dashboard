import path from 'node:path';
import { docsDirFor, pkgForFile } from './workspace';
import { hostFederatedMembers, isDirectory, readFederationExpose } from './hostFederation';
import type { Diagnostic, Entry, Pkg, WorkspacePackage } from '../model/types';

/**
 * Entry discovery (spec §5.2): one entry per loading path out of a package —
 * `package.json` `exports` keys and federation exposes — plus the package
 * catalog. All values are read as data; nothing is executed.
 */

export type DiscoveredEntries = {
  entries: Entry[];
  packages: Pkg[];
  diagnostics: Diagnostic[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const pkgKind = (pkg: WorkspacePackage): Pkg['kind'] =>
  pkg.name === '@odh-dashboard/internal'
    ? 'host'
    : pkg.dir === 'distributions' || pkg.dir.startsWith('distributions/')
    ? 'distribution'
    : 'package';

/** Repo-relative POSIX join of a package dir and a relative path. */
const pkgRel = (pkgDir: string, rel: string): string =>
  path.posix.normalize(path.posix.join(pkgDir, rel));

const toPkg = (pkg: WorkspacePackage, repoRoot: string): Pkg => {
  const upstream = pkgRel(pkg.dir, 'upstream');
  return {
    name: pkg.name,
    dir: pkg.dir,
    kind: pkgKind(pkg),
    docsDir: docsDirFor(pkg),
    upstreamDirs: isDirectory(path.join(repoRoot, upstream)) ? [upstream] : [],
  };
};

/** Entries from the package's `exports` keys (`./extensions`, `./extensions/<x>`). */
const exportEntries = (pkg: WorkspacePackage, ws: WorkspacePackage[]): Entry[] => {
  const { exports } = pkg.packageJson;
  if (!isRecord(exports)) {
    return [];
  }
  const entries: Entry[] = [];
  for (const [key, value] of Object.entries(exports)) {
    if (key !== './extensions' && !key.startsWith('./extensions/')) {
      continue;
    }
    if (typeof value !== 'string') {
      continue;
    }
    const file = pkgRel(pkg.dir, value);
    entries.push({
      id: `${pkg.name}#${key}`,
      pkg: pkgForFile(file, ws) ?? pkg.name,
      file,
      path: key === './extensions' ? 'static' : 'distribution-static',
      key,
    });
  }
  return entries;
};

/**
 * Discovers entries, the package catalog and discovery diagnostics. The core
 * app (`@odh-dashboard/internal`) is an ordinary static entry, not a special
 * case; distribution-local entries are added by the composition pass. Entry
 * ids are `<pkg>#<key>` (`mf:./extensions` for federation exposes).
 */
export const discoverEntries = (ws: WorkspacePackage[], repoRoot: string): DiscoveredEntries => {
  const entries: Entry[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const pkg of ws) {
    entries.push(...exportEntries(pkg, ws));
  }

  for (const pkg of ws) {
    if (!isRecord(pkg.packageJson['module-federation'])) {
      continue;
    }
    const expose = readFederationExpose(pkg.dir, repoRoot);
    if (expose === undefined) {
      continue; // no moduleFederation.js: no federated entry, member filter reports it
    }
    if ('file' in expose) {
      entries.push({
        id: `${pkg.name}#mf:./extensions`,
        pkg: pkgForFile(expose.file, ws) ?? pkg.name,
        file: expose.file,
        path: 'federated',
        key: 'mf:./extensions',
      });
    } else {
      diagnostics.push({
        code: 'unresolved-expose',
        severity: 'warning',
        message: expose.unresolved,
        pkg: pkg.name,
      });
    }
  }

  for (const member of hostFederatedMembers(ws, repoRoot)) {
    if (member.loaded) {
      continue;
    }
    diagnostics.push({
      code: 'federation-not-loaded',
      severity: 'warning',
      message: `the host would not load '${member.pkg}' as a federated remote (${
        member.reason ?? 'unknown reason'
      })`,
      pkg: member.pkg,
    });
  }

  return { entries, packages: ws.map((pkg) => toPkg(pkg, repoRoot)), diagnostics };
};
