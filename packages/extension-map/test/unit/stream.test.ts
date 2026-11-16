import path from 'path';
import ts from 'typescript';
import { loadWorkspace, pkgForFile } from '../../src/discovery/workspace';
import { extensionTypeIds, predicateTargetIds } from '../../src/programs/identity';
import { createSourceFileCache } from '../../src/programs/sourceCache';
import type { SourceFileCache } from '../../src/programs/sourceCache';
import { runPass } from '../../src/programs/stream';
import type { Collector, ProgramCtx } from '../../src/programs/stream';
import { findRepoRoot } from '../../src/repoRoot';
import { fixtureDir, readWorkspace } from '../helpers/fixture';

const repoRoot = fixtureDir('ownership');
const ws = readWorkspace('ownership');

const relTo = (root: string, file: string): string =>
  path.relative(root, file).split(path.sep).join('/');

const rel = (file: string): string => relTo(repoRoot, file);

const run = <R>(collector: Collector<R>, opts: { sourceCache?: SourceFileCache } = {}): R => {
  runPass(repoRoot, ws, [collector], opts);
  return collector.finish();
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

/** Declared type ids of every top-level type alias / interface in the fixture, by name. */
const typeIds = (): Collector<Record<string, string[] | undefined>> => {
  const out: Record<string, string[] | undefined> = {};
  const record = (
    ctx: ProgramCtx,
    name: ts.Identifier,
    read: (t: ts.Type) => string[] | undefined,
  ) => {
    const symbol = ctx.checker.getSymbolAtLocation(name);
    if (symbol) {
      out[name.text] = read(ctx.checker.getDeclaredTypeOfSymbol(symbol));
    }
  };
  return {
    visit: (ctx) => {
      ctx.ownedFiles.forEach((file) =>
        file.forEachChild((node) => {
          if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
            record(ctx, node.name, (t) => extensionTypeIds(t, ctx.checker));
          } else if (ts.isVariableStatement(node)) {
            node.declarationList.declarations.forEach((d) => {
              if (ts.isIdentifier(d.name)) {
                const t = ctx.checker.getTypeAtLocation(d.name);
                out[d.name.text] = predicateTargetIds(t, ctx.checker);
              }
            });
          }
        }),
      );
    },
    finish: () => out,
  };
};

describe('runPass ownership', () => {
  it('owns each file exactly once', () => {
    const all = Object.values(run(recorder())).flat();
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
});

describe('tsconfig errors', () => {
  const errorRoot = fixtureDir('tsconfig-error');
  const errorWs = readWorkspace('tsconfig-error');
  const errorRel = (file: string): string =>
    path.relative(errorRoot, file).split(path.sep).join('/');

  const seen = recorder();
  const diagnostics = runPass(errorRoot, errorWs, [seen], {});
  const owned = Object.fromEntries(
    Object.entries(seen.finish()).map(([config, files]) => [
      errorRel(path.join(repoRoot, config)),
      files.map((f) => errorRel(path.join(repoRoot, f))),
    ]),
  );

  it('reports a tsconfig it cannot parse', () => {
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'tsconfig-error',
        severity: 'warning',
        loc: { file: 'packages/b/broken/tsconfig.json', line: 1 },
        pkg: '@fx/b',
      }),
    ]);
    expect(diagnostics[0].message).toContain('does-not-exist.json');
  });

  it('still visits the other programs', () => {
    expect(owned['packages/b/tsconfig.json']).toEqual(['packages/b/src/ok.ts']);
  });

  it('does not report a tsconfig that simply matches no files', () => {
    expect(owned['packages/b/empty/tsconfig.json']).toEqual([]);
  });
});

describe('workspace packages', () => {
  it('rolls nested frontend packages up to the parent', () => {
    expect(pkgForFile('packages/a/frontend/src/x.ts', ws)).toBe('@fx/a');
  });

  it('maps a file to its own package and nothing outside the workspace', () => {
    expect(pkgForFile('packages/a/src/index.ts', ws)).toBe('@fx/a');
    expect(pkgForFile('elsewhere/x.ts', ws)).toBeUndefined();
  });

  it('loads the real workspace without the excluded packages', () => {
    const real = loadWorkspace(findRepoRoot(__dirname));
    const names = real.map((p) => p.name);
    expect(real.find((p) => p.name === '@odh-dashboard/internal')?.dir).toBe('frontend/src');
    expect(names).toContain('@odh-dashboard/model-serving');
    expect(names).not.toContain('@odh-dashboard/extension-map');
    expect(names).not.toContain('@odh-dashboard/jest-config');
    expect(names).not.toContain('@odh-dashboard/cypress');
    expect(real.every((p) => p.dir !== '.' && typeof p.packageJson.name === 'string')).toBe(true);
  });
});

describe('extension type identity', () => {
  const ids = run(typeIds());

  it('reads extension type ids from literal, union and plain-string types', () => {
    expect(ids.LiteralExt).toEqual(['fx.a']);
    expect(ids.UnionExt).toEqual(['fx.a', 'fx.b']);
    expect(ids.AnyExt).toBeUndefined();
  });

  it('reads extension type ids through LoadedExtension', () => {
    expect(ids.LoadedExt).toEqual(['fx.a']);
  });

  it('reads the ids a type predicate narrows to', () => {
    expect(ids.isLiteralExt).toEqual(['fx.a']);
    expect(ids.notAGuard).toBeUndefined();
  });
});
