import ts from 'typescript';
import { isUnresolvedSpreadKey, resolveValue, unresolvedSpreadKey } from './values';
import type { ProgramCtx } from '../programs/stream';
import { locOf, resolveAlias } from '../programs/identity';
import type { Loc, SymbolRef, Value } from '../model/types';

const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
};

const objectExpression = (declaration: ts.Node): ts.ObjectLiteralExpression | undefined => {
  if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
    const initializer = unwrapExpression(declaration.initializer);
    return ts.isObjectLiteralExpression(initializer) ? initializer : undefined;
  }
  if (ts.isExportAssignment(declaration)) {
    const expression = unwrapExpression(declaration.expression);
    return ts.isObjectLiteralExpression(expression) ? expression : undefined;
  }
  return undefined;
};

const keyOf = (name: ts.PropertyName): string => {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
};

const symbolRef = (expression: ts.Identifier, key: string, ctx: ProgramCtx): SymbolRef => {
  const symbol = ctx.checker.getSymbolAtLocation(expression);
  const resolved = symbol === undefined ? undefined : resolveAlias(ctx.checker, symbol);
  const declaration = resolved?.valueDeclaration ?? resolved?.declarations?.[0];
  const loc: Loc = declaration === undefined ? locOf(expression, ctx) : locOf(declaration, ctx);
  return { kind: 'symbol', name: resolved?.name ?? key, loc };
};

const functionRef = (
  expression: ts.ArrowFunction | ts.FunctionExpression,
  key: string,
  ctx: ProgramCtx,
): SymbolRef => ({
  kind: 'symbol',
  name: expression.name?.text ?? key,
  loc: locOf(expression, ctx),
});

/** Reads literal supplies and symbol references from an exported object value. */
export const readSupplies = (
  declaration: ts.Node,
  ctx: ProgramCtx,
): Record<string, Value | SymbolRef> | undefined => {
  const object = objectExpression(declaration);
  if (object === undefined) {
    return undefined;
  }
  const supplies: Record<string, Value | SymbolRef> = {};
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property)) {
      const key = keyOf(property.name);
      const expression = unwrapExpression(property.initializer);
      if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
        supplies[key] = functionRef(expression, key, ctx);
      } else {
        const value = resolveValue(expression, ctx);
        supplies[key] =
          value.kind === 'unresolved' && ts.isIdentifier(expression)
            ? symbolRef(expression, key, ctx)
            : value;
      }
    } else if (ts.isShorthandPropertyAssignment(property)) {
      const value = resolveValue(property.name, ctx);
      supplies[property.name.text] =
        value.kind === 'unresolved' ? symbolRef(property.name, property.name.text, ctx) : value;
    } else if (ts.isMethodDeclaration(property)) {
      const key = keyOf(property.name);
      supplies[key] = {
        kind: 'symbol',
        name: key,
        loc: locOf(property, ctx),
      };
    } else if (ts.isSpreadAssignment(property)) {
      for (const key of Object.keys(supplies)) {
        if (!isUnresolvedSpreadKey(key)) {
          delete supplies[key];
        }
      }
      supplies[unresolvedSpreadKey(property, ctx)] = {
        kind: 'unresolved',
        reason: 'object spread contribution is not statically resolved',
        loc: locOf(property, ctx),
      };
    }
  }
  return supplies;
};
