import { analyzeFixture, codes, fixtureDir, readWorkspace } from '../helpers/fixture';
import { forwardingCollector, resolveWrappers } from '../../src/consumers/wrappers';
import type { ForwardEdge } from '../../src/consumers/wrappers';
import type { ExtensionMapModel, QuerySite, UseSite } from '../../src/model/types';
import { runPass } from '../../src/programs/stream';

const m: ExtensionMapModel = analyzeFixture('consumers');

const symbolOf = (consumer: string): string => consumer.slice(consumer.indexOf('#') + 1);
const fileOf = (consumer: string): string => consumer.slice(0, consumer.indexOf('#'));

const site = (symbol: string, pointId: string): QuerySite | undefined =>
  m.querySites.find((q) => symbolOf(q.consumer) === symbol && q.pointIds.includes(pointId));

const sitesInFile = (basename: string): QuerySite[] =>
  m.querySites.filter((q) => fileOf(q.consumer).endsWith(`/${basename}`));

const use = (symbol: string, pointId: string): UseSite | undefined =>
  m.useSites.find((u) => symbolOf(u.consumer) === symbol && u.pointId === pointId);

const diagsOf = (code: string): string[] =>
  m.diagnostics
    .filter((d) => d.code === code)
    .map((d) => `${d.loc?.file ?? ''}:${d.loc?.line ?? 0}`);

describe('query sites', () => {
  it('records direct query sites with the resolved flag', () => {
    expect(site('useDirect', 'fx.a')).toMatchObject({
      hook: 'useExtensions',
      resolved: false,
      provenance: 'type-resolved',
      loc: { file: 'packages/a/src/direct.ts', line: 7 },
    });
    expect(site('useDirect', 'fx.a')?.wrapper).toBeUndefined();
    expect(site('useDirectResolved', 'fx.b')).toMatchObject({
      hook: 'useResolvedExtensions',
      resolved: true,
    });
  });

  it('recognizes inline and useCallback-wrapped guards by type', () => {
    expect(site('useInline', 'fx.a')).toBeDefined();
    expect(site('useParameterized', 'fx.a')).toBeDefined();
  });

  it('records wrapper call sites, not the generic call inside the wrapper', () => {
    expect(sitesInFile('useMine.ts')).toEqual([]);
    expect(sitesInFile('Loader.tsx')).toEqual([]);
    expect(sitesInFile('useResolvedExtensions.ts')).toEqual([]);
    expect(site('useViaWrapper', 'fx.a')).toMatchObject({
      wrapper: 'useMine',
      hook: 'useExtensions',
    });
  });

  it('follows two-level and JSX-prop wrappers', () => {
    expect(site('useViaOuter', 'fx.a')).toMatchObject({ wrapper: 'useOuter' });
    expect(site('Screen', 'fx.a')).toMatchObject({ wrapper: 'Loader' });
  });

  it('records filter uses and reports unknown callees', () => {
    expect(use('pickA', 'fx.a')).toMatchObject({ kind: 'filter', path: 'type', direct: true });
    expect(codes(m).map(([code]) => code)).toEqual(
      expect.arrayContaining(['guard-unknown-callee', 'point-id-literal']),
    );
  });

  it('reports only the guard given to an unknown callee, not one handed back by useCallback', () => {
    expect(diagsOf('guard-unknown-callee')).toEqual(['packages/a/src/register.ts:10']);
  });

  it('reports point ids written outside point files and extension literals', () => {
    expect(diagsOf('point-id-literal')).toEqual([
      'packages/a/src/inline.ts:9',
      'packages/a/src/register.ts:12',
    ]);
  });

  it('reports a guard that selects no known point, and records no site for it', () => {
    expect(diagsOf('query-unknown-point')).toEqual(['packages/a/src/inline.ts:12']);
    expect(site('useNope', 'fx.nope')).toBeUndefined();
  });

  it('names each consumer after its nearest enclosing symbol', () => {
    expect(m.consumers.map((c) => c.id)).toEqual([
      'packages/a/src/Screen.tsx#Screen',
      'packages/a/src/direct.ts#useDirect',
      'packages/a/src/direct.ts#useDirectResolved',
      'packages/a/src/inline.ts#useInline',
      'packages/a/src/parameterized.ts#useParameterized',
      'packages/a/src/pick.ts#pickA',
      'packages/a/src/viaWrapper.ts#useViaWrapper',
      'packages/b/src/viaOuter.ts#useViaOuter',
    ]);
    expect(m.consumers.find((c) => c.symbol === 'useViaOuter')).toMatchObject({
      pkg: '@fx/b',
      loc: { file: 'packages/b/src/viaOuter.ts', line: 5 },
      renderedIn: [],
    });
  });
});

describe('wrappers', () => {
  const edges = (): ForwardEdge[] => {
    const collector = forwardingCollector();
    runPass(fixtureDir('consumers'), readWorkspace('consumers'), [collector], {});
    return collector.finish();
  };

  it('finds wrappers through any number of levels and across packages, but not query hooks', () => {
    const wrappers = [...resolveWrappers(edges()).values()].flat();
    expect(wrappers.map((w) => [w.name, w.param, w.hook]).toSorted()).toEqual([
      ['Loader', 'predicate', 'useExtensions'],
      ['useMine', 0, 'useExtensions'],
      ['useOuter', 0, 'useExtensions'],
    ]);
  });

  it('only counts a parameter forwarded as the query hook’s first argument', () => {
    const hook = { hook: 'useResolvedExtensions' };
    const found = resolveWrappers([
      { fn: 'f:1', fnName: 'useOptions', param: 0, callee: hook, calleeParam: 1 },
      { fn: 'g:1', fnName: 'useGuarded', param: 'p', callee: hook, calleeParam: 0 },
      { fn: 'h:1', fnName: 'useOuter', param: 2, callee: 'g:1', calleeParam: 'p' },
      { fn: 'i:1', fnName: 'useOther', param: 0, callee: 'g:1', calleeParam: 'q' },
    ]);
    expect([...found.keys()].toSorted()).toEqual(['g:1', 'h:1']);
    expect(found.get('h:1')).toEqual([
      { name: 'useOuter', param: 2, hook: 'useResolvedExtensions', resolved: true },
    ]);
  });
});
