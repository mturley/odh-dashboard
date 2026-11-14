import fs from 'fs';
import path from 'path';
import type { ExtensionMapModel } from '../../src/model/types';

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
