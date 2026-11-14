import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { analyzeFixture } from '../helpers/fixture';
import { emptyModel } from '../../src/model/sort';

const pkgDir = path.resolve(__dirname, '..', '..');

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
});
