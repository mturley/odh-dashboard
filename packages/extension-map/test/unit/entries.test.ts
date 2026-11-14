import { analyzeFixture } from '../helpers/fixture';
import type { ExtensionMapModel } from '../../src/model/types';

const m = analyzeFixture('entries');

const entryIds = (model: ExtensionMapModel): string[] => model.entries.map((e) => e.id);

const codes = (model: ExtensionMapModel): (string | undefined)[][] =>
  model.diagnostics.map((d) => [d.code, d.pkg]);

describe('extension entries discovery', () => {
  it('discovers one entry per loading path', () => {
    expect(entryIds(m)).toEqual([
      '@fx/d#./extensions/static',
      '@fx/f#mf:./extensions',
      '@fx/s#./extensions',
    ]);
  });

  it('reports federation the host would not load', () => {
    expect(codes(m)).toContainEqual(['federation-not-loaded', '@fx/k']);
  });

  it('reports an expose that is not a string literal', () => {
    expect(codes(m)).toContainEqual(['unresolved-expose', '@fx/u']);
  });
});
