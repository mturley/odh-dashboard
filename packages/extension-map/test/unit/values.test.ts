import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { Collector } from '../../src/programs/stream';
import { runPass } from '../../src/programs/stream';
import type { Value, WorkspacePackage } from '../../src/model/types';
import { resolveValue } from '../../src/extract/values';
import { fixtureDir } from '../helpers/fixture';

const readValues = (): Map<string, Value> => {
  const root = fixtureDir('extension-values');
  const workspace: WorkspacePackage[] = JSON.parse(
    fs.readFileSync(path.join(root, 'workspace.json'), 'utf8'),
  );
  const values = new Map<string, Value>();
  const collector: Collector<void> = {
    visit: (ctx) => {
      for (const file of ctx.ownedFiles) {
        if (path.basename(file.fileName) !== 'values.ts') {
          continue;
        }
        for (const statement of file.statements) {
          if (!ts.isVariableStatement(statement)) {
            continue;
          }
          for (const declaration of statement.declarationList.declarations) {
            if (declaration.initializer !== undefined && ts.isIdentifier(declaration.name)) {
              values.set(declaration.name.text, resolveValue(declaration.initializer, ctx));
            }
          }
        }
      }
      const asConstSource = ts.createSourceFile(
        'as-const-fixture.ts',
        "const asConstStr = 'x' as const; const asString = 'cast' as string; const parenthesized = ('wrapped');",
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      for (const statement of asConstSource.statements) {
        if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name) && declaration.initializer !== undefined) {
              values.set(declaration.name.text, resolveValue(declaration.initializer, ctx));
            }
          }
        }
      }
    },
    finish: () => undefined,
  };
  runPass(root, workspace, [collector]);
  return values;
};

const resolved = readValues();
const v = (name: string): Value =>
  resolved.get(name) ?? {
    kind: 'unresolved',
    reason: 'missing test value',
    loc: { file: '', line: 0 },
  };

describe('resolveValue', () => {
  it('unwraps satisfies, as, parentheses and as-const', () => {
    expect(v('satisfiesObj')).toEqual({
      kind: 'object',
      props: { label: { kind: 'literal', value: 'value' } },
    });
    expect(v('asConstStr')).toEqual({ kind: 'literal', value: 'x' });
    expect(v('asString')).toEqual({ kind: 'literal', value: 'cast' });
    expect(v('parenthesized')).toEqual({ kind: 'literal', value: 'wrapped' });
  });

  it('resolves primitive, array, object and literal template values', () => {
    expect(v('numeric')).toEqual({ kind: 'literal', value: 7 });
    expect(v('bool')).toEqual({ kind: 'literal', value: true });
    expect(v('nullValue')).toEqual({ kind: 'literal', value: null });
    expect(v('nested')).toEqual({
      kind: 'array',
      items: [
        { kind: 'literal', value: 'x' },
        { kind: 'object', props: { id: { kind: 'literal', value: 1 } } },
      ],
    });
    expect(v('object')).toMatchObject({ kind: 'object' });
    expect(v('template')).toEqual({ kind: 'literal', value: 'route-home' });
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

  it('resolves CodeRef then-shapes and follows target declarations', () => {
    expect(v('ref1')).toMatchObject({ kind: 'codeRef', export: 'default' });
    expect(v('ref2')).toMatchObject({ kind: 'codeRef', export: 'useThing' });
    expect(v('ref3')).toMatchObject({
      kind: 'codeRef',
      export: 'Modal',
      target: { file: 'packages/p/src/m.ts' },
    });
    expect(v('ref4')).toMatchObject({ kind: 'codeRef', export: null });
    expect(v('fieldRef')).toMatchObject({
      kind: 'codeRef',
      export: 'WizardField',
      module: expect.stringMatching(/packages\/p\/src\/m\.ts$/),
      supplies: {
        externalDataHook: { kind: 'symbol', name: 'useData' },
      },
    });
  });

  it('never guesses computed values', () => {
    expect(v('computed').kind).toBe('unresolved');
  });
});
