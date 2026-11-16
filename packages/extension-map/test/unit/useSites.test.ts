import { analyzeFixture } from '../helpers/fixture';
import type { ExtensionMapModel, UseSite } from '../../src/model/types';

const m: ExtensionMapModel = analyzeFixture('uses');

const symbolOf = (consumer: string): string => consumer.slice(consumer.indexOf('#') + 1);
const fileOf = (consumer: string): string => consumer.slice(0, consumer.indexOf('#'));

const usesBy = (symbol: string, pointId: string): UseSite[] =>
  m.useSites.filter((u) => symbolOf(u.consumer) === symbol && u.pointId === pointId);

/** A consumer's property use of a point: the one that does more than read, when there is one. */
const use = (symbol: string, pointId: string): UseSite | undefined => {
  const uses = usesBy(symbol, pointId).filter((u) => u.path.startsWith('properties'));
  return uses.find((u) => u.kind !== 'read') ?? uses[0];
};

const usesInFile = (basename: string): UseSite[] =>
  m.useSites.filter((u) => fileOf(u.consumer).endsWith(`/${basename}`));

const renderedIn = (symbol: string): string[] =>
  m.consumers.find((c) => c.symbol === symbol)?.renderedIn.map((r) => r.symbol) ?? [];

const pointDiags = (code: string): (string | undefined)[] =>
  m.diagnostics
    .filter((d) => d.code === code)
    .map((d) => d.pointId)
    .toSorted();

describe('use sites', () => {
  it('follows extensions through props into other files', () => {
    expect(use('Row', 'fx.a')).toMatchObject({
      path: 'properties.component',
      kind: 'lazy-render',
      direct: true,
      provenance: 'type-resolved',
      loc: { file: 'packages/a/src/Row.tsx', line: 10 },
    });
  });

  it('records every property chain read from an extension, stopping before built-in members', () => {
    expect(
      usesBy('Row', 'fx.a')
        .map((u) => [u.path, u.kind])
        .toSorted(),
    ).toEqual([
      ['properties.component', 'lazy-render'],
      ['properties.items', 'read'],
      ['properties.label', 'read'],
    ]);
  });

  it('ignores LazyCodeRefComponent and HookNotify fed by properties of objects that are not extensions', () => {
    expect(usesInFile('RemoteLoader.tsx')).toEqual([]);
  });

  it('marks union receivers oneOf and skips generic receivers', () => {
    expect(use('either', 'fx.a')?.oneOf).toEqual(['fx.a', 'fx.b']);
    expect(use('either', 'fx.b')?.oneOf).toEqual(['fx.a', 'fx.b']);
    expect(usesInFile('genericHelper.ts')).toEqual([]);
  });

  it('records no use inside an extension declaration', () => {
    expect(usesInFile('contrib.ts')).toEqual([]);
  });

  it('classifies JSX renders, hook runs and calls', () => {
    expect(use('IconCell', 'fx.b')).toMatchObject({ path: 'properties.icon', kind: 'jsx-render' });
    expect(use('InlineIcon', 'fx.b')).toMatchObject({
      path: 'properties.icon',
      kind: 'jsx-render',
    });
    expect(use('Notifier', 'fx.b')).toMatchObject({
      path: 'properties.useValue',
      kind: 'hook-run',
    });
    expect(use('useValueOf', 'fx.b')).toMatchObject({
      path: 'properties.useValue',
      kind: 'hook-run',
    });
    expect(use('runIt', 'fx.b')).toMatchObject({ path: 'properties.run', kind: 'call' });
    expect(use('Slot', 'fx.b')).toMatchObject({ path: 'properties.label', kind: 'read' });
  });

  it('gives one use per destructured property, classified by how its binding is used', () => {
    expect(
      usesBy('Destructured', 'fx.b')
        .map((u) => [u.path, u.kind])
        .toSorted(),
    ).toEqual([
      ['properties.icon', 'jsx-render'],
      ['properties.label', 'read'],
    ]);
  });

  it('records one hop up and no further', () => {
    expect(renderedIn('Slot')).toEqual(['Parent']);
    expect(m.consumers.find((c) => c.symbol === 'Slot')?.renderedIn).toEqual([
      { symbol: 'Parent', loc: { file: 'packages/a/src/Parent.tsx', line: 7 }, how: 'jsx' },
    ]);
  });

  it('records where a consumer is rendered, even in another file', () => {
    expect(renderedIn('Row')).toEqual(['List']);
  });
});

describe('point usage diagnostics', () => {
  it('reports points nothing contributes to or nothing consumes', () => {
    // fx.a has contributions and consumers; fx.b has consumers only.
    expect(pointDiags('point-no-contributors')).toEqual(['fx.b']);
    expect(pointDiags('point-no-consumers')).toEqual([]);
    expect(pointDiags('point-unused')).toEqual([]);
  });
});
