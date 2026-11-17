import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeFixture } from '../helpers/fixture';
import { emptyModel } from '../../src/model/sort';
import type { ExtensionMapModel } from '../../src/model/types';

const pkgDir = path.resolve(__dirname, '..', '..');
const tsxLoader = require.resolve('tsx');

const runCli = (args: string[], cwd: string) =>
  spawnSync(
    process.execPath,
    ['--import', tsxLoader, path.join(pkgDir, 'src', 'cli.ts'), ...args],
    {
      cwd,
      encoding: 'utf8',
    },
  );

describe('extension-map CLI', () => {
  it('prints usage and exits 2 for an unknown command', () => {
    const r = spawnSync('pnpm', ['exec', 'tsx', 'src/cli.ts', 'bogus'], {
      cwd: pkgDir,
      encoding: 'utf8',
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Usage: extension-map <generate|check>');
  });

  it('analyzes an empty fixture to an empty sorted model', () => {
    expect(analyzeFixture('empty')).toEqual(emptyModel());
  });

  it('generate --json writes the model via the isolated analysis child', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-map-cli-'));
    const outFile = path.join(outDir, 'model.json');
    try {
      const r = runCli(['generate', '--json', outFile], pkgDir);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('extension-map generate: wrote');
      expect(r.stderr).toContain('extension-map:');
      // The child analyzed the real repo: the model exists and carries the
      // discovered entries (the empty stub model is gone since discovery).
      const model: ExtensionMapModel = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      expect(model.version).toBe(1);
      expect(model.entries.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
    // Pass A streams and type-checks every owned file of the real repo, which
    // can exceed an ordinary unit-test timeout; the analysis itself is not
    // run concurrently with anything else.
  }, 600_000);

  it('generate writes no output when analysis fails', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-map-cli-'));
    const outFile = path.join(outDir, 'model.json');
    try {
      // Outside the repo there is no pnpm-workspace.yaml, so analysis fails
      // before any child runs and the destination must not be written.
      const r = runCli(['generate', '--json', outFile], outDir);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('extension-map generate:');
      expect(fs.existsSync(outFile)).toBe(false);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }, 120_000);
});
