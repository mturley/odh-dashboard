import fs from 'fs';
import path from 'path';
import { analyzeRepo } from '../../src/analyze';
import type { AnalyzeOptions } from '../../src/analyze';
import type { ExtensionMapModel, WorkspacePackage } from '../../src/model/types';

export const fixtureDir = (name: string): string => path.join(__dirname, '..', 'fixtures', name);

/** Reads a fixture's `workspace.json` (dirs are relative to the fixture root). */
export const readWorkspace = (name: string): WorkspacePackage[] => {
  const parsed: unknown = JSON.parse(
    fs.readFileSync(path.join(fixtureDir(name), 'workspace.json'), 'utf8'),
  );
  if (!Array.isArray(parsed)) {
    throw new Error(`${name}/workspace.json must contain an array`);
  }
  return parsed;
};

export const analyzeFixture = (name: string, opts?: Partial<AnalyzeOptions>): ExtensionMapModel =>
  analyzeRepo({ repoRoot: fixtureDir(name), workspace: readWorkspace(name), ...opts });
