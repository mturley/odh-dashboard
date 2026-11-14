import fs from 'fs';
import path from 'path';
import { hostFederatedMembers, readFederationExpose } from '../../src/discovery/hostFederation';
import { analyzeFixture, codes, entryIds, fixtureDir, readWorkspace } from '../helpers/fixture';

describe('entry discovery', () => {
  const m = analyzeFixture('entries');

  it('discovers one entry per loading path', () => {
    expect(entryIds(m)).toEqual([
      '@fx/d#./extensions/static',
      '@fx/f#mf:./extensions',
      '@fx/s#./extensions',
    ]);
  });

  it('records the path kind and file of each entry', () => {
    expect(m.entries.map((e) => [e.id, e.path, e.file])).toEqual([
      ['@fx/d#./extensions/static', 'distribution-static', 'packages/d/extensions/static.ts'],
      ['@fx/f#mf:./extensions', 'federated', 'packages/f/frontend/src/odh/extensions.ts'],
      ['@fx/s#./extensions', 'static', 'packages/s/extensions.ts'],
    ]);
  });

  it('reports federation the host would not load', () => {
    expect(codes(m)).toContainEqual(['federation-not-loaded', '@fx/k']);
    expect(codes(m)).not.toContainEqual(['federation-not-loaded', '@fx/f']);
  });

  it('lists a package per display package', () => {
    expect(m.packages.map((p) => [p.name, p.kind, p.docsDir])).toEqual([
      ['@fx/d', 'package', 'packages/d/docs'],
      ['@fx/f', 'package', 'packages/f/docs'],
      ['@fx/k', 'package', 'packages/k/docs'],
      ['@fx/s', 'package', 'packages/s/docs'],
    ]);
  });
});

describe('hostFederatedMembers', () => {
  const ws = readWorkspace('entries');
  const root = fixtureDir('entries');

  it('requires a remoteEntry and an extensions expose', () => {
    expect(hostFederatedMembers(ws, root)).toEqual([
      { pkg: '@fx/f', loaded: true },
      { pkg: '@fx/k', loaded: false, reason: 'no-remoteEntry' },
    ]);
  });

  it('reads the new-format backend.remoteEntry', () => {
    const members = hostFederatedMembers(
      [
        {
          name: '@fx/n',
          dir: 'packages/f',
          packageJson: { 'module-federation': { name: 'n', backend: { remoteEntry: '/r.js' } } },
        },
      ],
      root,
    );
    expect(members).toEqual([{ pkg: '@fx/n', loaded: true }]);
  });

  it('reports a remote with a remoteEntry but no extensions expose', () => {
    const members = hostFederatedMembers(
      [
        {
          name: '@fx/s',
          dir: 'packages/s',
          packageJson: { 'module-federation': { name: 's', remoteEntry: '/r.js' } },
        },
      ],
      root,
    );
    expect(members).toEqual([{ pkg: '@fx/s', loaded: false, reason: 'no-extensions-expose' }]);
  });
});

describe('readFederationExpose', () => {
  it('resolves a literal expose to a file', () => {
    expect(readFederationExpose('packages/f', fixtureDir('entries'))).toEqual({
      file: 'packages/f/frontend/src/odh/extensions.ts',
    });
  });

  it('returns undefined without a moduleFederation.js', () => {
    expect(readFederationExpose('packages/k', fixtureDir('entries'))).toBeUndefined();
  });

  it('reports an expose that is not a literal, and never evaluates the file', () => {
    const root = fixtureDir('entries-unresolved');
    const file = path.join(root, 'packages/u/frontend/config/moduleFederation.js');
    expect(fs.readFileSync(file, 'utf8')).toContain('throw');
    expect(readFederationExpose('packages/u', root)).toEqual({
      unresolved: expect.stringContaining('./extensions'),
    });
    const m = analyzeFixture('entries-unresolved');
    expect(codes(m)).toContainEqual(['unresolved-expose', '@fx/u']);
    expect(m.entries.map((e) => e.id)).toEqual(['@fx/up#mf:./extensions']);
  });

  it('finds moduleFederation.js under upstream', () => {
    expect(readFederationExpose('packages/up', fixtureDir('entries-unresolved'))).toEqual({
      file: 'packages/up/upstream/ws/frontend/src/ext.ts',
    });
  });
});
