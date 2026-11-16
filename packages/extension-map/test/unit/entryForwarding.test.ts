import fs from 'node:fs';
import path from 'node:path';
import { analyzeRepo } from '../../src/analyze';
import type { ExtensionMapModel, WorkspacePackage } from '../../src/model/types';
import { fixtureDir } from '../helpers/fixture';

const analyzeCyclicEntry = (): ExtensionMapModel => {
  const root = fixtureDir('entry-forwarding');
  const sourceDir = path.join(root, 'packages/p/src');
  const sources: Record<string, string> = {
    'anchor.ts': "export const anchor = 'anchor';\n",
    'cycle-entry.ts': "export { default } from './cycle-a.js';\n",
    'cycle-a.ts': "export { default } from './cycle-b.js';\n",
    'cycle-b.ts': "export { default } from './cycle-a.js';\n",
  };
  fs.mkdirSync(sourceDir, { recursive: true });
  try {
    for (const [file, contents] of Object.entries(sources)) {
      fs.writeFileSync(path.join(sourceDir, file), contents);
    }
    const workspace: WorkspacePackage[] = [
      {
        name: '@fx/entry-forwarding',
        dir: 'packages/p',
        packageJson: {
          name: '@fx/entry-forwarding',
          exports: { './extensions/cycle': './src/cycle-entry.ts' },
        },
      },
    ];
    return analyzeRepo({ repoRoot: root, workspace, sourceCache: false });
  } finally {
    for (const file of Object.keys(sources)) {
      fs.rmSync(path.join(sourceDir, file), { force: true });
    }
  }
};

describe('excluded entry forwarding', () => {
  it('reports a cyclic default re-export without inventing extensions', () => {
    const model = analyzeCyclicEntry();
    expect(model.extensions).toEqual([]);
    expect(model.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unresolved-element',
          message: expect.stringContaining('cyclic default re-export'),
          loc: expect.objectContaining({ file: 'packages/p/src/cycle-b.ts' }),
        }),
      ]),
    );
  });
});
