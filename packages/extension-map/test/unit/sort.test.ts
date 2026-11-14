import { sortModel } from '../../src/model/sort';
import type { ExtensionMapModel, Loc, Value } from '../../src/model/types';

const loc = (file: string, line: number, endLine?: number): Loc => ({ file, line, endLine });

const literal = (value: string): Value => ({ kind: 'literal', value });

/** Deliberately shuffled: every sortable array starts out of order. */
const makeModel = (): ExtensionMapModel => ({
  version: 1,
  packages: [
    {
      name: 'pkg-b',
      dir: 'packages/pkg-b',
      kind: 'package',
      docsDir: 'docs',
      upstreamDirs: ['up/2', 'up/1'],
    },
    {
      name: 'pkg-a',
      dir: 'packages/pkg-a',
      kind: 'package',
      docsDir: 'docs',
      upstreamDirs: ['u/9', 'u/1'],
    },
  ],
  entries: [
    { id: 'e2', pkg: 'pkg-b', file: 'f2.ts', path: 'federated', key: 'k2' },
    { id: 'e1', pkg: 'pkg-a', file: 'f1.ts', path: 'static', key: 'k1' },
  ],
  apps: [
    { id: 'app-z', entries: [{ entry: 'e2' }, { entry: 'e1' }], featureFlags: {} },
    { id: 'host', entries: [], featureFlags: {} },
  ],
  points: [
    {
      id: 'p2',
      pkg: 'pkg-b',
      typeName: 'P2',
      loc: loc('f2.ts', 10),
      typeParams: ['T', 'U'],
      guards: ['g-b', 'g-a'],
      doc: {
        see: ['see-2', 'see-1'],
        links: ['link-2', 'link-1'],
        extensionData: ['ed-2', 'ed-1'],
      },
      properties: [
        { name: 'prop-b', optional: true, typeText: 'string' },
        { name: 'prop-a', optional: false, typeText: 'number' },
      ],
    },
    {
      id: 'p1',
      pkg: 'pkg-a',
      typeName: 'P1',
      loc: loc('f1.ts', 5),
      typeParams: [],
      guards: [],
      doc: { see: [], links: [], extensionData: [] },
      properties: [],
    },
  ],
  guards: [
    { name: 'same', loc: loc('b.ts', 2), style: 'inline', pointIds: ['p9', 'p2'] },
    { name: 'same', loc: loc('a.ts', 1), style: 'factory', pointIds: [] },
    { name: 'g-x', loc: loc('c.ts', 1), style: 'parameterized', pointIds: [] },
  ],
  extensions: [
    {
      key: 'k2',
      type: 'p2',
      pkg: 'pkg-b',
      loc: loc('f2.ts', 20),
      entries: ['e2', 'e1'],
      apps: [
        { app: 'b-app', via: 'static' },
        { app: 'a-app', via: 'federated' },
        { app: 'a-app', via: 'bundled' },
      ],
      flags: { required: [literal('flag-b'), literal('flag-a')], disallowed: [] },
      properties: {},
    },
    {
      key: 'k1',
      type: 'p1',
      pkg: 'pkg-a',
      loc: loc('f1.ts', 9),
      entries: [],
      apps: [],
      flags: { required: [], disallowed: [] },
      properties: {},
    },
  ],
  overrides: [
    {
      kind: 'patch',
      app: 'a-app',
      by: 'k2',
      targetType: literal('t'),
      targetId: literal('id-2'),
      targets: ['t2', 't1'],
      effect: 'applied',
      ignoredKeys: ['ik-2', 'ik-1'],
    },
    {
      kind: 'patch',
      app: 'a-app',
      by: 'k2',
      targetType: literal('t'),
      targetId: literal('id-1'),
      targets: ['t0'],
      effect: 'applied',
    },
  ],
  consumers: [
    {
      id: 'c2',
      pkg: 'pkg-b',
      symbol: 'useC2',
      loc: loc('g2.ts', 3),
      renderedIn: [
        { symbol: 's-b', loc: loc('g.ts', 9), how: 'jsx' },
        { symbol: 's-a', loc: loc('g.ts', 9), how: 'call' },
        { symbol: 's-z', loc: loc('g.ts', 1), how: 'jsx' },
      ],
    },
    { id: 'c1', pkg: 'pkg-a', symbol: 'useC1', loc: loc('g1.ts', 3), renderedIn: [] },
  ],
  querySites: [
    {
      consumer: 'c2',
      pointIds: ['p2', 'p1'],
      hook: 'useExtensions',
      resolved: true,
      loc: loc('z.ts', 5),
      provenance: 'declared',
    },
    {
      consumer: 'c1',
      pointIds: ['p9', 'p3'],
      hook: 'useResolvedExtensions',
      resolved: true,
      loc: loc('z.ts', 5),
      provenance: 'type-resolved',
    },
  ],
  useSites: [
    {
      consumer: 'c2',
      pointId: 'p2',
      path: 'props.x',
      kind: 'read',
      direct: false,
      oneOf: ['t2', 't1'],
      loc: loc('y.ts', 7),
      provenance: 'derived',
    },
    {
      consumer: 'c1',
      pointId: 'p1',
      path: 'props.a',
      kind: 'read',
      direct: true,
      loc: loc('y.ts', 7),
      provenance: 'derived',
    },
  ],
  carriedTypes: [
    {
      name: 'ct-b',
      loc: loc('h2.ts', 1),
      pointIds: ['p2', 'p1'],
      source: 'inferred',
      builtOutsideExtensions: [loc('b.ts', 9), loc('a.ts', 1), loc('a.ts', 1, 3)],
    },
    {
      name: 'ct-a',
      loc: loc('h1.ts', 1),
      pointIds: [],
      source: 'jsdoc',
      builtOutsideExtensions: [],
    },
  ],
  diagnostics: [
    { code: 'point-unused', severity: 'warning', message: 'm-b', loc: loc('b.ts', 1) },
    { code: 'point-no-jsdoc', severity: 'warning', message: 'm-a', loc: loc('a.ts', 1) },
  ],
});

