import { spawnSync } from 'child_process';
import path from 'path';
import { emptyModel } from '../../src/model/sort';
import { analyzeFixture } from '../helpers/fixture';

const pkgDir = path.join(__dirname, '..', '..');

describe('extension-map cli', () => {
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
