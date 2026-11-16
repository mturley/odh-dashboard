import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { ProgramCtx } from './stream';
import { readFederationExpose } from '../discovery/hostFederation';
import { toRelPosix } from '../discovery/workspace';
import { makeDiagnostic } from '../model/diagnostics';
import type { Loc, WorkspacePackage } from '../model/types';

/**
 * `@mf-types` declaration copies → source (spec §5.3). A declaration reached
 * through `frontend/@mf-types/@mf/<remote>/compiled-types/**` joins its source
 * declaration in the remote's frontend root: the path below `compiled-types/`
 * is mirrored onto that root, `.d.ts` is swapped for `.ts`/`.tsx`, and the
 * top-level declaration of the same name provides the key (positions differ
 * between copy and source, names do not). The copies themselves are never
 * definitions.
 *
 * Only source declaration keys, `Loc`s and plain strings leave this module.
 * Source files are parsed with `ts.createSourceFile` (parser-only, never a
 * checker or `ts.Program`); the parsed files are cached per mapper, and a
 * mapper never outlives its `ProgramCtx`.
 */

export type MfTypesMapping = { key: string; loc: Loc } | { stale: string };

/** `frontend/@mf-types/@mf/<remote>/compiled-types/<rest>.d.ts` */
const COPY_PATH = /^frontend\/@mf-types\/@mf\/([^/]+)\/compiled-types\/(.+)\.d\.ts$/;

/** Per-program mapper state: parsed sources and already-reported stale keys. */
type Mapper = { sources: Map<string, ts.SourceFile>; reported: Set<string> };

const mappers = new WeakMap<ProgramCtx, Mapper>();

const mapperFor = (ctx: ProgramCtx): Mapper => {
  const existing = mappers.get(ctx);
  if (existing) {
    return existing;
  }
  const mapper: Mapper = { sources: new Map(), reported: new Set() };
  mappers.set(ctx, mapper);
  return mapper;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** The remote name a workspace package declares in its `module-federation` config. */
const moduleFederationName = (pkg: WorkspacePackage): string | undefined => {
  const config = pkg.packageJson['module-federation'];
  if (!isRecord(config)) {
    return undefined;
  }
  return typeof config.name === 'string' ? config.name : undefined;
};

/** Name of a declaration node (looking inside variable statements), if any. */
const declaredName = (node: ts.Node): string | undefined => {
  if (ts.isVariableStatement(node)) {
    // A variable statement always has at least one declaration.
    const first = node.declarationList.declarations[0];
    return ts.isIdentifier(first.name) ? first.name.text : undefined;
  }
  if (ts.isVariableDeclaration(node)) {
    return ts.isIdentifier(node.name) ? node.name.text : undefined;
  }
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node)
  ) {
    return node.name?.text;
  }
  return undefined;
};

/** The top-level declaration in `source` named `name`, if any. */
const findNamed = (source: ts.SourceFile, name: string): ts.Node | undefined => {
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      const found = statement.declarationList.declarations.find(
        (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name,
      );
      if (found) {
        return found;
      }
      continue;
    }
    if (declaredName(statement) === name) {
      return statement;
    }
  }
  return undefined;
};

/** Parses `absFile` parser-only, cached per mapper. */
const parseSource = (absFile: string, mapper: Mapper): ts.SourceFile => {
  const cached = mapper.sources.get(absFile);
  if (cached) {
    return cached;
  }
  const parsed = ts.createSourceFile(
    absFile,
    fs.readFileSync(absFile, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  mapper.sources.set(absFile, parsed);
  return parsed;
};

/** 1-based location of a node in an already-parsed source file. */
const locOfNode = (node: ts.Node, relFile: string): Loc => {
  const file = node.getSourceFile();
  const lineOf = (pos: number): number => file.getLineAndCharacterOfPosition(pos).line + 1;
  return { file: relFile, line: lineOf(node.getStart()), endLine: lineOf(node.getEnd()) };
};

/** Maps one copy declaration onto its mirrored source file, by name. */
const mapToSource = (
  relFile: string,
  name: string,
  rest: string,
  frontendDir: string,
  repoRoot: string,
  mapper: Mapper,
): MfTypesMapping => {
  for (const suffix of ['.ts', '.tsx']) {
    const rel = path.posix.normalize(path.posix.join(frontendDir, `${rest}${suffix}`));
    if (!fs.existsSync(path.join(repoRoot, rel))) {
      continue;
    }
    const found = findNamed(parseSource(path.join(repoRoot, rel), mapper), name);
    if (!found) {
      return { stale: `${relFile}: source ${rel} declares no top-level '${name}'` };
    }
    return { key: `${rel}:${found.getStart()}`, loc: locOfNode(found, rel) };
  }
  return { stale: `${relFile}: no source '${rest}.ts' or '${rest}.tsx' under ${frontendDir}` };
};

/**
 * Maps a declaration reached through an `@mf-types` copy to its source key and
 * location: `undefined` when the declaration's file is not a copy (or has no
 * name to map by), `{ stale: reason }` when the remote, source file or name is
 * missing. Never consults the checker and never recurses into `declKey`.
 */
export const mapMfTypesDecl = (node: ts.Node, ctx: ProgramCtx): MfTypesMapping | undefined => {
  const relFile = toRelPosix(ctx.repoRoot, node.getSourceFile().fileName);
  const match = COPY_PATH.exec(relFile);
  if (!match) {
    return undefined;
  }
  const [, remoteName, rest] = match;
  const name = declaredName(node);
  if (name === undefined) {
    return undefined;
  }
  const pkg = ctx.ws.find((candidate) => moduleFederationName(candidate) === remoteName);
  if (!pkg) {
    return {
      stale: `${relFile}: no workspace package declares module-federation name '${remoteName}'`,
    };
  }
  const expose = readFederationExpose(pkg.dir, ctx.repoRoot);
  if (!expose) {
    return { stale: `${relFile}: ${pkg.name} has no moduleFederation.js` };
  }
  if (!('file' in expose)) {
    return { stale: `${relFile}: ${expose.unresolved}` };
  }
  return mapToSource(relFile, name, rest, expose.frontendDir, ctx.repoRoot, mapperFor(ctx));
};

/** Records a `stale-mf-types` diagnostic for a copy declaration, once per copy. */
export const reportStaleMfTypes = (reason: string, node: ts.Node, ctx: ProgramCtx): void => {
  const mapper = mapperFor(ctx);
  const file = node.getSourceFile();
  const relFile = toRelPosix(ctx.repoRoot, file.fileName);
  const copyKey = `${relFile}:${node.getStart()}`;
  if (mapper.reported.has(copyKey)) {
    return;
  }
  mapper.reported.add(copyKey);
  const lineOf = (pos: number): number => file.getLineAndCharacterOfPosition(pos).line + 1;
  ctx.diagnostics.push(
    makeDiagnostic('stale-mf-types', reason, {
      file: relFile,
      line: lineOf(node.getStart()),
      endLine: lineOf(node.getEnd()),
    }),
  );
};
