import fs from 'fs';
import path from 'path';
import type {
  Diagnostic,
  DiagnosticCode,
  Entry,
  ExtensionMapModel,
  ExtensionPoint,
  Pkg,
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
