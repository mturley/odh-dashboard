import { analyzeFixture } from '../helpers/fixture';
import type { App } from '../../src/model/types';

// The fixture distribution is `dist1`, not `dist`: the repo's .gitignore ignores every `dist`.
describe('app composition', () => {
  const m = analyzeFixture('apps');

  const app = (id: string): App => {
    const found = m.apps.find((a) => a.id === id);
    if (!found) {
      throw new Error(`No app ${id}`);
    }
    return found;
  };

  const recordById = (id: string) =>
    m.extensions.find((r) => {
      const value = Object.hasOwn(r.properties, 'id') ? r.properties.id : undefined;
      return value?.kind === 'literal' && value.value === id;
    });

  it('orders a distribution catalog bundled then local', () => {
    const expected = [
      '@fx/a#./extensions',
      '@fx/b#./extensions/static',
      '@fx/dist1#local:./extensions',
    ];
    expect(app('dist1').entries.map((x) => x.entry)).toEqual(expected);
  });

  it('adds a literal loadRemote as a conditional entry', () => {
    expect(app('dist1').entries.find((x) => x.entry === '@fx/rem#mf:./extensions')).toBeUndefined();
    expect(
      app('dist2').entries.find((x) => x.entry === '@fx/rem#mf:./extensions')?.conditional,
    ).toBeDefined();
  });

  it('models the host and every distribution with a distribution.yaml', () => {
    expect(m.apps.map((a) => a.id)).toEqual(['dist1', 'dist2', 'host']);
  });

  it('orders the host catalog static entries first, then loaded federated entries', () => {
    expect(app('host').entries).toEqual([
      { entry: '@fx/a#./extensions' },
      { entry: '@fx/b#./extensions' },
      { entry: '@fx/rem#mf:./extensions' },
    ]);
  });

  it('discovers a distribution-local entry relative to the distribution source', () => {
    expect(m.entries.find((e) => e.id === '@fx/dist1#local:./extensions')).toEqual({
      id: '@fx/dist1#local:./extensions',
      pkg: '@fx/dist1',
      file: 'distributions/dist1/src/extensions.ts',
      path: 'distribution-local',
      key: 'local:./extensions',
    });
  });

  it('merges global feature flags first, then per package', () => {
    expect(app('dist1').featureFlags).toEqual({ bFlag: true, globalFlag: true });
  });

  it('records the apps that include each extension', () => {
    expect(recordById('a-one')?.apps).toEqual([
      { app: 'dist1', via: '@fx/a#./extensions' },
      { app: 'host', via: '@fx/a#./extensions' },
    ]);
    expect(recordById('rem-one')?.apps).toEqual([
      { app: 'dist2', via: '@fx/rem#mf:./extensions', conditional: true },
      { app: 'host', via: '@fx/rem#mf:./extensions' },
    ]);
  });

  it('resolves the overrides of a distribution against its catalog', () => {
    const dist = m.overrides.filter((o) => o.app === 'dist1');
    expect(dist.map((o) => [o.kind, o.effect, o.targets])).toEqual([
      ['suppress', 'removed', [recordById('a-one')?.key]],
      ['patch', 'applied', [recordById('a-two')?.key]],
    ]);
  });

  it('reports a loadRemote whose remote is not a literal, in an app package only', () => {
    const found = m.diagnostics.filter((d) => d.code === 'unresolved-loadremote');
    expect(found.map((d) => [d.pkg, d.loc?.file, d.loc?.line])).toEqual([
      ['@fx/dist2', 'distributions/dist2/src/bootstrap.ts', 5],
    ]);
  });

  it('refuses a local extensionsPath that leaves the distribution, as the build does', () => {
    const found = m.diagnostics.filter((d) => d.code === 'unresolved-distribution');
    expect(found.map((d) => [d.pkg, d.message])).toEqual([
      [
        '@fx/dist2',
        'Cannot read distributions/dist2/distribution.yaml: the local extensionsPath `../outside` of escape must resolve within the distribution directory.',
      ],
    ]);
    expect(m.entries.filter((e) => e.pkg === '@fx/dist2')).toEqual([]);
  });
});
