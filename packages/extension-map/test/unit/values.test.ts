import { valuesOf } from '../helpers/fixture';
import type { Value } from '../../src/model/types';

const values = valuesOf('records', 'packages/p/src/values.ts');

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

  it('marks an import that resolves to no repo file as external', () => {
    expect(v('refMissing')).toEqual({
      kind: 'codeRef',
      module: './nowhere',
      export: 'default',
      external: true,
    });
    expect(v('ref1')).not.toHaveProperty('external');
  });

  it('reads a function as code, inline or by name', () => {
    expect(v('inlineFn')).toMatchObject({ kind: 'function' });
    expect(v('fnRef')).toMatchObject({
      kind: 'function',
      name: 'compute',
      loc: { file: 'packages/p/src/values.ts', line: 9 },
    });
  });

  it('reads a function declaration a reference names', () => {
    expect(v('helperRef')).toMatchObject({
      kind: 'function',
      name: 'helper',
      loc: { file: 'packages/p/src/values.ts', line: 42 },
    });
  });

  it('never follows a let or var binding', () => {
    expect(v('letLiteral')).toMatchObject({ kind: 'unresolved' });
    expect(v('letArray')).toMatchObject({ kind: 'unresolved' });
    expect(v('letObject')).toMatchObject({ kind: 'unresolved' });
  });

  it('never follows a const its own file mutates in place', () => {
    expect(v('mutatedArray')).toMatchObject({ kind: 'unresolved' });
    expect(v('mutatedObject')).toMatchObject({ kind: 'unresolved' });
  });

  it('follows an unmutated const, and an as-const one whatever its file does', () => {
    expect(v('plainArrayRef')).toEqual({
      kind: 'array',
      items: [{ kind: 'literal', value: 'a' }],
    });
    expect(v('plainObjectRef')).toEqual({
      kind: 'object',
      props: { label: { kind: 'literal', value: 'a' } },
    });
    expect(v('asConstArray')).toEqual({
      kind: 'array',
      items: [
        { kind: 'literal', value: 'a' },
        { kind: 'literal', value: 'b' },
      ],
    });
  });

  it('merges an object spread in source order', () => {
    expect(v('spreadObj')).toEqual({
      kind: 'object',
      props: {
        label: { kind: 'literal', value: 'Base' },
        count: { kind: 'literal', value: 2 },
      },
    });
  });

  it('leaves an object unresolved when a spread cannot be read', () => {
    expect(v('spreadBad')).toMatchObject({
      kind: 'unresolved',
      reason: expect.stringContaining('compute()'),
    });
  });

  it('names a reference to a code-like constant instead of reading it', () => {
    expect(v('schemaRef')).toEqual({
      kind: 'reference',
      name: 'schemaObject',
      loc: { file: 'packages/p/src/values.ts', line: 87 },
    });
  });

  it('keeps a data-like constant it cannot read unresolved', () => {
    expect(v('computedRef')).toMatchObject({
      kind: 'unresolved',
      reason: expect.stringContaining('computed'),
    });
  });

  it('keeps an inline helper call unresolved, never a reference', () => {
    expect(v('inlineCall')).toMatchObject({ kind: 'unresolved' });
  });

  it('reads a constant the checker proves callable as a function, not a reference', () => {
    expect(v('wrappedFnRef')).toEqual({
      kind: 'function',
      name: 'wrappedCompute',
      loc: { file: 'packages/p/src/values.ts', line: 94 },
    });
  });

  it('keeps a constant whose type proves nothing unresolved', () => {
    expect(v('opaqueRef')).toMatchObject({ kind: 'unresolved' });
  });
});
