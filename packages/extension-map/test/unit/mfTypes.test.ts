import ts from 'typescript';
import { analyzeFixture, diagCodes, fixtureDir, pointIds, readWorkspace } from '../helpers/fixture';
import { relFile } from '../../src/discovery/workspace';
import type { ExtensionMapModel } from '../../src/model/types';
import { declKey, resolveAlias } from '../../src/programs/identity';
import { runPass } from '../../src/programs/stream';
import type { ProgramCtx } from '../../src/programs/stream';

const CONSUMER = 'packages/c/uses.ts';

/**
 * The declaration key of every named import of `packages/c/uses.ts`, keyed
 * `<module specifier>#<exported name>`, so a test can compare the key reached through a
 * committed `@mf-types` copy with the key reached through the source module.
 */
const importedKeys = (): Map<string, string> => {
  const repoRoot = fixtureDir('mftypes');
  const found = new Map<string, string>();
  const collector = {
    visit: (ctx: ProgramCtx): void => {
      const file = ctx.ownedFiles.find((f) => relFile(repoRoot, f.fileName) === CONSUMER);
      file?.forEachChild((node) => {
        if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) {
          return;
        }
        const bindings = node.importClause?.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) {
          return;
        }
        const specifier = node.moduleSpecifier.text;
        for (const element of bindings.elements) {
          const symbol = ctx.checker.getSymbolAtLocation(element.name);
          const decl = symbol ? resolveAlias(ctx.checker, symbol).declarations?.[0] : undefined;
          if (decl) {
            found.set(
              `${specifier}#${(element.propertyName ?? element.name).text}`,
              declKey(decl, ctx),
            );
          }
        }
      });
    },
    finish: (): undefined => undefined,
  };
  runPass(repoRoot, readWorkspace('mftypes'), [collector], {});
  return found;
};

const keys = importedKeys();

const keyVia = (specifier: string, name: string): string => {
  const key = keys.get(`${specifier}#${name}`);
  if (key === undefined) {
    throw new Error(`No import of ${name} from '${specifier}' in ${CONSUMER}`);
  }
  return key;
};

const m: ExtensionMapModel = analyzeFixture('mftypes');

const innerKeyOf = (id: string): string | undefined => {
  const point = m.points.find((p) => p.id === id);
  if (!point) {
    throw new Error(`No point ${id} in [${pointIds(m).join(', ')}]`);
  }
  return point.properties.find((p) => p.name === 'data')?.codeRef?.innerKey;
};

const staleMessages = (): string[] =>
  m.diagnostics.filter((d) => d.code === 'stale-mf-types').map((d) => d.message);

describe('@mf-types declaration copies', () => {
  it('gives a copy the same key as its source declaration', () => {
    const direct = keyVia('../rem/frontend/src/odh/extension-points/p', 'isRemP');
    expect(keyVia('@mf/rem/extension-points', 'isRemP')).toBe(direct);
    expect(keyVia('@mf/rem/extension-points', 'RemData')).toMatch(
      /^packages\/rem\/frontend\/src\//,
    );
  });

  it('maps a carried type reached through a copy to its source declaration', () => {
    expect(innerKeyOf('c.p')).toBe(keyVia('../rem/frontend/src/odh/extension-points/p', 'RemData'));
  });

  it('reports stale copies', () => {
    expect(diagCodes(m)).toContain('stale-mf-types');
  });

  it('names the missing declaration and the missing source file once each', () => {
    expect(staleMessages().toSorted()).toEqual([
      "'RemGone' is declared in frontend/@mf-types/@mf/rem/compiled-types/src/odh/extension-points/gone.d.ts, but no source file exists at packages/rem/frontend/src/odh/extension-points/gone.ts or packages/rem/frontend/src/odh/extension-points/gone.tsx.",
      "'RemOld' is declared in frontend/@mf-types/@mf/rem/compiled-types/src/odh/extension-points/renamed.d.ts but not in packages/rem/frontend/src/odh/extension-points/renamed.ts.",
    ]);
  });

  it('leaves a stale copy unresolved rather than keying it to the copy', () => {
    expect(innerKeyOf('c.q')).toBeUndefined();
    expect(innerKeyOf('c2.q')).toBeUndefined();
    expect(innerKeyOf('c.r')).toBeUndefined();
  });

  it('does not scan the copies as definitions', () => {
    expect(pointIds(m)).toEqual(['c.p', 'c.q', 'c.r', 'c2.q', 'rem.p']);
    expect(diagCodes(m)).not.toContain('point-duplicate-id');
  });
});
