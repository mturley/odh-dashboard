import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { analyzeRepo } from '../../src/analyze';
import type { AnalyzeOptions } from '../../src/analyze';
import { relFile } from '../../src/discovery/workspace';
import { resolveValue } from '../../src/extract/values';
import type { ExtensionMapModel, Value, WorkspacePackage } from '../../src/model/types';
import { runPass } from '../../src/programs/stream';
import type { ProgramCtx } from '../../src/programs/stream';

export const fixtureDir = (name: string): string => path.join(__dirname, '..', 'fixtures', name);

/** Reads a fixture's `workspace.json` (dirs are relative to the fixture root). */
export const readWorkspace = (name: string): WorkspacePackage[] => {
  const parsed: unknown = JSON.parse(
    fs.readFileSync(path.join(fixtureDir(name), 'workspace.json'), 'utf8'),
  );
  if (!Array.isArray(parsed)) {
    throw new Error(`${name}/workspace.json must contain an array`);
  }
  return parsed;
};

export const analyzeFixture = (name: string, opts?: Partial<AnalyzeOptions>): ExtensionMapModel =>
  analyzeRepo({ repoRoot: fixtureDir(name), workspace: readWorkspace(name), ...opts });

/** Sorted entry ids of a model. */
export const entryIds = (m: ExtensionMapModel): string[] => m.entries.map((e) => e.id).toSorted();

/** `[code, pkg]` pairs of a model's diagnostics. */
export const codes = (m: ExtensionMapModel): [string, string | undefined][] =>
  m.diagnostics.map((d) => [d.code, d.pkg]);

/** Diagnostic codes of a model, in model order. */
export const diagCodes = (m: ExtensionMapModel): string[] => m.diagnostics.map((d) => d.code);

/** Sorted point ids of a model. */
export const pointIds = (m: ExtensionMapModel): string[] => m.points.map((p) => p.id);

/**
 * Resolves the initializer of every top-level variable of one fixture file, in the program that
 * owns it. Lets value tests name a variable instead of building a program by hand.
 */
export const valuesOf = (name: string, file: string): Map<string, Value> => {
  const repoRoot = fixtureDir(name);
  const resolved = new Map<string, Value>();
  const collector = {
    visit: (ctx: ProgramCtx): void => {
      const source = ctx.ownedFiles.find((f) => relFile(repoRoot, f.fileName) === file);
      source?.forEachChild((node) => {
        if (ts.isVariableStatement(node)) {
          node.declarationList.declarations.forEach((decl) => {
            if (ts.isIdentifier(decl.name) && decl.initializer) {
              resolved.set(decl.name.text, resolveValue(decl.initializer, ctx));
            }
          });
        }
      });
    },
    finish: (): undefined => undefined,
  };
  runPass(repoRoot, readWorkspace(name), [collector], {});
  return resolved;
};

/**
 * Resolves the expression each top-level function declaration of one fixture file returns, by
 * function name: a way to resolve a reference that only exists inside a function body.
 */
export const returnedValuesOf = (name: string, file: string): Map<string, Value> => {
  const repoRoot = fixtureDir(name);
  const resolved = new Map<string, Value>();
  const collector = {
    visit: (ctx: ProgramCtx): void => {
      const source = ctx.ownedFiles.find((f) => relFile(repoRoot, f.fileName) === file);
      source?.forEachChild((node) => {
        if (ts.isFunctionDeclaration(node) && node.name && node.body) {
          const returned = node.body.statements.find(ts.isReturnStatement)?.expression;
          if (returned) {
            resolved.set(node.name.text, resolveValue(returned, ctx));
          }
        }
      });
    },
    finish: (): undefined => undefined,
  };
  runPass(repoRoot, readWorkspace(name), [collector], {});
  return resolved;
};
