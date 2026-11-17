import fs from 'node:fs';
import path from 'node:path';
import { findRepoRoot } from '../../src/repoRoot';
import { runAnalysis } from '../../src/runtime/runAnalysis';

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

/** Analyzes the real repo in an isolated child and caches its model for repo tests. */
export default async (): Promise<void> => {
  if (process.env.EXTENSION_MAP_REUSE_MODEL === '1' && fs.existsSync(repoModelPath)) {
    return;
  }
  const model = await runAnalysis({ repoRoot: findRepoRoot() });
  fs.mkdirSync(path.dirname(repoModelPath), { recursive: true });
  fs.writeFileSync(repoModelPath, JSON.stringify(model));
};
