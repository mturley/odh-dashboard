import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { Loc, WorkspacePackage } from '../../src/model/types';
import { docsDirFor, loadWorkspace, pkgForFile } from '../../src/discovery/workspace';
import { declKey, extensionTypeIds, locOf, resolveAlias } from '../../src/programs/identity';
import { createSourceFileCache } from '../../src/programs/sourceCache';
import { runPass } from '../../src/programs/stream';
import type { Collector, RunPassOptions } from '../../src/programs/stream';

const fixtureRoot = path.resolve(__dirname, '..', 'fixtures', 'ownership');

const ws: WorkspacePackage[] = JSON.parse(
  fs.readFileSync(path.join(fixtureRoot, 'workspace.json'), 'utf8'),
);

const rel = (p: string): string => path.relative(fixtureRoot, p).split(path.sep).join('/');

const findImportSpecifier = (file: ts.SourceFile, name: string): ts.ImportSpecifier | undefined => {
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) {
      continue;
    }
    const found = bindings.elements.find((e) => e.name.text === name);
    if (found) {
      return found;
    }
  }
  return undefined;
};

const recorder = (): Collector<Record<string, string[]>> => {
  const seen: Record<string, string[]> = {};
  return {
    visit: (ctx) => {
      seen[rel(ctx.tsconfig)] = ctx.ownedFiles.map((f) => rel(f.fileName)).toSorted();
    },
    finish: () => seen,
  };
};

const run = <R>(collector: Collector<R>, opts: RunPassOptions = {}): R => {
  runPass(fixtureRoot, ws, [collector], opts);
  return collector.finish();
};

const allOwned = (): string[] => Object.values(run(recorder())).flat();

const idsOf = (name: string): string[] | undefined => {
  let ids: string[] | undefined;
  const collector: Collector<void> = {
    visit: (ctx) => {
      for (const file of ctx.ownedFiles) {
        if (!file.fileName.endsWith('types.ts')) {
          continue;
        }
        for (const statement of file.statements) {
          if (ts.isTypeAliasDeclaration(statement) && statement.name.text === name) {
            ids = extensionTypeIds(ctx.checker.getTypeAtLocation(statement.type), ctx.checker);
          }
        }
      }
    },
    finish: () => undefined,
  };
  run(collector);
  return ids;
};

describe('runPass ownership', () => {
  it('owns each file exactly once', () => {
    const all = allOwned();
    expect(new Set(all).size).toBe(all.length);
  });

  it('falls back to the ancestor program that includes the file', () => {
    expect(run(recorder())['packages/a/tsconfig.json']).toContain(
      'packages/a/frontend/src/excluded.ts',
    );
  });

  it('visits the deepest tsconfig first', () => {
    expect(Object.keys(run(recorder()))[0]).toBe('packages/a/frontend/tsconfig.json');
  });

  it('gives identical results with and without the source cache', () => {
    expect(run(recorder(), { sourceCache: createSourceFileCache() })).toEqual(run(recorder(), {}));
  });

  it('never owns test, mock or declaration files', () => {
    const all = allOwned();
    expect(all).not.toContain('packages/a/frontend/src/skipped.spec.ts');
    expect(all).not.toContain('packages/a/frontend/src/__mocks__/mock.ts');
    expect(all).not.toContain('packages/a/frontend/src/global.d.ts');
    expect(all).toContain('packages/a/frontend/src/kept.ts');
    expect(all).toContain('packages/a/frontend/src/types.ts');
    expect(all).toContain('packages/a/src/index.ts');
  });
});

describe('loadWorkspace', () => {
  it('loads packages from the query script and drops excluded ones', () => {
    const loaded = loadWorkspace(fixtureRoot);
    expect(loaded.map((p) => p.name).toSorted()).toEqual(['@fx/a', '@fx/a-ui', '@fx/root']);
    const a = loaded.find((p) => p.name === '@fx/a');
    expect(a?.dir).toBe('packages/a');
    expect(a?.packageJson).toEqual({ name: '@fx/a', private: true, version: '1.0.0' });
  });
});

