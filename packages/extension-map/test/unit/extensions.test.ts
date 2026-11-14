import { analyzeFixture, diagCodes } from '../helpers/fixture';
import type { ExtensionMapModel, ExtensionRecord } from '../../src/model/types';

const m: ExtensionMapModel = analyzeFixture('extensions');

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

  it('reads supplies from a CodeRef target object', () => {
    expect(ext('fx.field').properties.field).toMatchObject({
      kind: 'codeRef',
      supplies: { externalDataHook: { kind: 'symbol', name: 'useData' } },
    });
  });
});
