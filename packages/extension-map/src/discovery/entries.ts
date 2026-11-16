import fs from 'fs';
import path from 'path';
import { hostFederatedMembers, readFederationExpose } from './hostFederation';
import { CORE_PACKAGE, pkgForFile, toPosix } from './workspace';
import { makeDiagnostic } from '../model/diagnostics';
import type { Diagnostic, Entry, Pkg, WorkspacePackage } from '../model/types';

const EXTENSIONS_EXPORT = './extensions';
const EXTENSIONS_PREFIX = './extensions/';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The file an `exports` target points at: a string, or the `default` of a condition object. */
const exportTarget = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  return isRecord(value) && typeof value.default === 'string' ? value.default : undefined;
};

const kindOf = (pkg: WorkspacePackage): Pkg['kind'] => {
  if (pkg.name === CORE_PACKAGE) {
    return 'host';
  }
  return pkg.dir.startsWith('distributions/') ? 'distribution' : 'package';
};

const toPkg = (pkg: WorkspacePackage, repoRoot: string): Pkg => {
  const upstream = `${pkg.dir}/upstream`;
  return {
    name: pkg.name,
    dir: pkg.dir,
    kind: kindOf(pkg),
    upstreamDirs: fs.existsSync(path.join(repoRoot, upstream)) ? [upstream] : [],
  };
};

/**
 * Finds every extension entry from `package.json` exports and `moduleFederation.js` files,
 * the display packages, and the federation the host would not load. No TypeScript programs
 * are needed.
 */
export const discoverEntries = (
  ws: WorkspacePackage[],
  repoRoot: string,
): { entries: Entry[]; packages: Pkg[]; diagnostics: Diagnostic[] } => {
  const entries = new Map<string, Entry>();
  const diagnostics: Diagnostic[] = [];
  const add = (entry: Entry): void => {
    entries.set(entry.id, entry);
  };

  for (const pkg of ws) {
    const display = pkgForFile(pkg.dir, ws) ?? pkg.name;
    const exportsField = pkg.packageJson.exports;
    if (isRecord(exportsField)) {
      for (const [key, value] of Object.entries(exportsField)) {
        const isStatic = key === EXTENSIONS_EXPORT;
        const isDistribution = key.startsWith(EXTENSIONS_PREFIX) && !key.includes('*');
        const target = exportTarget(value);
        if ((isStatic || isDistribution) && target) {
          add({
            id: `${display}#${key}`,
            pkg: display,
            file: toPosix(path.posix.join(pkg.dir, target)),
            path: isStatic ? 'static' : 'distribution-static',
            key,
          });
        }
      }
    }
    if (pkg.packageJson['module-federation'] !== undefined) {
      const expose = readFederationExpose(pkg.dir, repoRoot);
      if (expose && 'file' in expose) {
        const key = `mf:${EXTENSIONS_EXPORT}`;
        add({ id: `${display}#${key}`, pkg: display, file: expose.file, path: 'federated', key });
      } else if (expose) {
        diagnostics.push(
          makeDiagnostic(
            'unresolved-expose',
            `Cannot read the federated ${EXTENSIONS_EXPORT} entry of ${display}: ${expose.unresolved}.`,
            undefined,
            display,
          ),
        );
      }
    }
  }

  for (const member of hostFederatedMembers(ws, repoRoot)) {
    if (!member.loaded) {
      const why =
        member.reason === 'no-remoteEntry'
          ? 'its module-federation config has no remoteEntry'
          : `its moduleFederation.js has no ${EXTENSIONS_EXPORT} expose`;
      diagnostics.push(
        makeDiagnostic(
          'federation-not-loaded',
          `${member.pkg} declares module federation but the host does not load it as a remote: ${why}.`,
          undefined,
          member.pkg,
        ),
      );
    }
  }

  const packages = ws
    .filter((pkg) => pkgForFile(pkg.dir, ws) === pkg.name)
    .map((pkg) => toPkg(pkg, repoRoot));
  return { entries: [...entries.values()], packages, diagnostics };
};