describe('pkgForFile', () => {
  it('rolls nested frontend packages up to the parent', () => {
    expect(pkgForFile('packages/a/frontend/src/x.ts', ws)).toBe('@fx/a');
  });

  it('keeps @odh-dashboard/internal as is and rolls the root frontend up', () => {
    const core: WorkspacePackage[] = [
      { name: 'odh-dashboard', dir: '.', packageJson: {} },
      { name: 'odh-dashboard-frontend', dir: 'frontend', packageJson: {} },
      { name: '@odh-dashboard/internal', dir: 'frontend/src', packageJson: {} },
    ];
    expect(pkgForFile('frontend/src/utilities/x.ts', core)).toBe('@odh-dashboard/internal');
    expect(pkgForFile('frontend/jest.config.ts', core)).toBe('odh-dashboard');
  });

  it('maps upstream subtrees to the parent package', () => {
    const mreg: WorkspacePackage[] = [
      { name: '@odh-dashboard/model-registry', dir: 'packages/model-registry', packageJson: {} },
    ];
    expect(pkgForFile('packages/model-registry/upstream/frontend/src/a.ts', mreg)).toBe(
      '@odh-dashboard/model-registry',
    );
  });

  it('returns undefined outside the workspace', () => {
    const mreg: WorkspacePackage[] = [
      { name: '@odh-dashboard/model-registry', dir: 'packages/model-registry', packageJson: {} },
    ];
    expect(pkgForFile('docs/x.md', mreg)).toBeUndefined();
  });
});

describe('docsDirFor', () => {
  it('returns <dir>/docs', () => {
    expect(docsDirFor({ name: '@fx/a', dir: 'packages/a', packageJson: {} })).toBe(
      'packages/a/docs',
    );
    expect(docsDirFor({ name: 'odh-dashboard', dir: '.', packageJson: {} })).toBe('docs');
  });

  it('uses frontend/docs for @odh-dashboard/internal', () => {
    expect(
      docsDirFor({ name: '@odh-dashboard/internal', dir: 'frontend/src', packageJson: {} }),
    ).toBe('frontend/docs');
  });
});

describe('identity helpers', () => {
  it('builds repo-relative declaration keys and locations', () => {
    const captured: { key: string; loc: Loc }[] = [];
    const collector: Collector<void> = {
      visit: (ctx) => {
        for (const file of ctx.ownedFiles) {
          if (rel(file.fileName) !== 'packages/a/src/index.ts') {
            continue;
          }
          for (const statement of file.statements) {
            if (ts.isVariableStatement(statement)) {
              captured.push({ key: declKey(statement, ctx), loc: locOf(statement, ctx) });
            }
          }
        }
      },
      finish: () => undefined,
    };
    run(collector);
    expect(captured).toHaveLength(1);
    expect(captured[0].key).toMatch(/^packages\/a\/src\/index\.ts:\d+$/);
    expect(captured[0].loc).toEqual({ file: 'packages/a/src/index.ts', line: 3, endLine: 3 });
  });

  it('resolves aliases to their target symbol', () => {
    let target: { name: string; file: string } | undefined;
    const collector: Collector<void> = {
      visit: (ctx) => {
        for (const file of ctx.ownedFiles) {
          if (rel(file.fileName) !== 'packages/a/src/index.ts') {
            continue;
          }
          const specifier = findImportSpecifier(file, 'excludedValue');
          const symbol = specifier ? ctx.checker.getSymbolAtLocation(specifier.name) : undefined;
          if (symbol) {
            const resolved = resolveAlias(ctx.checker, symbol);
            const decl = resolved.declarations?.[0];
            target = {
              name: resolved.name,
              file: decl ? rel(decl.getSourceFile().fileName) : '',
            };
          }
        }
      },
      finish: () => undefined,
    };
    run(collector);
    expect(target).toEqual({
      name: 'excludedValue',
      file: 'packages/a/frontend/src/excluded.ts',
    });
  });

  it('reads extension type ids from literal, union and plain-string types', () => {
    expect(idsOf('LiteralExt')).toEqual(['fx.a']);
    expect(idsOf('UnionExt')).toEqual(['fx.a', 'fx.b']);
    expect(idsOf('AnyExt')).toBeUndefined();
  });
});
