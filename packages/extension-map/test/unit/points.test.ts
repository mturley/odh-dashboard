import { analyzeFixture, diagCodes, pointIds } from '../helpers/fixture';
import type { ExtensionMapModel, ExtensionPoint, Guard } from '../../src/model/types';

const m: ExtensionMapModel = analyzeFixture('points');

const point = (id: string): ExtensionPoint => {
  const found = m.points.find((p) => p.id === id);
  if (!found) {
    throw new Error(`No point ${id} in [${pointIds(m).join(', ')}]`);
  }
  return found;
};

const guardsFor = (id: string): Guard[] => m.guards.filter((g) => g.pointIds.includes(id));

const prop = (id: string, name: string): ExtensionPoint['properties'][number] => {
  const found = point(id).properties.find((p) => p.name === name);
  if (!found) {
    throw new Error(`No property ${name} on point ${id}`);
  }
  return found;
};

describe('extension points', () => {
  it('detects interface, intersection and typeof-constant points', () => {
    expect(pointIds(m)).toEqual(['fx.a', 'fx.b', 'fx.c', 'fx.d']);
  });

  it('does not treat specializations or unions as points', () => {
    expect(diagCodes(m)).not.toContain('point-duplicate-id');
    expect(m.points.map((p) => p.typeName)).toEqual(['FxA', 'FxB', 'FxC', 'FxD']);
  });

  it('records the declaring package, location and type parameters', () => {
    expect(point('fx.a')).toMatchObject({
      pkg: '@fx/p',
      typeParams: ['T'],
      loc: { file: 'packages/p/src/ext.ts', line: 17 },
    });
    expect(point('fx.b').typeParams).toEqual([]);
  });

  it('resolves guards by predicate type, including constant comparisons', () => {
    expect(guardsFor('fx.d')).toHaveLength(1);
    expect(guardsFor('fx.d')[0]).toMatchObject({ name: 'isFxD', style: 'inline' });
    expect(guardsFor('fx.b')[0].style).toBe('factory');
  });

  it('reads a guard returned by a factory function as parameterized', () => {
    expect(
      guardsFor('fx.a')
        .map((g) => [g.name, g.style])
        .toSorted(),
    ).toEqual([
      ['isFxA', 'inline'],
      ['isFxAMistyped', 'inline'],
      ['makeFxAGuard', 'parameterized'],
    ]);
  });

  it('links each point to the guards that narrow to it', () => {
    expect(point('fx.b').guards).toEqual(['isFxB']);
    expect(point('fx.c').guards).toEqual([]);
  });

  it('does not treat a guard factory itself as a guard', () => {
    expect(m.guards.map((g) => g.name)).not.toContain('createGuard');
  });

  it('reads JSDoc tags', () => {
    expect(point('fx.a').doc).toMatchObject({
      remarks: expect.any(String),
      category: 'Wizard',
      links: ['FxB'],
    });
    expect(point('fx.a').doc.summary).toBe('The alias form of a fixture point.');
    expect(point('fx.a').doc.see).toEqual(['the fx.b point']);
  });

  it('marks codeRef properties with the inner type', () => {
    expect(prop('fx.a', 'field').codeRef).toEqual({
      inner: 'FxField',
      innerKey: expect.stringMatching(/^packages\/p\/src\/ext\.ts:\d+$/),
    });
    expect(prop('fx.a', 'field').doc).toBe('A code reference to a field definition.');
  });

  it('leaves innerKey off an inline codeRef type and codeRef off other properties', () => {
    expect(prop('fx.a', 'inline').codeRef).toEqual({ inner: '{ x: number; }' });
    expect(prop('fx.a', 'label').codeRef).toBeUndefined();
  });

  it('resolves an alias of CodeRef to the type the code reference really carries', () => {
    expect(prop('fx.a', 'widget').codeRef).toEqual({
      inner: '{ default: (props: FxProps) => string; }',
    });
  });

  it('does not treat a predicate over a non-extension union as a guard', () => {
    expect(m.guards.map((g) => g.name)).not.toContain('isFxDataField');
    expect(m.diagnostics.filter((d) => d.message.includes('isFxDataField'))).toEqual([]);
  });

  it('records property names, optionality and declared type text', () => {
    expect(point('fx.a').properties.map((p) => [p.name, p.optional, p.typeText])).toEqual([
      ['field', false, 'CodeRef<FxField>'],
      ['inline', false, 'CodeRef<{ x: number }>'],
      ['widget', false, 'ComponentCodeRef<FxProps>'],
      ['label', true, 'string'],
      ['data', false, 'T'],
    ]);
    expect(point('fx.c').properties.map((p) => p.name)).toEqual(['count']);
  });

  it('reports gaps', () => {
    const expected = ['point-no-guard', 'point-no-jsdoc', 'jsdoc-param-on-type', 'guard-no-point'];
    expect(diagCodes(m)).toEqual(expect.arrayContaining(expected));
    expect(m.diagnostics.filter((d) => d.code === 'point-no-guard')).toEqual([
      expect.objectContaining({ pkg: '@fx/p', loc: { file: 'packages/p/src/ext.ts', line: 46 } }),
    ]);
  });

  it('reports a guard whose literal disagrees with its predicate type', () => {
    expect(m.diagnostics.filter((d) => d.code === 'guard-literal-mismatch')).toEqual([
      expect.objectContaining({ message: expect.stringContaining('fx.oops') }),
    ]);
  });
});