describe('sortModel', () => {
  it('sorts every top-level array by its stable key', () => {
    const m = sortModel(makeModel());
    expect(m.packages.map((p) => p.name)).toEqual(['pkg-a', 'pkg-b']);
    expect(m.entries.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(m.apps.map((a) => a.id)).toEqual(['app-z', 'host']);
    expect(m.points.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(m.guards.map((g) => `${g.name}:${g.loc.file}`)).toEqual([
      'g-x:c.ts',
      'same:a.ts',
      'same:b.ts',
    ]);
    expect(m.extensions.map((e) => e.key)).toEqual(['k1', 'k2']);
    expect(m.overrides.map((o) => o.targetId)).toEqual([
      { kind: 'literal', value: 'id-1' },
      { kind: 'literal', value: 'id-2' },
    ]);
    expect(m.consumers.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(m.querySites.map((q) => q.consumer)).toEqual(['c1', 'c2']);
    expect(m.useSites.map((u) => `${u.consumer}:${u.pointId}`)).toEqual(['c1:p1', 'c2:p2']);
    expect(m.carriedTypes.map((c) => c.name)).toEqual(['ct-a', 'ct-b']);
    expect(m.diagnostics.map((d) => `${d.code}:${d.loc?.file ?? ''}`)).toEqual([
      'point-no-jsdoc:a.ts',
      'point-unused:b.ts',
    ]);
  });

  it('sorts nested stable-key arrays', () => {
    const m = sortModel(makeModel());
    expect(m.packages[0]?.upstreamDirs).toEqual(['u/1', 'u/9']);
    expect(m.points[1]?.guards).toEqual(['g-a', 'g-b']);
    expect(m.guards[2]?.pointIds).toEqual(['p2', 'p9']);
    expect(m.extensions[1]?.entries).toEqual(['e1', 'e2']);
    expect(m.extensions[1]?.apps.map((a) => `${a.app}:${a.via}`)).toEqual([
      'a-app:bundled',
      'a-app:federated',
      'b-app:static',
    ]);
    expect(m.overrides[1]?.targets).toEqual(['t1', 't2']);
    expect(m.overrides[1]?.ignoredKeys).toEqual(['ik-1', 'ik-2']);
    expect(m.querySites[0]?.pointIds).toEqual(['p3', 'p9']);
    expect(m.querySites[1]?.pointIds).toEqual(['p1', 'p2']);
    expect(m.useSites[1]?.oneOf).toEqual(['t1', 't2']);
    expect(m.carriedTypes[1]?.pointIds).toEqual(['p1', 'p2']);
    expect(m.carriedTypes[1]?.builtOutsideExtensions).toEqual([
      loc('a.ts', 1),
      loc('a.ts', 1, 3),
      loc('b.ts', 9),
    ]);
  });

  it('breaks stable-key ties with secondary keys', () => {
    const m = sortModel(makeModel());
    // Same guard name in two files: loc breaks the tie.
    expect(m.guards.map((g) => `${g.name}:${g.loc.file}`)).toEqual([
      'g-x:c.ts',
      'same:a.ts',
      'same:b.ts',
    ]);
    // Same loc for two query sites: consumer breaks the tie.
    expect(m.querySites.map((q) => q.consumer)).toEqual(['c1', 'c2']);
    // Same loc for two use sites: consumer, pointId and path break the tie.
    expect(m.useSites.map((u) => `${u.consumer}:${u.pointId}:${u.path}`)).toEqual([
      'c1:p1:props.a',
      'c2:p2:props.x',
    ]);
    // Same app/by/kind for two overrides: sorted targets break the tie.
    expect(m.overrides.map((o) => o.targets.join(','))).toEqual(['t0', 't1,t2']);
    // Same loc for two renderedIn entries: symbol breaks the tie.
    expect(m.consumers[1]?.renderedIn.map((r) => r.symbol)).toEqual(['s-z', 's-a', 's-b']);
  });

  it('preserves semantically ordered arrays', () => {
    const m = sortModel(makeModel());
    // App catalogs keep catalog order.
    expect(m.apps[0]?.entries.map((e) => e.entry)).toEqual(['e2', 'e1']);
    // Point type parameters keep declaration order.
    expect(m.points[1]?.typeParams).toEqual(['T', 'U']);
    // Point properties keep the point type's declared order.
    expect(m.points[1]?.properties.map((p) => p.name)).toEqual(['prop-b', 'prop-a']);
    // Doc arrays keep JSDoc source order.
    expect(m.points[1]?.doc.see).toEqual(['see-2', 'see-1']);
    expect(m.points[1]?.doc.links).toEqual(['link-2', 'link-1']);
    expect(m.points[1]?.doc.extensionData).toEqual(['ed-2', 'ed-1']);
    // Source value arrays keep declaration order.
    expect(m.extensions[1]?.flags.required).toEqual([
      { kind: 'literal', value: 'flag-b' },
      { kind: 'literal', value: 'flag-a' },
    ]);
  });

  it('does not mutate the input model', () => {
    const input = makeModel();
    sortModel(input);
    expect(input.extensions[0]?.apps.map((a) => a.app)).toEqual(['b-app', 'a-app', 'a-app']);
    expect(input.querySites[0]?.pointIds).toEqual(['p2', 'p1']);
    expect(input.carriedTypes[0]?.builtOutsideExtensions).toEqual([
      loc('b.ts', 9),
      loc('a.ts', 1),
      loc('a.ts', 1, 3),
    ]);
    expect(input.overrides[0]?.targets).toEqual(['t2', 't1']);
  });
});
