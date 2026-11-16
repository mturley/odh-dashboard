import { analyzeFixture } from '../helpers/fixture';
import type { DiagnosticCode, ExtensionMapModel } from '../../src/model/types';

const m = analyzeFixture('points');

const pointIds = (model: ExtensionMapModel): string[] => model.points.map((p) => p.id);
const codes = (model: ExtensionMapModel): DiagnosticCode[] => model.diagnostics.map((d) => d.code);
const point = (id: string) => m.points.find((p) => p.id === id);
const prop = (id: string, name: string) => point(id)?.properties.find((p) => p.name === name);
const guardsFor = (id: string) => m.guards.filter((g) => point(id)?.guards.includes(g.name));
const diags = (code: DiagnosticCode) => m.diagnostics.filter((d) => d.code === code);

describe('points collector', () => {
  it('detects alias, interface, intersection and typeof-constant points', () => {
    expect(pointIds(m)).toEqual(['fx.a', 'fx.b', 'fx.c', 'fx.d', 'fx.e']);
  });

  it('collects declarations exported through a local export list', () => {
    expect(point('fx.e')).toMatchObject({ pkg: '@fx/points', typeName: 'FxE' });
    expect(point('fx.e')?.guards).toEqual(['isFxE']);
    expect(m.guards.find((g) => g.name === 'isFxE')).toMatchObject({
      style: 'inline',
      pointIds: ['fx.e'],
    });
  });

  it('does not collect a local type that is never exported', () => {
    expect(pointIds(m)).not.toContain('fx.local');
    expect(m.points.map((p) => p.typeName)).not.toContain('FxLocal');
  });

  it('does not treat specializations or unions as points', () => {
    expect(codes(m)).not.toContain('point-duplicate-id');
    expect(m.points.map((p) => p.typeName)).not.toContain('Specialization');
    expect(m.points.map((p) => p.typeName)).not.toContain('Union');
  });

  it('records type parameters, properties and package attribution', () => {
    expect(point('fx.a')).toMatchObject({
      pkg: '@fx/points',
      typeName: 'FxA',
      typeParams: ['T'],
      loc: { file: 'packages/p/src/points.ts' },
    });
    expect(prop('fx.a', 'field')?.typeText).toBe('CodeRef<FxField>');
    expect(prop('fx.c', 'note')?.optional).toBe(true);
    expect(point('fx.c')?.properties.map((p) => p.name)).toEqual(['id', 'note']);
  });

  it('resolves guards by predicate type, including constant comparisons', () => {
    expect(guardsFor('fx.d')).toHaveLength(1);
    expect(guardsFor('fx.d')[0].style).toBe('inline');
    expect(guardsFor('fx.b')[0].style).toBe('factory');
  });

  it('recognizes a function returning a predicate as a parameterized guard', () => {
    const guard = m.guards.find((g) => g.name === 'guardForZ');
    expect(guard).toMatchObject({ style: 'parameterized', pointIds: ['fx.z'] });
  });

  it('reads JSDoc tags', () => {
    expect(point('fx.a')?.doc).toMatchObject({
      remarks: expect.any(String),
      category: 'Wizard',
      links: ['FxB'],
    });
    expect(point('fx.d')?.doc).toMatchObject({
      deprecated: 'Use fx.a instead.',
      see: ['FxA'],
      extensionData: ['fx.d.carried'],
    });
  });

  it('marks codeRef properties with the inner type and its declaration keys', () => {
    expect(prop('fx.a', 'field')?.codeRef).toEqual({ inner: 'FxField' });
    expect(prop('fx.a', 'field')?.doc).toBe('The field the extension provides.');
    expect(prop('fx.a', 'field')?.innerDeclKeys?.[0]).toMatch(/^packages\/p\/src\/points\.ts:\d+$/);
  });

  it('reports a guard literal that disagrees with its predicate', () => {
    const mismatches = diags('guard-literal-mismatch');
    expect(mismatches).toHaveLength(2);
    expect(mismatches.map((d) => d.message).join('\n')).toContain('fx.wrong');
  });

  it('does not report a mismatch for an exclusion comparison', () => {
    const guard = m.guards.find((g) => g.name === 'isFzNotSection');
    expect(guard).toMatchObject({ style: 'inline', pointIds: ['fx.z'] });
    const messages = diags('guard-literal-mismatch')
      .map((d) => d.message)
      .join('\n');
    // `!==` cannot prove the literal disagrees; the valid positive constant
    // guard (isFxD) must not be flagged either.
    expect(messages).not.toContain('isFzNotSection');
    expect(messages).not.toContain('isFxD');
  });

  it('reports gaps', () => {
    const expected = ['point-no-guard', 'point-no-jsdoc', 'jsdoc-param-on-type', 'guard-no-point'];
    expect(codes(m)).toEqual(expect.arrayContaining(expected));
    expect(point('fx.c')?.guards).toEqual([]);
    expect(m.guards.find((g) => g.name === 'isFz')?.pointIds).toEqual(['fx.z']);
  });
});
