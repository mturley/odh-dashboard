import fs from 'fs';
import path from 'path';
import type {
  Diagnostic,
  DiagnosticCode,
  Entry,
  ExtensionMapModel,
  ExtensionPoint,
  ExtensionRecord,
  Pkg,
  Value,
} from '../../src/model/types';

export const repoModelCachePath = (): string =>
  path.join(__dirname, '..', '..', 'node_modules', '.cache', 'extension-map', 'repo-model.json');

let cached: ExtensionMapModel | undefined;

/** Reads the model written by `globalSetup.ts`. */
export const getRepoModel = (): ExtensionMapModel => {
  if (!cached) {
    const parsed: ExtensionMapModel = JSON.parse(fs.readFileSync(repoModelCachePath(), 'utf8'));
    cached = parsed;
  }
  return cached;
};

/** Entries of a display package. */
export const entriesOf = (pkgName: string): Entry[] =>
  getRepoModel().entries.filter((e) => e.pkg === pkgName);

/** The first diagnostic with a code and package. */
export const diag = (code: DiagnosticCode, subject: string): Diagnostic | undefined =>
  getRepoModel().diagnostics.find((d) => d.code === code && d.pkg === subject);

export const pkg = (name: string): Pkg => {
  const found = getRepoModel().packages.find((p) => p.name === name);
  if (!found) {
    throw new Error(`No package ${name} in the repo model`);
  }
  return found;
};

/** Packages with a static `./extensions` entry. */
export const staticEntryPkgs = (): string[] =>
  getRepoModel()
    .entries.filter((e) => e.path === 'static')
    .map((e) => e.pkg);

/** Every diagnostic with a code. */
export const diags = (code: DiagnosticCode): Diagnostic[] =>
  getRepoModel().diagnostics.filter((d) => d.code === code);

export const points = (): ExtensionPoint[] => getRepoModel().points;

export const point = (id: string): ExtensionPoint => {
  const found = points().find((p) => p.id === id);
  if (!found) {
    throw new Error(`No extension point ${id} in the repo model`);
  }
  return found;
};

/** Sorted ids of the points whose id starts with `prefix`. */
export const pointIdsStartingWith = (prefix: string): string[] =>
  points()
    .map((p) => p.id)
    .filter((id) => id.startsWith(prefix))
    .toSorted();

export const extensions = (): ExtensionRecord[] => getRepoModel().extensions;

/** Extensions attributed to a display package. */
export const extsOf = (pkgName: string): ExtensionRecord[] =>
  extensions().filter((e) => e.pkg === pkgName);

/** Sorted, unique extension types a package contributes, limited to those starting with `prefix`. */
export const typesOf = (pkgName: string, prefix: string): string[] =>
  [
    ...new Set(
      extsOf(pkgName)
        .map((e) => e.type)
        .filter((type) => type.startsWith(prefix)),
    ),
  ].toSorted();

/** Sorted, unique display packages contributing an extension of a type. */
export const contributors = (type: string): string[] =>
  [
    ...new Set(
      extensions()
        .filter((e) => e.type === type)
        .map((e) => e.pkg),
    ),
  ].toSorted();

/** The readable name of a flag value: `Enum.MEMBER`, a constant name, or a literal. */
const flagName = (value: Value): string => {
  switch (value.kind) {
    case 'enumMember':
      return `${value.enumName}.${value.member}`;
    case 'constant':
      return value.name;
    case 'literal':
      return String(value.value);
    default:
      return value.kind;
  }
};

/** Sorted, unique readable names of every flag a package's extensions require or disallow. */
export const flagNames = (pkgName: string): string[] =>
  [
    ...new Set(
      extsOf(pkgName).flatMap((e) => [...e.flags.required, ...e.flags.disallowed].map(flagName)),
    ),
  ].toSorted();
