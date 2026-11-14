import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import type { ProgramCtx } from './stream';
import { federationFrontendRoot } from '../discovery/hostFederation';
import { pkgForFile, relFile } from '../discovery/workspace';
import { makeDiagnostic } from '../model/diagnostics';
import type { Diagnostic, Loc, WorkspacePackage } from '../model/types';

/**
 * The path segment pair that marks a committed declaration copy of a federated remote:
 * `<...>/@mf-types/@mf/<remote>/compiled-types/<path below the remote's frontend root>.d.ts`.
 */
const COPY_ROOT = '@mf-types/@mf/';
/** The directory below `@mf/<remote>/` that mirrors the remote's frontend root. */
const COPY_DIR = 'compiled-types';
/** The extensions a `.d.ts` copy may have been generated from, in the order they are tried. */
const SOURCE_EXTENSIONS: readonly string[] = ['.ts', '.tsx'];
const DECLARATION_SUFFIX = '.d.ts';

/**
 * Where a declaration reached through a committed copy really lives: `key` and `loc` of the
 * source declaration, or the reason the copy could not be mapped back to one.
 */
export type MfTypesMapping = { key: string; loc: Loc } | { stale: string };

/** All a source declaration is remembered by, so no `ts` node outlives the file it was parsed from. */
type SourceDecl = { pos: number; line: number; endLine: number };

/**
 * Per-pass state: the parsed source files, the remote frontend roots and the stale copies already
 * reported. Keyed by the pass's diagnostics array, which every `ProgramCtx` of one pass shares,
 * so the same stale copy seen from many programs is reported once and nothing leaks between runs.
 */
type Scope = {
  /** Repo-relative source file -> its top-level declarations by name; `undefined` when unreadable. */
  sources: Map<string, Map<string, SourceDecl> | undefined>;
  /** `module-federation.name` -> the remote's repo-relative frontend root. */
  roots: Map<string, string | undefined>;
  reported: Set<string>;
};

const scopes = new WeakMap<Diagnostic[], Scope>();

const scopeOf = (ctx: ProgramCtx): Scope => {
  const existing = scopes.get(ctx.diagnostics);
  if (existing) {
    return existing;
  }
  const scope: Scope = { sources: new Map(), roots: new Map(), reported: new Set() };
  scopes.set(ctx.diagnostics, scope);
  return scope;
};

/** The remote and the path below `compiled-types/` of a committed copy; `undefined` for any other file. */
const copyPath = (rel: string): { remote: string; below: string } | undefined => {
  if (rel.startsWith('..') || !rel.endsWith(DECLARATION_SUFFIX)) {
    return undefined;
  }
  const at = rel.indexOf(COPY_ROOT);
  if (at === -1 || (at > 0 && rel[at - 1] !== '/')) {
    return undefined;
  }
  const [remote, dir, ...below] = rel
    .slice(at + COPY_ROOT.length, -DECLARATION_SUFFIX.length)
    .split('/');
  return remote && dir === COPY_DIR && below.length > 0
    ? { remote, below: below.join('/') }
    : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The remote name a package publishes itself under, never a table of known remotes. */
export const remoteNameOf = (pkg: WorkspacePackage): string | undefined => {
  const config = pkg.packageJson['module-federation'];
  return isRecord(config) && typeof config.name === 'string' ? config.name : undefined;
};

/** The frontend root of the workspace package whose `module-federation.name` is `remote`. */
const frontendRootOf = (remote: string, ctx: ProgramCtx, scope: Scope): string | undefined => {
  if (scope.roots.has(remote)) {
    return scope.roots.get(remote);
  }
  const owner = ctx.ws.find((candidate) => remoteNameOf(candidate) === remote);
  const root = owner ? federationFrontendRoot(owner.dir, ctx.repoRoot) : undefined;
  scope.roots.set(remote, root);
  return root;
};

/**
 * The top-level named declarations of a parsed file, by name. Only the declaration kinds a
 * generated `.d.ts` copy can carry are recorded, at the same start position `declKey` reads, so
 * a mapped key is the key the source declaration would get from its own program.
 */
const declarationsOf = (file: ts.SourceFile): Map<string, SourceDecl> => {
  const found = new Map<string, SourceDecl>();
  const add = (name: ts.Node | undefined, node: ts.Node): void => {
    if (!name || !ts.isIdentifier(name) || found.has(name.text)) {
      return;
    }
    const pos = node.getStart(file);
    found.set(name.text, {
      pos,
      line: file.getLineAndCharacterOfPosition(pos).line + 1,
      endLine: file.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
    });
  };
  file.forEachChild((node) => {
    if (ts.isVariableStatement(node)) {
      node.declarationList.declarations.forEach((decl) => add(decl.name, decl));
    } else if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node)
    ) {
      add(node.name, node);
    }
  });
  return found;
};

