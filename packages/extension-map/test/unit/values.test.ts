import { valuesOf } from '../helpers/fixture';
import type { Value } from '../../src/model/types';

const values = valuesOf('extensions', 'packages/p/src/values.ts');

const v = (name: string): Value => {
  const found = values.get(name);
  if (!found) {
    throw new Error(`No value ${name} in [${[...values.keys()].join(', ')}]`);
  }
  return found;
};

describe('values', () => {
  it('unwraps satisfies, as and as-const', () => {
    expect(v('satisfiesObj')).toMatchObject({ kind: 'object' });
    expect(v('asConstStr')).toEqual({ kind: 'literal', value: 'x' });
  });

  it('resolves enum members with name and value', () => {
    expect(v('areaFlag')).toEqual({
      kind: 'enumMember',
      enumName: 'Area',
      member: 'K_SERVE',
      value: 'kserve',
    });
  });

  it('keeps constant name and value', () => {
    expect(v('platformId')).toEqual({ kind: 'constant', name: 'KS_ID', value: 'kserve' });
  });

  it('resolves codeRef then-shapes', () => {
    expect(v('ref1')).toMatchObject({ kind: 'codeRef', export: 'default' });
    expect(v('ref2')).toMatchObject({ kind: 'codeRef', export: 'useThing' });
    expect(v('ref3')).toMatchObject({ kind: 'codeRef', export: 'Modal' });
    expect(v('ref4')).toMatchObject({ kind: 'codeRef', export: null });
  });

  it('resolves the code reference module and target', () => {
    expect(v('ref2')).toMatchObject({
      module: 'packages/p/src/m.ts',
      target: { file: 'packages/p/src/m.ts', line: 3 },
    });
  });

  it('never guesses computed values', () => {
    expect(v('computed').kind).toBe('unresolved');
  });
});
