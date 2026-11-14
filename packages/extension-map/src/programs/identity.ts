import ts from 'typescript';
import type { ProgramCtx } from './stream';
import { relFile } from '../discovery/workspace';
import type { Loc } from '../model/types';

/**
 * The cross-program identity of a declaration that carries no ID literal of its own:
 * `<repo-relative file>:<start position>`.
 */
export const declKey = (node: ts.Node, ctx: ProgramCtx): string => {
  const file = node.getSourceFile();
  return `${relFile(ctx.repoRoot, file.fileName)}:${node.getStart(file)}`;
};

/** The 1-based line range a node spans. `endLine` is omitted for a single-line node. */
export const locOf = (node: ts.Node, ctx: ProgramCtx): Loc => {
  const file = node.getSourceFile();
  const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const endLine = file.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  return {
    file: relFile(ctx.repoRoot, file.fileName),
    line,
    ...(endLine > line ? { endLine } : {}),
  };
};

/** Follows import/export aliases to the symbol that actually declares the thing. */
export const resolveAlias = (checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol => {
  let current = symbol;
  const seen = new Set<ts.Symbol>();
  while ((current.flags & ts.SymbolFlags.Alias) !== 0 && !seen.has(current)) {
    seen.add(current);
    const next = checker.getAliasedSymbol(current);
    if (next === current) {
      break;
    }
    current = next;
  }
  return current;
};

/**
 * The extension point ID(s) a type names, read from the type and not from the syntax: the
 * string-literal value(s) of its `type` property, when it also has a `properties` property.
 * `undefined` when either property is absent or the `type` property is not all string literals
 * (a plain `string`, say). Callers unwrap `| undefined | null` and array element types first.
 */
export const extensionTypeIds = (type: ts.Type, checker: ts.TypeChecker): string[] | undefined => {
  const typeProperty = type.getProperty('type');
  if (!typeProperty || !type.getProperty('properties')) {
    return undefined;
  }
  const idType = checker.getTypeOfSymbol(typeProperty);
  const parts = idType.isUnion() ? idType.types : [idType];
  const ids = parts.flatMap((part) => (part.isStringLiteral() ? [part.value] : []));
  return ids.length === parts.length && ids.length > 0 ? ids.toSorted() : undefined;
};

/**
 * The extension point ID(s) a guard narrows to: the `extensionTypeIds` of the target type of the
 * first call signature of `type` that has a type predicate with a target. `undefined` when the
 * type is not such a guard.
 */
export const predicateTargetIds = (
  type: ts.Type,
  checker: ts.TypeChecker,
): string[] | undefined => {
  for (const signature of type.getCallSignatures()) {
    const predicate = checker.getTypePredicateOfSignature(signature);
    const ids = predicate?.type ? extensionTypeIds(predicate.type, checker) : undefined;
    if (ids) {
      return ids;
    }
  }
  return undefined;
};
