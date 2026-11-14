import fs from 'fs';
import path from 'path';
import { repoModelCachePath } from './model';
import { analyzeRepo } from '../../src/analyze';
import { findRepoRoot } from '../../src/repoRoot';

export default async function globalSetup(): Promise<void> {
  const cachePath = repoModelCachePath();
  if (process.env.EXTENSION_MAP_REUSE_MODEL === '1' && fs.existsSync(cachePath)) {
    return;
  }
  const model = analyzeRepo({ repoRoot: findRepoRoot() });
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(model));
}