/**
 * The declarations of a repo-relative source file, parsed for syntax only and cached per pass.
 * `undefined` when the file does not exist. The `ts.SourceFile` is dropped once read.
 */
const sourceDecls = (
  relSource: string,
  ctx: ProgramCtx,
  scope: Scope,
): Map<string, SourceDecl> | undefined => {
  if (scope.sources.has(relSource)) {
    return scope.sources.get(relSource);
  }
  const absolute = path.join(ctx.repoRoot, relSource);
  let text: string;
  try {
    text = fs.readFileSync(absolute, 'utf8');
  } catch {
    scope.sources.set(relSource, undefined);
    return undefined;
  }
  const parsed = ts.createSourceFile(
    absolute,
    text,
    ts.ScriptTarget.Latest,
    false,
    relSource.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const decls = declarationsOf(parsed);
  scope.sources.set(relSource, decls);
  return decls;
};

/** The identifier a declaration is named by, over the same kinds `declarationsOf` indexes. */
const declaredIdentifier = (node: ts.Node): ts.Identifier | undefined => {
  const name =
    ts.isVariableDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node)
      ? node.name
      : undefined;
  return name && ts.isIdentifier(name) ? name : undefined;
};

/**
 * Maps a declaration read out of a committed `@mf-types` copy onto the real source declaration:
 * the path below `compiled-types/` is mirrored onto the remote's frontend root, and the
 * declaration is matched there **by name**, since the generated positions differ. `undefined`
 * when the declaration is not in a copy at all.
 */
export const mapMfTypesDecl = (decl: ts.Node, ctx: ProgramCtx): MfTypesMapping | undefined => {
  const copyFile = relFile(ctx.repoRoot, decl.getSourceFile().fileName);
  const copy = copyPath(copyFile);
  if (!copy) {
    return undefined;
  }
  const scope = scopeOf(ctx);
  const root = frontendRootOf(copy.remote, ctx, scope);
  if (root === undefined) {
    return {
      stale: `${copyFile} belongs to the module federation remote '${copy.remote}', which no workspace package declares, so it cannot be mapped back to source.`,
    };
  }
  const name = declaredIdentifier(decl);
  if (!name) {
    return {
      stale: `A declaration in ${copyFile} has no name to match against ${root}, so it cannot be mapped back to source.`,
    };
  }
  const candidates = SOURCE_EXTENSIONS.map((ext) => `${root}/${copy.below}${ext}`);
  const present: string[] = [];
  for (const relSource of candidates) {
    const decls = sourceDecls(relSource, ctx, scope);
    if (!decls) {
      continue;
    }
    present.push(relSource);
    const found = decls.get(name.text);
    if (found) {
      return {
        key: `${relSource}:${found.pos}`,
        loc: {
          file: relSource,
          line: found.line,
          ...(found.endLine > found.line ? { endLine: found.endLine } : {}),
        },
      };
    }
  }
  return {
    stale:
      present.length === 0
        ? `'${
            name.text
          }' is declared in ${copyFile}, but no source file exists at ${candidates.join(' or ')}.`
        : `'${name.text}' is declared in ${copyFile} but not in ${present.join(' or ')}.`,
  };
};

/**
 * Records that a committed copy could not be mapped back to source. The same reason is only
 * recorded once per pass: one stale copy is reached from every program that imports it.
 */
export const reportStaleMfTypes = (reason: string, decl: ts.Node, ctx: ProgramCtx): void => {
  const scope = scopeOf(ctx);
  if (scope.reported.has(reason)) {
    return;
  }
  scope.reported.add(reason);
  const file = decl.getSourceFile();
  const copyFile = relFile(ctx.repoRoot, file.fileName);
  const loc: Loc = {
    file: copyFile,
    line: file.getLineAndCharacterOfPosition(decl.getStart(file)).line + 1,
  };
  ctx.diagnostics.push(makeDiagnostic('stale-mf-types', reason, loc, pkgForFile(copyFile, ctx.ws)));
};
