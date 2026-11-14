import fs from 'node:fs';
import path from 'node:path';
import type { AnalyzeOptions } from '../../src/analyze';
import { analyzeRepo } from '../../src/analyze';
import type { ExtensionMapModel, WorkspacePackage } from '../../src/model/types';

export const fixtureDir = (name: string): string => path.resolve(__dirname, '..', 'fixtures', name);

/**
 * Analyzes a synthetic workspace under `test/fixtures/<name>` (which needs no
 * pnpm installation: its `workspace.json` is a `WorkspacePackage[]`).
 */
export const analyzeFixture = (
  name: string,
  opts: Partial<AnalyzeOptions> = {},
): ExtensionMapModel => {
  const workspace: WorkspacePackage[] = JSON.parse(
    fs.readFileSync(path.join(fixtureDir(name), 'workspace.json'), 'utf8'),
  );
  return analyzeRepo({ repoRoot: fixtureDir(name), workspace, ...opts });
};
