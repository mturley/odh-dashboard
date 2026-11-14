import fs from 'node:fs';
import { repoModelPath } from './globalSetup';
import type { ExtensionMapModel } from '../../src/model/types';

/** Reads the model cached by `test/repo/globalSetup.ts`. */
export const getRepoModel = (): ExtensionMapModel => {
  const model: ExtensionMapModel = JSON.parse(fs.readFileSync(repoModelPath, 'utf8'));
  return model;
};
