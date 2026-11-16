import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { ProgramCtx } from './stream';
// Call-time-only cycle: `identity.declKey` calls into this module, which uses
// `extensionTypeIds` from `identity` inside function bodies only.
import { extensionTypeIds } from './identity';
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
 * second `ts.Program`); the parsed files are cached per mapper, and a
 * mapper never outlives its `ProgramCtx`. The point-ID comparison (§5.3)
 * uses the current program's checker: the copy declaration's own type, and
 * the source declaration's type when the current program happens to include
 * the source file (checked transiently, never retained in the cache).
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

/**
 * The point-ID literals a declaration's type proves (checker-proof, spec
 * §5.4: a string-literal `type` property on a type that also has a
 * `properties` property), or undefined when the type is not extension-shaped.
 */
const pointIdsOf = (node: ts.Node, ctx: ProgramCtx): string[] | undefined =>
  extensionTypeIds(ctx.checker.getTypeAtLocation(node), ctx.checker);

/** Whether two checker-proven point-ID lists name the same ids. */
const samePointIds = (copy: string[], source: string[]): boolean =>
  copy.length === source.length && copy.every((id) => source.includes(id));

/** Maps one copy declaration onto its mirrored source file, by name. */
const mapToSource = (
  node: ts.Node,
  relFile: string,
  name: string,
  rest: string,
  frontendDir: string,
  ctx: ProgramCtx,
  mapper: Mapper,
): MfTypesMapping => {
  for (const suffix of ['.ts', '.tsx']) {
    const rel = path.posix.normalize(path.posix.join(frontendDir, `${rest}${suffix}`));
    const abs = path.join(ctx.repoRoot, rel);
    if (!fs.existsSync(abs)) {
      continue;
    }
    // Prefer the current program's copy of the source file when it has one:
    // it allows a checker-proof point-ID comparison (§5.3) and never enters
    // the parser-only cache, so no program `SourceFile` is retained here.
    const programFile = ctx.program.getSourceFile(abs);
    const source = programFile ?? parseSource(abs, mapper);
    const found = findNamed(source, name);
    if (!found) {
      return { stale: `${relFile}: source ${rel} declares no top-level '${name}'` };
    }
    // An extension-point copy maps only when the source's point-ID literal is
    // proven equal; a differing — or unverifiable — ID is stale, never mapped.
    const copyIds = pointIdsOf(node, ctx);
    if (copyIds !== undefined) {
      const sourceIds = programFile ? pointIdsOf(found, ctx) : undefined;
      if (sourceIds === undefined) {
        return {
          stale:
            `${relFile}: point ID of '${name}' (${copyIds.join(', ')}) cannot be proven ` +
            `against ${rel}: the source is not part of this program`,
        };
      }
      if (!samePointIds(copyIds, sourceIds)) {
        return {
          stale:
            `${relFile}: point ID of '${name}' differs between copy ` +
            `(${copyIds.join(', ')}) and source ${rel} (${sourceIds.join(', ')})`,
        };
      }
    }
    return { key: `${rel}:${found.getStart()}`, loc: locOfNode(found, rel) };
  }
  return { stale: `${relFile}: no source '${rest}.ts' or '${rest}.tsx' under ${frontendDir}` };
};

/**
 * Maps a declaration reached through an `@mf-types` copy to its source key and
 * location: `undefined` when the declaration's file is not a copy (or has no
 * name to map by), `{ stale: reason }` when the remote, source file or name is
 * missing, or when an extension-point copy's point ID is not proven equal to
 * the source's. Never recurses into `declKey` and never creates a program.
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
  return mapToSource(node, relFile, name, rest, expose.frontendDir, ctx, mapperFor(ctx));
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
