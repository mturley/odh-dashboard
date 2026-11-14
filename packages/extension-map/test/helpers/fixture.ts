import fs from 'fs';
import path from 'path';
import { analyzeRepo } from '../../src/analyze';
import type { AnalyzeOptions } from '../../src/analyze';
import type { ExtensionMapModel, WorkspacePackage } from '../../src/model/types';

export const fixtureDir = (name: string): string => path.join(__dirname, '..', 'fixtures', name);

export const analyzeFixture = (name: string, opts?: Partial<AnalyzeOptions>): ExtensionMapModel => {
  const repoRoot = fixtureDir(name);
  const parsed: unknown = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'workspace.json'), 'utf8'),
  );
  if (!Array.isArray(parsed)) {
    throw new Error(`${name}/workspace.json must contain an array`);
  }
  const workspace: WorkspacePackage[] = parsed;
  return analyzeRepo({ repoRoot, workspace, ...opts });
};
