import { applyOverrides } from '../../src/composition/overrides';
import type { App, ExtensionRecord, Override, Value } from '../../src/model/types';

const APP: App = { id: 'app', entries: [], featureFlags: {} };

let position = 0;

const lit = (value: string | null): Value => ({ kind: 'literal', value });

/** A record at the next catalog position, so every helper call yields a distinct key. */
const record = (type: string, properties: Record<string, Value>): ExtensionRecord => {
  position += 1;
  return {
    key: `src/catalog.ts:${position}`,
    type,
    pkg: '@fx/p',
    loc: { file: 'src/catalog.ts', line: position },
    entries: [],
    apps: [],
    flags: { required: [], disallowed: [] },
    properties,
  };
};

const e = (type: string, id: string): ExtensionRecord => record(type, { id: lit(id) });

const suppress = (type: string, id: string): ExtensionRecord =>
  record('app.suppress', { targetType: lit(type), targetId: lit(id) });

const suppressUnresolved = (type: string): ExtensionRecord =>
  record('app.suppress', {
    targetType: lit(type),
    targetId: { kind: 'unresolved', reason: 'a call', loc: { file: 'src/catalog.ts', line: 1 } },
  });

const patch = (type: string, id: string, fields: Record<string, string | null>): ExtensionRecord =>
  record('app.patch', {
    targetType: lit(type),
    targetId: lit(id),
    patch: {
      kind: 'object',
      props: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, lit(value)])),
    },
  });

const overridesOf = (catalog: ExtensionRecord[]): Override[] =>
  applyOverrides(APP, catalog).overrides;

/** What happened to each registration (not suppress or patch) of a catalog, in catalog order. */
const effects = (catalog: ExtensionRecord[]): string[] => {
  const found = overridesOf(catalog);
  return catalog
    .filter((r) => r.type !== 'app.suppress' && r.type !== 'app.patch')
    .map((r) => {
      if (found.some((o) => o.kind === 'suppress' && o.targets.includes(r.key))) {
        return 'removed';
      }
      return found.some((o) => o.kind === 'redefine' && o.by === r.key) ? 'redefine' : 'kept';
    });
};

const diagnosticCodes = (catalog: ExtensionRecord[]): string[] =>
  applyOverrides(APP, catalog).diagnostics.map((d) => d.code);

describe('applyOverrides', () => {
  it('removes only registrations before the suppress', () => {
    const r = effects([e('app.nav', 'x'), suppress('app.nav', 'x'), e('app.nav', 'x')]);
    expect(r).toEqual(['removed', 'redefine']);
  });

  it('removes the redefine too when a second suppress follows it', () => {
    const r = effects([
      e('app.nav', 'x'),
      suppress('app.nav', 'x'),
      e('app.nav', 'x'),
      suppress('app.nav', 'x'),
    ]);
    expect(r).toEqual(['removed', 'removed']);
  });

  it('applies allowlisted patch keys and reports the rest', () => {
    const o = overridesOf([
      e('app.nav', 'x'),
      patch('app.nav', 'x', { group: 'g', href: '/h' }),
    ])[0];
    expect(o).toMatchObject({ effect: 'applied', ignoredKeys: ['href'] });
  });

  it('treats a patch on a suppressed target as a no-op', () => {
    const o = overridesOf([
      e('app.nav', 'x'),
      suppress('app.nav', 'x'),
      patch('app.nav', 'x', { group: 'g' }),
    ]);
    expect(o.find((x) => x.kind === 'patch')).toMatchObject({ effect: 'noop-suppressed' });
  });

  it('keeps only the last patch per key', () => {
    const catalog = [
      e('app.nav', 'x'),
      patch('app.nav', 'x', { group: 'a' }),
      patch('app.nav', 'x', { group: 'b' }),
    ];
    expect(overridesOf(catalog).filter((x) => x.effect === 'applied')).toHaveLength(1);
  });

  it('reports an unresolved target id instead of matching it', () => {
    expect(overridesOf([e('app.nav', 'x'), suppressUnresolved('app.nav')])[0].effect).toBe(
      'unresolved',
    );
  });

  it('marks the earlier of two patches of one key as superseded', () => {
    const catalog = [
      e('app.nav', 'x'),
      patch('app.nav', 'x', { group: 'a' }),
      patch('app.nav', 'x', { group: 'b' }),
    ];
    expect(overridesOf(catalog).map((o) => o.effect)).toEqual(['superseded', 'applied']);
  });

  it('names the removed registrations as the targets of a suppress', () => {
    const target = e('app.nav', 'x');
    const other = e('app.nav', 'y');
    const o = overridesOf([target, other, suppress('app.nav', 'x')])[0];
    expect(o).toMatchObject({ kind: 'suppress', effect: 'removed', targets: [target.key] });
  });

  it('matches on the type as well as the id', () => {
    expect(effects([e('app.route', 'x'), suppress('app.nav', 'x')])).toEqual(['kept']);
  });

  it('reports a suppress that matches nothing', () => {
    const catalog = [e('app.nav', 'x'), suppress('app.nav', 'nope')];
    expect(overridesOf(catalog)[0].effect).toBe('noop-missing');
    expect(diagnosticCodes(catalog)).toEqual(['suppress-no-match']);
  });

  it('reports a patch whose target is missing or suppressed', () => {
    expect(diagnosticCodes([patch('app.nav', 'x', { group: 'g' })])).toEqual([
      'patch-noop-missing',
    ]);
    expect(
      diagnosticCodes([e('app.nav', 'x'), suppress('app.nav', 'x'), patch('app.nav', 'x', {})]),
    ).toEqual(['patch-noop-suppressed']);
  });

  it('reports ignored patch keys', () => {
    expect(diagnosticCodes([e('app.nav', 'x'), patch('app.nav', 'x', { href: '/h' })])).toEqual([
      'patch-ignored-keys',
    ]);
  });

  it('cannot match a target whose id is not proven', () => {
    const unproven = record('app.nav', {
      id: { kind: 'unresolved', reason: 'a call', loc: { file: 'src/catalog.ts', line: 1 } },
    });
    const catalog = [unproven, suppress('app.nav', 'x')];
    expect(overridesOf(catalog)[0].effect).toBe('unresolved');
    expect(diagnosticCodes(catalog)).toEqual(['unresolved-override']);
  });

  it('ignores a registration that has no id', () => {
    const noId = record('app.nav', {});
    expect(overridesOf([noId, suppress('app.nav', 'x')])[0].effect).toBe('noop-missing');
  });

  it('names the redefined registrations as the targets of a redefine', () => {
    const first = e('app.nav', 'x');
    const second = e('app.nav', 'x');
    const o = overridesOf([first, suppress('app.nav', 'x'), second]).find(
      (x) => x.kind === 'redefine',
    );
    expect(o).toMatchObject({ by: second.key, targets: [first.key], effect: 'applied' });
  });
});
