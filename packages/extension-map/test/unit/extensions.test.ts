import { analyzeFixture, diagCodes } from '../helpers/fixture';
import type { ExtensionMapModel, ExtensionRecord } from '../../src/model/types';

const m: ExtensionMapModel = analyzeFixture('records');

const ext = (type: string): ExtensionRecord => {
  const found = m.extensions.filter((e) => e.type === type);
  if (found.length !== 1) {
    throw new Error(
      `Expected one '${type}' extension, found ${found.length} in [${m.extensions
        .map((e) => e.type)
        .join(', ')}]`,
    );
  }
  return found[0];
};

describe('extensions', () => {
  it('records generated extensions once with multiplicity', () => {
    expect(ext('app.route').multiplicity).toBe(3);
    expect(ext('app.route').mappedValues).toEqual([
      { kind: 'literal', value: '/fx/routes/a' },
      { kind: 'literal', value: '/fx/routes/b' },
      { kind: 'literal', value: '/fx/routes/c' },
    ]);
  });

  it('records a re-exported extension once with both entries', () => {
    expect(ext('fx.shared').entries).toHaveLength(2);
    expect(ext('fx.shared')).toMatchObject({
      pkg: '@fx/p',
      loc: { file: 'packages/p/src/shared.ts' },
      properties: { id: { kind: 'literal', value: 'shared' } },
    });
  });

  it('reports unrecognized elements and unknown points', () => {
    expect(diagCodes(m)).toEqual(
      expect.arrayContaining(['unresolved-element', 'extension-unknown-point']),
    );
    expect(m.extensions.map((e) => e.type)).not.toContain('fx.extra');
  });

  it('reports a value built from the mapped element as mapped, with no diagnostic', () => {
    expect(ext('app.route').properties.path).toEqual({ kind: 'mapped' });
    expect(m.diagnostics.filter((d) => d.message.includes("'path'"))).toEqual([]);
  });

  it('records a flag list it can read, and reports one it cannot', () => {
    expect(ext('fx.flagged').flags.required).toEqual([
      { kind: 'enumMember', enumName: 'Area', member: 'K_SERVE', value: 'kserve' },
    ]);
    expect(ext('fx.flagged').flags.disallowed).toHaveLength(1);
    expect(ext('fx.flagged').flags.disallowed[0].kind).toBe('unresolved');
    expect(
      m.diagnostics.filter(
        (d) => d.code === 'unresolved-value' && d.message.includes('flags.disallowed[0]'),
      ),
    ).toHaveLength(1);
  });

  it('reports a mapped array it cannot count', () => {
    expect(ext('fx.generated').multiplicity).toBe('unknown');
    expect(ext('fx.generated').mappedValues).toBeUndefined();
    expect(diagCodes(m)).toContain('multiplicity-unknown');
  });

  it('merges a spread extension, with the element as its own declaration', () => {
    const spread = ext('fx.spread');
    expect(spread.loc).toMatchObject({ file: 'packages/p/src/entry.ts', line: 23 });
    expect(spread.properties).toEqual({
      id: { kind: 'literal', value: 'base' },
      label: { kind: 'literal', value: 'Override' },
    });
    expect(spread.flags.required).toEqual([
      { kind: 'enumMember', enumName: 'Area', member: 'K_SERVE', value: 'kserve' },
    ]);
  });

  it('refuses an extensions array held by a let binding', () => {
    expect(m.extensions.map((e) => e.type)).not.toContain('fx.loose');
    expect(
      m.diagnostics.filter(
        (d) => d.code === 'unresolved-element' && d.loc?.file === 'packages/p/src/entry.ts',
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('reads supplies from a CodeRef target object', () => {
    expect(ext('fx.field').properties.field).toMatchObject({
      kind: 'codeRef',
      supplies: { externalDataHook: { kind: 'symbol', name: 'useData' } },
    });
  });

  it('records the const an extension is bound to, through satisfies', () => {
    expect(ext('fx.field').binding).toBe('fieldExtension');
    expect(ext('fx.spread').binding).toBe('spreadExtension');
    expect(ext('fx.wrapped').binding).toBe('wrappedExtension');
  });

  it('records no binding for a literal written inline or in a .map() callback', () => {
    expect(ext('fx.flagged')).not.toHaveProperty('binding');
    expect(ext('fx.shared')).not.toHaveProperty('binding');
    expect(ext('app.route')).not.toHaveProperty('binding');
  });

  it('names a code-like constant as a reference, without a diagnostic', () => {
    expect(ext('fx.wrapped').properties.schema).toEqual({
      kind: 'reference',
      name: 'wrappedSchema',
      loc: { file: 'packages/p/src/wrapped.ts', line: 10 },
    });
    const wrapped = m.diagnostics.filter(
      (d) => d.code === 'unresolved-value' && d.message.includes("'fx.wrapped'"),
    );
    expect(wrapped.map((d) => d.message).toSorted()).toEqual([
      expect.stringContaining("'label'"),
      expect.stringContaining("'route'"),
    ]);
  });

  it('keeps a computed route and an inline call unresolved', () => {
    expect(ext('fx.wrapped').properties.route).toMatchObject({ kind: 'unresolved' });
    expect(ext('fx.wrapped').properties.label).toMatchObject({ kind: 'unresolved' });
  });
});
