import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { pkgForFile, toPosix } from './workspace';
import type { WorkspacePackage } from '../model/types';

const EXTENSIONS_KEY = './extensions';
const CONFIG_FILE = 'moduleFederation.js';
/** How deep below `<pkg>/upstream` a `frontend/config/moduleFederation.js` is looked for. */
const MAX_UPSTREAM_DEPTH = 5;
const SKIPPED_DIRS: ReadonlySet<string> = new Set(['node_modules', '.git', 'bff', 'api']);

export type FederationExpose = { file: string } | { unresolved: string } | undefined;

const isFile = (p: string): boolean => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Every `<dir>/frontend/config/moduleFederation.js` below `dir`, as absolute paths. */
const findUpstreamConfigs = (dir: string, depth: number): string[] => {
  if (depth > MAX_UPSTREAM_DEPTH) {
    return [];
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries.toSorted((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) {
      const child = path.join(dir, entry.name);
      if (entry.name === 'frontend' && isFile(path.join(child, 'config', CONFIG_FILE))) {
        found.push(path.join(child, 'config', CONFIG_FILE));
      }
      found.push(...findUpstreamConfigs(child, depth + 1));
    }
  }
  return found;
};

const propertyName = (name: ts.PropertyName): string | undefined =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)
    ? name.text
    : undefined;

/** The object literal of the first `exposes: { ... }` property anywhere in the file. */
const findExposes = (sf: ts.SourceFile): ts.Expression | undefined => {
  let found: ts.Expression | undefined;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (
      ts.isPropertyAssignment(node) &&
      propertyName(node.name) === 'exposes' &&
      !ts.isComputedPropertyName(node.name)
    ) {
      found = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
};

const resolveExposeFile = (
  frontendDir: string,
  value: string,
  repoRoot: string,
): string | undefined => {
  const base = path.resolve(frontendDir, value);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
  const hit = candidates.find(isFile);
  return hit ? toPosix(path.relative(repoRoot, hit)) : undefined;
};

/**
 * Reads the `./extensions` expose of a package's `moduleFederation.js` statically (the file is
 * parsed, never executed). Looks at `<pkg>/frontend/config/` first, then the first (sorted)
 * `<pkg>/upstream/**\/frontend/config/`. Returns `undefined` when there is no config file or it
 * has no `./extensions` expose, `{ unresolved }` when the expose cannot be read as a literal.
 */
export const readFederationExpose = (pkgDir: string, repoRoot: string): FederationExpose => {
  const absPkg = path.resolve(repoRoot, pkgDir);
  const own = path.join(absPkg, 'frontend', 'config', CONFIG_FILE);
  const configPath = isFile(own)
    ? own
    : findUpstreamConfigs(path.join(absPkg, 'upstream'), 0).at(0);
  if (!configPath) {
    return undefined;
  }
  const sf = ts.createSourceFile(
    configPath,
    fs.readFileSync(configPath, 'utf8'),
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS,
  );
  const exposes = findExposes(sf);
  if (!exposes) {
    return undefined;
  }
  if (!ts.isObjectLiteralExpression(exposes)) {
    return {
      unresolved: `\`exposes\` in ${toPosix(
        path.relative(repoRoot, configPath),
      )} is not an object literal`,
    };
  }
  let sawUnknownMember = false;
  for (const prop of exposes.properties) {
    if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) {
      sawUnknownMember = true;
    } else if (ts.isPropertyAssignment(prop) && ts.isComputedPropertyName(prop.name)) {
      sawUnknownMember = true;
    } else if (propertyName(prop.name) === EXTENSIONS_KEY) {
      if (
        !ts.isPropertyAssignment(prop) ||
        !(
          ts.isStringLiteral(prop.initializer) ||
          ts.isNoSubstitutionTemplateLiteral(prop.initializer)
        )
      ) {
        return { unresolved: `the \`${EXTENSIONS_KEY}\` expose is not a string literal` };
      }
      const frontendDir = path.dirname(path.dirname(configPath));
      const file = resolveExposeFile(frontendDir, prop.initializer.text, repoRoot);
      return file
        ? { file }
        : {
            unresolved: `the \`${EXTENSIONS_KEY}\` expose \`${prop.initializer.text}\` does not resolve to a file`,
          };
    }
  }
  return sawUnknownMember
    ? {
        unresolved: `\`exposes\` has spread or computed members, so \`${EXTENSIONS_KEY}\` cannot be ruled out`,
      }
    : undefined;
};

export type HostFederatedMember = {
  pkg: string;
  loaded: boolean;
  reason?: 'no-remoteEntry' | 'no-extensions-expose';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The remoteEntry of a `module-federation` config, normalized as
 * `packages/app-config/src/module-federation.ts` does: the old format has a top-level
 * `remoteEntry`, otherwise it is `backend.remoteEntry`.
 */
const remoteEntryOf = (config: Record<string, unknown>): string | undefined => {
  const value =
    'remoteEntry' in config
      ? config.remoteEntry
      : isRecord(config.backend)
      ? config.backend.remoteEntry
      : undefined;
  return typeof value === 'string' && value !== '' ? value : undefined;
};

/**
 * Packages declaring `module-federation`, and whether the host would load them as remotes:
 * a remoteEntry (the backend only keeps configs that have one) and a `./extensions` expose.
 * An expose that exists but cannot be read is not held against the package; it is reported
 * separately as `unresolved-expose`.
 */
export const hostFederatedMembers = (
  ws: WorkspacePackage[],
  repoRoot: string,
): HostFederatedMember[] =>
  ws.flatMap((pkg): HostFederatedMember[] => {
    const config = pkg.packageJson['module-federation'];
    if (!isRecord(config)) {
      return [];
    }
    const name = pkgForFile(pkg.dir, ws) ?? pkg.name;
    if (!remoteEntryOf(config)) {
      return [{ pkg: name, loaded: false, reason: 'no-remoteEntry' }];
    }
    return readFederationExpose(pkg.dir, repoRoot) === undefined
      ? [{ pkg: name, loaded: false, reason: 'no-extensions-expose' }]
      : [{ pkg: name, loaded: true }];
  });
