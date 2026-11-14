import fs from 'node:fs';
import path from 'node:path';
import { analyzeRepo } from '../../src/analyze';
import { findRepoRoot } from '../../src/repoRoot';

/** Written once per `test:repo` run; `getRepoModel()` reads it. */
export const repoModelPath = path.join(
  __dirname,
  '..',
  '..',
  'node_modules',
  '.cache',
  'extension-map',
  'repo-model.json',
);

/** Analyzes the real repo and caches the model for the repo test files. */
export default (): void => {
  if (process.env.EXTENSION_MAP_REUSE_MODEL === '1' && fs.existsSync(repoModelPath)) {
    return;
  }
  const model = analyzeRepo({ repoRoot: findRepoRoot() });
  fs.mkdirSync(path.dirname(repoModelPath), { recursive: true });
  fs.writeFileSync(repoModelPath, JSON.stringify(model));
};
