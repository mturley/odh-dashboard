import ts from 'typescript';
import type { SymbolRef, Value } from '../model/types';
import { locOf, resolveAlias, unwrapExpression } from '../programs/identity';
import type { ProgramCtx } from '../programs/stream';

/** Resolves one expression to a `Value`, with the recursion state of the call that needs it. */
export type ValueResolver = (expr: ts.Expression) => Value;

/** The object literal a declaration carries, through `satisfies`, `as` and parentheses. */
const objectLiteralOf = (decl: ts.Node): ts.ObjectLiteralExpression | undefined => {
  const expr = ts.isVariableDeclaration(decl)
    ? decl.initializer
    : ts.isExportAssignment(decl)
    ? decl.expression
    : ts.isPropertyAssignment(decl)
    ? decl.initializer
    : ts.isObjectLiteralExpression(decl)
    ? decl
    : undefined;
  if (!expr) {
    return undefined;
  }
  const unwrapped = unwrapExpression(expr);
  return ts.isObjectLiteralExpression(unwrapped) ? unwrapped : undefined;
};

const isFunctionLike = (expr: ts.Expression): boolean =>
  ts.isArrowFunction(expr) || ts.isFunctionExpression(expr);

/** Where a referenced symbol is declared, falling back to the reference itself. */
const refLoc = (expr: ts.Expression, ctx: ProgramCtx): SymbolRef['loc'] => {
  const symbol = ts.isIdentifier(expr) ? ctx.checker.getSymbolAtLocation(expr) : undefined;
  const decl = symbol ? resolveAlias(ctx.checker, symbol).declarations?.[0] : undefined;
  return locOf(decl ?? expr, ctx);
};

/**
 * One supplied property: the value when it resolves, otherwise a reference to the function or
 * symbol it names. A name is worth keeping even when the thing it names cannot be read as data.
 */
const supplyOf = (
  name: string,
  expr: ts.Expression,
  ctx: ProgramCtx,
  resolve: ValueResolver,
): Value | SymbolRef => {
  const unwrapped = unwrapExpression(expr);
  const value = resolve(unwrapped);
  // A function is code, not something a supplied property can carry as data: name it instead.
  if (value.kind !== 'unresolved' && value.kind !== 'function') {
    return value;
  }
  if (ts.isIdentifier(unwrapped)) {
    return { kind: 'symbol', name: unwrapped.text, loc: refLoc(unwrapped, ctx) };
  }
  if (isFunctionLike(unwrapped)) {
    return { kind: 'symbol', name, loc: locOf(unwrapped, ctx) };
  }
  return value;
};

/**
 * What the target of a code reference supplies: the properties of the object literal it
 * declares. `undefined` when the declaration is not an object literal (a component, a hook).
 */
export const readSupplies = (
  decl: ts.Node,
  ctx: ProgramCtx,
  resolve: ValueResolver,
): Record<string, Value | SymbolRef> | undefined => {
  const object = objectLiteralOf(decl);
  if (!object) {
    return undefined;
  }
  const supplies: Record<string, Value | SymbolRef> = {};
  for (const property of object.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      supplies[property.name.text] = supplyOf(property.name.text, property.name, ctx, resolve);
    } else if (
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))
    ) {
      supplies[property.name.text] = supplyOf(
        property.name.text,
        property.initializer,
        ctx,
        resolve,
      );
    } else if (
      (ts.isMethodDeclaration(property) || ts.isGetAccessorDeclaration(property)) &&
      ts.isIdentifier(property.name)
    ) {
      supplies[property.name.text] = {
        kind: 'symbol',
        name: property.name.text,
        loc: locOf(property, ctx),
      };
    }
  }
  return supplies;
};
