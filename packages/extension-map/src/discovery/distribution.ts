import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';
import { toPosix } from './workspace';

/** The file a distribution declares its packages in. */
export const DISTRIBUTION_FILE = 'distribution.yaml';

/** The directory, relative to a distribution, a local `extensionsPath` is resolved from. */
const LOCAL_BASE = 'src';

const DEFAULT_EXTENSIONS_PATH = './extensions';

/** One `packages.bundled[]` or `packages.local[]` item, as `resolvePackages` reads it. */
export type DistributionItem = {
  /** The package name (bundled) or the local item's `name`. Duplicates are resolved by it. */
  name: string;
  /** The export key (bundled) or the path relative to the distribution source (local). */
  extensionsPath: string;
  /** True for a `packages.local[]` item. */
  local: boolean;
  /** The item's own boolean feature flags. */
  featureFlags: Record<string, boolean>;
};

/** A distribution's `distribution.yaml`, read as data (never executed). */
export type DistributionConfig = {
  /** Its `name`, when it is a non-empty string. */
  name?: string;
  /** The global boolean feature flags. */
  featureFlags: Record<string, boolean>;
  /** `packages.bundled[]`, in file order. */
  bundled: DistributionItem[];
  /** `packages.local[]`, in file order. */
  local: DistributionItem[];
  /** What in the file could not be read, in words. */
  problems: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const arrayAt = (record: Record<string, unknown> | undefined, key: string): unknown[] => {
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
};

/** The boolean flags of a `featureFlags` map; anything else is a problem. */
const flagsOf = (value: unknown, where: string, problems: string[]): Record<string, boolean> => {
  if (value === undefined || value === null) {
    return {};
  }
  if (!isRecord(value)) {
    problems.push(`\`featureFlags\` of ${where} is not a map`);
    return {};
  }
  const flags: Record<string, boolean> = {};
  Object.entries(value).forEach(([flag, setting]) => {
    if (typeof setting === 'boolean') {
      flags[flag] = setting;
    } else {
      problems.push(`feature flag \`${flag}\` of ${where} is not a boolean`);
    }
  });
  return flags;
};

const bundledItem = (raw: unknown, index: number, problems: string[]): DistributionItem[] => {
  if (typeof raw === 'string' && raw !== '') {
    return [{ name: raw, extensionsPath: DEFAULT_EXTENSIONS_PATH, local: false, featureFlags: {} }];
  }
  if (isRecord(raw) && typeof raw.package === 'string' && raw.package !== '') {
    const extensionsPath = raw.extensionsPath ?? DEFAULT_EXTENSIONS_PATH;
    if (typeof extensionsPath !== 'string' || extensionsPath === '') {
      problems.push(`\`extensionsPath\` of bundled package ${raw.package} is not a string`);
      return [];
    }
    return [
      {
        name: raw.package,
        extensionsPath,
        local: false,
        featureFlags: flagsOf(raw.featureFlags, `bundled package ${raw.package}`, problems),
      },
    ];
  }
  problems.push(`bundled item ${index + 1} names no package`);
  return [];
};

const localItem = (raw: unknown, index: number, problems: string[]): DistributionItem[] => {
  if (
    isRecord(raw) &&
    typeof raw.name === 'string' &&
    raw.name !== '' &&
    typeof raw.extensionsPath === 'string' &&
    raw.extensionsPath !== ''
  ) {
    return [
      {
        name: raw.name,
        extensionsPath: raw.extensionsPath,
        local: true,
        featureFlags: flagsOf(raw.featureFlags, `local item ${raw.name}`, problems),
      },
    ];
  }
  problems.push(`local item ${index + 1} has no \`name\` and \`extensionsPath\``);
  return [];
};

/**
 * Reads `<dir>/distribution.yaml` as `generateDistributionExtensionsPlugin.js` does, without
 * running it. Returns `undefined` when the distribution has no such file.
 */
export const readDistributionConfig = (
  dir: string,
  repoRoot: string,
): DistributionConfig | undefined => {
  const file = path.join(repoRoot, dir, DISTRIBUTION_FILE);
  if (!fs.existsSync(file)) {
    return undefined;
  }
  const problems: string[] = [];
  let parsed: unknown;
  try {
    parsed = parse(fs.readFileSync(file, 'utf8'));
  } catch (error: unknown) {
    problems.push(`it is not valid YAML (${error instanceof Error ? error.message : 'unknown'})`);
  }
  if (!isRecord(parsed)) {
    if (problems.length === 0) {
      problems.push('it is not a YAML map');
    }
    return { featureFlags: {}, bundled: [], local: [], problems };
  }
  const packages = isRecord(parsed.packages) ? parsed.packages : undefined;
  return {
    ...(typeof parsed.name === 'string' && parsed.name !== '' ? { name: parsed.name } : {}),
    featureFlags: flagsOf(parsed.featureFlags, 'the distribution', problems),
    bundled: arrayAt(packages, 'bundled').flatMap((raw, i) => bundledItem(raw, i, problems)),
    local: arrayAt(packages, 'local').flatMap((raw, i) => localItem(raw, i, problems)),
    problems,
  };
};

const isFile = (p: string): boolean => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/**
 * The repo-relative file a local `extensionsPath` names. The generated module that imports it,
 * `distribution-extensions.ts`, is written to the distribution's `src/` directory (the
 * `targetFile` both distributions' rspack configs set), so the path is resolved from there.
 * Returns `undefined` when it resolves to no file or leaves the distribution.
 */
export const resolveLocalEntry = (
  dir: string,
  extensionsPath: string,
  repoRoot: string,
): string | undefined => {
  const distRoot = path.resolve(repoRoot, dir);
  const base = path.resolve(distRoot, LOCAL_BASE, extensionsPath);
  if (!base.startsWith(`${distRoot}${path.sep}`)) {
    return undefined;
  }
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
  const hit = candidates.find(isFile);
  return hit ? toPosix(path.relative(repoRoot, hit)) : undefined;
};

/** The entry key of a local item: `local:<extensionsPath>`. */
export const localEntryKey = (extensionsPath: string): string => `local:${extensionsPath}`;
