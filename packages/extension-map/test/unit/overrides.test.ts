import { applyOverrides } from '../../src/composition/overrides';
import type { App, ExtensionRecord, Override, Value } from '../../src/model/types';

const APP: App = { id: 'app', entries: [], featureFlags: {} };

/** A type the plugin store has a patch schema for. */
const NAV = 'app.navigation/href';

const UNRESOLVED: Value = {
  kind: 'unresolved',
  reason: 'a call',
  loc: { file: 'src/catalog.ts', line: 1 },
};

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

const patchWith = (type: string, id: string, props: Record<string, Value>): ExtensionRecord =>
  record('app.patch', {
    targetType: lit(type),
    targetId: lit(id),
    patch: { kind: 'object', props },
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
    const r = effects([e(NAV, 'x'), suppress(NAV, 'x'), e(NAV, 'x')]);
    expect(r).toEqual(['removed', 'redefine']);
  });

  it('removes the redefine too when a second suppress follows it', () => {
    const r = effects([e(NAV, 'x'), suppress(NAV, 'x'), e(NAV, 'x'), suppress(NAV, 'x')]);
    expect(r).toEqual(['removed', 'removed']);
  });

  it('applies allowlisted patch keys and reports the rest', () => {
    const o = overridesOf([e(NAV, 'x'), patch(NAV, 'x', { group: 'g', href: '/h' })])[0];
    expect(o).toMatchObject({ effect: 'applied', ignoredKeys: ['href'] });
  });

  it('treats a patch on a suppressed target as a no-op', () => {
    const o = overridesOf([e(NAV, 'x'), suppress(NAV, 'x'), patch(NAV, 'x', { group: 'g' })]);
    expect(o.find((x) => x.kind === 'patch')).toMatchObject({ effect: 'noop-suppressed' });
  });

  it('keeps only the last patch per key', () => {
    const catalog = [e(NAV, 'x'), patch(NAV, 'x', { group: 'a' }), patch(NAV, 'x', { group: 'b' })];
    expect(overridesOf(catalog).filter((x) => x.effect === 'applied')).toHaveLength(1);
  });

  it('reports an unresolved target id instead of matching it', () => {
    expect(overridesOf([e(NAV, 'x'), suppressUnresolved(NAV)])[0].effect).toBe('unresolved');
  });

  it('marks the earlier of two patches of one key as superseded', () => {
    const catalog = [e(NAV, 'x'), patch(NAV, 'x', { group: 'a' }), patch(NAV, 'x', { group: 'b' })];
    expect(overridesOf(catalog).map((o) => o.effect)).toEqual(['superseded', 'applied']);
  });

  it('names the removed registrations as the targets of a suppress', () => {
    const target = e(NAV, 'x');
    const other = e(NAV, 'y');
    const o = overridesOf([target, other, suppress(NAV, 'x')])[0];
    expect(o).toMatchObject({ kind: 'suppress', effect: 'removed', targets: [target.key] });
  });

  it('matches on the type as well as the id', () => {
    expect(effects([e('app.route', 'x'), suppress(NAV, 'x')])).toEqual(['kept']);
  });

  it('reports a suppress that matches nothing', () => {
    const catalog = [e(NAV, 'x'), suppress(NAV, 'nope')];
    expect(overridesOf(catalog)[0].effect).toBe('noop-missing');
    expect(diagnosticCodes(catalog)).toEqual(['suppress-no-match']);
  });

  it('reports a patch whose target is missing or suppressed', () => {
    expect(diagnosticCodes([patch(NAV, 'x', { group: 'g' })])).toEqual(['patch-noop-missing']);
    expect(diagnosticCodes([e(NAV, 'x'), suppress(NAV, 'x'), patch(NAV, 'x', {})])).toEqual([
      'patch-noop-suppressed',
    ]);
  });

  it('reports ignored patch keys', () => {
    expect(diagnosticCodes([e(NAV, 'x'), patch(NAV, 'x', { href: '/h' })])).toEqual([
      'patch-ignored-keys',
    ]);
  });

  it('cannot match a target whose id is not proven', () => {
    const unproven = record(NAV, {
      id: { kind: 'unresolved', reason: 'a call', loc: { file: 'src/catalog.ts', line: 1 } },
    });
    const catalog = [unproven, suppress(NAV, 'x')];
    expect(overridesOf(catalog)[0].effect).toBe('unresolved');
    expect(diagnosticCodes(catalog)).toEqual(['unresolved-override']);
  });

  it('ignores a registration that has no id', () => {
    const noId = record(NAV, {});
    expect(overridesOf([noId, suppress(NAV, 'x')])[0].effect).toBe('noop-missing');
  });

  it('names the redefined registrations as the targets of a redefine', () => {
    const first = e(NAV, 'x');
    const second = e(NAV, 'x');
    const o = overridesOf([first, suppress(NAV, 'x'), second]).find((x) => x.kind === 'redefine');
    expect(o).toMatchObject({ by: second.key, targets: [first.key], effect: 'applied' });
  });

  it('drops a patch whose target type has no patch schema', () => {
    const catalog = [e('app.route', 'x'), patch('app.route', 'x', { group: 'g' })];
    expect(overridesOf(catalog)[0].effect).toBe('dropped');
    expect(diagnosticCodes(catalog)).toEqual(['patch-dropped']);
  });

  it('drops a patch whose payload fails the nav patch schema', () => {
    expect(overridesOf([e(NAV, 'x'), patch(NAV, 'x', { group: null })])[0].effect).toBe('dropped');
    expect(
      overridesOf([
        e(NAV, 'x'),
        patchWith(NAV, 'x', {
          dataAttributes: { kind: 'object', props: { notData: lit('v') } },
        }),
      ])[0].effect,
    ).toBe('dropped');
  });

  it('lets a clearable key be null', () => {
    expect(overridesOf([e(NAV, 'x'), patch(NAV, 'x', { section: null })])[0].effect).toBe(
      'applied',
    );
  });

  it('keeps the earlier valid patch applied when the last one is dropped', () => {
    const catalog = [
      e(NAV, 'x'),
      patch(NAV, 'x', { group: 'a' }),
      patch(NAV, 'x', { group: null }),
    ];
    expect(overridesOf(catalog).map((o) => o.effect)).toEqual(['applied', 'dropped']);
  });

  it('makes an earlier patch unresolved when a later one cannot be proven valid', () => {
    const catalog = [
      e(NAV, 'x'),
      patch(NAV, 'x', { group: 'a' }),
      patchWith(NAV, 'x', { group: UNRESOLVED }),
    ];
    expect(overridesOf(catalog).map((o) => o.effect)).toEqual(['unresolved', 'unresolved']);
  });

  it('makes every override of a type unresolved when a suppress of that type is unproven', () => {
    const catalog = [
      e(NAV, 'x'),
      suppress(NAV, 'x'),
      suppressUnresolved(NAV),
      patch(NAV, 'y', { group: 'g' }),
    ];
    expect(overridesOf(catalog).map((o) => o.effect)).toEqual([
      'unresolved',
      'unresolved',
      'unresolved',
    ]);
  });

  it('makes other patches of a type unresolved when a patch target of that type is unproven', () => {
    const unproven = record('app.patch', {
      targetType: lit(NAV),
      targetId: UNRESOLVED,
      patch: { kind: 'object', props: { group: lit('g') } },
    });
    expect(overridesOf([e(NAV, 'x'), patch(NAV, 'x', { group: 'a' }), unproven])[0].effect).toBe(
      'unresolved',
    );
  });

  it('drops a suppress whose target is an empty string, as the store ignores it', () => {
    const catalog = [e(NAV, 'x'), suppress(NAV, ''), e(NAV, '')];
    expect(overridesOf(catalog).map((o) => o.effect)).toEqual(['dropped']);
    expect(diagnosticCodes(catalog)).toEqual(['suppress-dropped']);
  });

  it('reports no redefine when the suppress removed nothing', () => {
    const catalog = [suppress(NAV, 'x'), e(NAV, 'x')];
    expect(overridesOf(catalog).map((o) => o.kind)).toEqual(['suppress']);
  });
});
