import ts from 'typescript';
import type { ProgramCtx } from './stream';
import { mapMfTypesDecl, reportStaleMfTypes } from './mfTypes';
import type { Loc } from '../model/types';
import { toRelPosix } from '../discovery/workspace';

/**
 * Cross-program declaration identity: `<repo-relative file>:<start position>`.
 * Positions are byte offsets, stable across programs that parse the same
 * file, so declarations join without holding any AST state. A declaration
 * reached through an `@mf-types` copy uses its source declaration's key; a
 * stale copy keeps its own key and reports `stale-mf-types` (§5.3).
 */
export const declKey = (node: ts.Node, ctx: ProgramCtx): string => {
  const mapped = mapMfTypesDecl(node, ctx);
  if (mapped) {
    if ('key' in mapped) {
      return mapped.key;
    }
    reportStaleMfTypes(mapped.stale, node, ctx);
  }
  return `${toRelPosix(ctx.repoRoot, node.getSourceFile().fileName)}:${node.getStart()}`;
};

/** 1-based source location of a node, from its start line to its end line. */
export const locOf = (node: ts.Node, ctx: ProgramCtx): Loc => {
  const file = node.getSourceFile();
  const lineOf = (pos: number): number => file.getLineAndCharacterOfPosition(pos).line + 1;
  return {
    file: toRelPosix(ctx.repoRoot, file.fileName),
    line: lineOf(node.getStart()),
    endLine: lineOf(node.getEnd()),
  };
};

/** Follows `SymbolFlags.Alias` links (imports, re-exports) to the final symbol. */
export const resolveAlias = (checker: ts.TypeChecker, sym: ts.Symbol): ts.Symbol => {
  let current = sym;
  while ((current.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(current);
    if (aliased === current) {
      break;
    }
    current = aliased;
  }
  return current;
};

export const isStringLiteralType = (t: ts.Type): t is ts.StringLiteralType =>
  (t.flags & ts.TypeFlags.StringLiteral) !== 0;

/**
 * The string-literal value(s) of `t`'s `type` property when `t` also has a
 * `properties` property: one element for a literal, several for a union of
 * literals, `undefined` when `type` is plain `string`, absent, or anything
 * else that is not provably a string literal. Callers unwrap `| undefined |
 * null` and array element types before calling.
 */
export const extensionTypeIds = (t: ts.Type, checker: ts.TypeChecker): string[] | undefined => {
  const typeProp = t.getProperty('type');
  if (!typeProp || !t.getProperty('properties')) {
    return undefined;
  }
  const typeType = checker.getTypeOfSymbol(typeProp);
  const parts = typeType.isUnion() ? typeType.types : [typeType];
  const ids: string[] = [];
  for (const part of parts) {
    if (!isStringLiteralType(part)) {
      return undefined;
    }
    ids.push(part.value);
  }
  return ids.length > 0 ? ids : undefined;
};
