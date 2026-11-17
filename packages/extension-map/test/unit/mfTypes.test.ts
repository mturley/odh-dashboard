import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { declKey, resolveAlias } from '../../src/programs/identity';
import type { Collector } from '../../src/programs/stream';
import { runPass } from '../../src/programs/stream';
import type { Diagnostic, WorkspacePackage } from '../../src/model/types';
import { fixtureDir } from '../helpers/fixture';

const root = fixtureDir('mftypes');
const ws: WorkspacePackage[] = JSON.parse(
  fs.readFileSync(path.join(root, 'workspace.json'), 'utf8'),
);

/** Keys of the named imports of `specifier` in `anchorRel`, plus the pass diagnostics. */
const importKeys = (
  anchorRel: string,
  specifier: string,
  names: string[],
): { keys: Record<string, string>; diagnostics: Diagnostic[] } => {
  const keys: Record<string, string> = {};
  const collector: Collector<void> = {
    visit: (ctx) => {
      const anchor = ctx.program.getSourceFile(path.join(root, anchorRel));
      if (!anchor) {
        return;
      }
      for (const statement of anchor.statements) {
        if (
          !ts.isImportDeclaration(statement) ||
          !ts.isStringLiteral(statement.moduleSpecifier) ||
          statement.moduleSpecifier.text !== specifier
        ) {
          continue;
        }
        const bindings = statement.importClause?.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) {
          continue;
        }
        for (const element of bindings.elements) {
          const original =
            element.propertyName && ts.isIdentifier(element.propertyName)
              ? element.propertyName.text
              : element.name.text;
          if (!names.includes(original)) {
            continue;
          }
          const symbol = ctx.checker.getSymbolAtLocation(element.name);
          const target = symbol ? resolveAlias(ctx.checker, symbol) : undefined;
          const decl = target?.declarations?.[0];
          if (decl) {
            keys[original] = declKey(decl, ctx);
          }
        }
      }
    },
    finish: () => undefined,
  };
  return { keys, diagnostics: runPass(root, ws, [collector]) };
};

const keyVia = (anchorRel: string, specifier: string, name: string): string | undefined =>
  importKeys(anchorRel, specifier, [name]).keys[name];

const CONSUMER = 'packages/consumer/src/uses.ts';
const COPY_SPECIFIER = '@mf/rem/extension-points';
const DIRECT_SPECIFIER = '../../rem/frontend/src/odh/extension-points/p';
const REMOTE_SPECIFIER = './extension-points/p';

describe('@mf-types declaration copies', () => {
  it('gives a copy the same key as its source declaration', () => {
    const direct = keyVia(CONSUMER, DIRECT_SPECIFIER, 'isRemP');
    expect(direct).toMatch(/^packages\/rem\/frontend\/src\//);
    expect(keyVia(CONSUMER, COPY_SPECIFIER, 'isRemP')).toBe(direct);
  });

  it('gives the copy key the same value as the remote program computes for the source', () => {
    const own = keyVia('packages/rem/frontend/src/odh/extensions.ts', REMOTE_SPECIFIER, 'RemP');
    expect(own).toMatch(/^packages\/rem\/frontend\/src\//);
    expect(keyVia(CONSUMER, COPY_SPECIFIER, 'RemP')).toBe(own);
  });

  it('maps a carried type copy to its .tsx source', () => {
    expect(keyVia(CONSUMER, COPY_SPECIFIER, 'RemData')).toMatch(
      /^packages\/rem\/frontend\/src\/odh\/extension-points\/data\.tsx:\d+$/,
    );
  });

  it('reports stale copies and keeps their own keys', () => {
    const { keys, diagnostics } = importKeys(CONSUMER, COPY_SPECIFIER, ['isStaleP', 'isGoneP']);
    expect(keys.isStaleP).toMatch(/^frontend\/@mf-types\//);
    expect(keys.isGoneP).toMatch(/^frontend\/@mf-types\//);
    const stale = diagnostics.filter((d) => d.code === 'stale-mf-types');
    expect(stale).toHaveLength(2);
    // the renamed guard: source exists, name does not
    expect(stale.map((d) => d.message).join('\n')).toContain("no top-level 'isStaleP'");
    // the removed file: no source at all
    expect(stale.map((d) => d.message).join('\n')).toContain('no source');
    expect(stale.every((d) => d.loc?.file.startsWith('frontend/@mf-types/'))).toBe(true);
  });

  it('reports a same-name copy whose point ID differs from the source', () => {
    const { keys, diagnostics } = importKeys(CONSUMER, COPY_SPECIFIER, ['DriftP']);
    expect(keys.DriftP).toMatch(/^frontend\/@mf-types\//);
    const stale = diagnostics.filter((d) => d.code === 'stale-mf-types');
    expect(stale).toHaveLength(1);
    expect(stale[0].message).toContain("point ID of 'DriftP' differs");
    expect(stale[0].message).toContain('rem.drift.copy');
    expect(stale[0].message).toContain('rem.drift.source');
    expect(stale[0].loc?.file.startsWith('frontend/@mf-types/')).toBe(true);
    // a proven mismatch is never reported as unverified
    expect(diagnostics.filter((d) => d.code === 'unverified-mf-types')).toHaveLength(0);
  });

  it('reports an unverified copy whose source is not part of this program', () => {
    const { keys, diagnostics } = importKeys(CONSUMER, COPY_SPECIFIER, ['UnvP']);
    expect(keys.UnvP).toMatch(/^frontend\/@mf-types\//);
    const unverified = diagnostics.filter((d) => d.code === 'unverified-mf-types');
    expect(unverified).toHaveLength(1);
    expect(unverified[0].message).toContain("point ID of 'UnvP'");
    expect(unverified[0].message).toContain('cannot be proven');
    expect(unverified[0].message).toContain('not part of this program');
    // unavailable evidence must not inflate the stale count
    expect(diagnostics.filter((d) => d.code === 'stale-mf-types')).toHaveLength(0);
  });

  it('reports an unverified copy whose source proves no point ID', () => {
    const { keys, diagnostics } = importKeys(CONSUMER, COPY_SPECIFIER, ['ShapeP']);
    expect(keys.ShapeP).toMatch(/^frontend\/@mf-types\//);
    const unverified = diagnostics.filter((d) => d.code === 'unverified-mf-types');
    expect(unverified).toHaveLength(1);
    expect(unverified[0].message).toContain("point ID of 'ShapeP'");
    expect(unverified[0].message).toContain('no literal point ID');
    // the source file is present in this program; the reason must not claim it is absent
    expect(unverified[0].message).not.toContain('not part of this program');
    expect(diagnostics.filter((d) => d.code === 'stale-mf-types')).toHaveLength(0);
  });

  it('reports each stale copy only once', () => {
    const keys: string[] = [];
    const collector: Collector<void> = {
      visit: (ctx) => {
        const uses = ctx.program.getSourceFile(path.join(root, CONSUMER));
        if (!uses) {
          return;
        }
        for (const statement of uses.statements) {
          if (
            !ts.isImportDeclaration(statement) ||
            !ts.isStringLiteral(statement.moduleSpecifier) ||
            statement.moduleSpecifier.text !== COPY_SPECIFIER
          ) {
            continue;
          }
          const bindings = statement.importClause?.namedBindings;
          if (!bindings || !ts.isNamedImports(bindings)) {
            continue;
          }
          const element = bindings.elements.find((e) => e.name.text === 'isGoneP');
          const symbol = element ? ctx.checker.getSymbolAtLocation(element.name) : undefined;
          const decl = symbol ? resolveAlias(ctx.checker, symbol).declarations?.[0] : undefined;
          if (decl) {
            keys.push(declKey(decl, ctx), declKey(decl, ctx));
          }
        }
      },
      finish: () => undefined,
    };
    const diagnostics = runPass(root, ws, [collector]);
    expect(keys).toHaveLength(2);
    expect(diagnostics.filter((d) => d.code === 'stale-mf-types')).toHaveLength(1);
  });
});
