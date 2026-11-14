import ts from 'typescript';
import { arrowBodyExpression, resolveValue } from './values';
import { pkgForFile, relFile } from '../discovery/workspace';
import { makeDiagnostic } from '../model/diagnostics';
import type { Diagnostic, Entry, ExtensionRecord, Value } from '../model/types';
import { declKey, locOf, resolveAlias, unwrapExpression } from '../programs/identity';
import type { Collector, ProgramCtx } from '../programs/stream';

export type ExtensionsResult = {
  extensions: ExtensionRecord[];
  diagnostics: Diagnostic[];
};

/** How a generated element was produced, when it came out of a `.map()` over an array. */
type Generated = { multiplicity: number | 'unknown'; mappedValues?: Value[] };

/** A `.map()` call: the array it reads and the callback it applies. */
type MapCall = { source: ts.Expression; callback: ts.Expression | undefined };

const mapCallOf = (expr: ts.Expression): MapCall | undefined =>
  ts.isCallExpression(expr) &&
  ts.isPropertyAccessExpression(expr.expression) &&
  expr.expression.name.text === 'map'
    ? { source: expr.expression.expression, callback: expr.arguments[0] }
    : undefined;

/** The object literal a `.map()` callback returns, when it returns one directly. */
const callbackObject = (
  callback: ts.Expression | undefined,
): ts.ObjectLiteralExpression | undefined => {
  if (!callback) {
    return undefined;
  }
  const fn = unwrapExpression(callback);
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) {
    return undefined;
  }
  const body = arrowBodyExpression(fn);
  if (!body) {
    return undefined;
  }
  const returned = unwrapExpression(body);
  return ts.isObjectLiteralExpression(returned) ? returned : undefined;
};

const namedProperty = (
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined => {
  const found = object.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) &&
      property.name.text === name,
  );
  return found?.initializer;
};

/** The extension point id an object literal's `type` property names, when it resolves to one. */
const typeIdOf = (object: ts.ObjectLiteralExpression, ctx: ProgramCtx): string | undefined => {
  const expr = namedProperty(object, 'type');
  if (!expr) {
    return undefined;
  }
  const value = resolveValue(expr, ctx);
  const id =
    value.kind === 'literal' || value.kind === 'constant' || value.kind === 'enumMember'
      ? value.value
      : undefined;
  return typeof id === 'string' ? id : undefined;
};

/** The initializer a reference names, so an element or array written once can be reached by name. */
const followedInitializer = (
  expr: ts.Expression,
  ctx: ProgramCtx,
): { node: ts.Expression; key: string } | undefined => {
  if (!ts.isIdentifier(expr) && !ts.isPropertyAccessExpression(expr)) {
    return undefined;
  }
  const raw = ctx.checker.getSymbolAtLocation(expr);
  const symbol = raw ? resolveAlias(ctx.checker, raw) : undefined;
  const decl = symbol?.declarations?.find(ts.isVariableDeclaration);
  return decl?.initializer ? { node: decl.initializer, key: declKey(decl, ctx) } : undefined;
};

/** The default export of a module, through `export default`, a name, or a re-export. */
const defaultExport = (file: ts.SourceFile, ctx: ProgramCtx): ts.Expression | undefined => {
  const moduleSymbol = ctx.checker.getSymbolAtLocation(file);
  if (!moduleSymbol) {
    return undefined;
  }
  const exported = ctx.checker
    .getExportsOfModule(moduleSymbol)
    .find((symbol) => symbol.name === 'default');
  const decl = exported
    ? resolveAlias(ctx.checker, exported).declarations?.find(
        (candidate) => ts.isExportAssignment(candidate) || ts.isVariableDeclaration(candidate),
      )
    : undefined;
  if (!decl) {
    return undefined;
  }
  return ts.isExportAssignment(decl) ? decl.expression : decl.initializer;
};

/**
 * Extracts every extension each entry declares. The walk follows only what it can prove: array
 * literals, spreads and named arrays, `.map()` over an array literal, and object literals whose
 * `type` resolves to a string. Everything else is reported rather than interpreted.
 */
export const extensionsCollector = (entries: Entry[]): Collector<ExtensionsResult> => {
  const records = new Map<string, { record: ExtensionRecord; entries: Set<string> }>();
  /** Keyed so the same finding, reached again from another entry or program, is reported once. */
  const diagnostics = new Map<string, Diagnostic>();
  /** Entries whose module a program owned, so one no program reached can be reported. */
  const walked = new Set<string>();

  const report = (diagnostic: Diagnostic): void => {
    const { loc } = diagnostic;
    diagnostics.set(
      `${diagnostic.code}\0${loc?.file ?? ''}\0${loc?.line ?? 0}\0${diagnostic.message}`,
      diagnostic,
    );
  };

  const pkgOf = (file: string, ctx: ProgramCtx, entry: Entry): string =>
    pkgForFile(file, ctx.ws) ?? pkgForFile(relFile(ctx.repoRoot, ctx.dir), ctx.ws) ?? entry.pkg;

  /**
   * The values of an array literal. An array written some other way is kept as the one value it
   * resolved to, so that a flag list the walk cannot read is reported instead of looking empty.
   */
  const valuesOfArray = (expr: ts.Expression | undefined, ctx: ProgramCtx): Value[] => {
    if (!expr) {
      return [];
    }
    const node = unwrapExpression(expr);
    return ts.isArrayLiteralExpression(node)
      ? node.elements.map((element) => resolveValue(element, ctx))
      : [resolveValue(node, ctx)];
  };

  const propertiesOf = (
    object: ts.ObjectLiteralExpression,
    ctx: ProgramCtx,
  ): Record<string, Value> => {
    const expr = namedProperty(object, 'properties');
    if (!expr) {
      return {};
    }
    const value = resolveValue(expr, ctx);
    // A `properties` that is not an object literal is kept under its own name, so that the
    // reason it could not be read is reported like any other unresolved value.
    return value.kind === 'object' ? value.props : { properties: value };
  };

  /** A value the map cannot render as itself: a dead end, or a code reference without an export. */
  const isOpaque = (value: Value): boolean =>
    value.kind === 'unresolved' || (value.kind === 'codeRef' && value.export === null);

  const reportOpaque = (name: string, value: Value, record: ExtensionRecord): void => {
    if (!isOpaque(value)) {
      return;
    }
    const where = value.kind === 'unresolved' ? value.loc : record.loc;
    const why =
      value.kind === 'unresolved'
        ? value.reason
        : 'the imported module is not re-exported as it is';
    report(
      makeDiagnostic(
        'unresolved-value',
        `Cannot resolve '${name}' of extension '${record.type}': ${why}.`,
        where,
        record.pkg,
      ),
    );
  };

  const record = (
    object: ts.ObjectLiteralExpression,
    type: string,
    ctx: ProgramCtx,
    entry: Entry,
    generated: Generated | undefined,
  ): void => {
    const key = declKey(object, ctx);
    const existing = records.get(key);
    if (existing) {
      existing.entries.add(entry.id);
      return;
    }
    const loc = locOf(object, ctx);
    const flagsExpr = namedProperty(object, 'flags');
    const flagsObject = flagsExpr ? unwrapExpression(flagsExpr) : undefined;
    const flagsLiteral =
      flagsObject && ts.isObjectLiteralExpression(flagsObject) ? flagsObject : undefined;
    const next: ExtensionRecord = {
      key,
      type,
      pkg: pkgOf(loc.file, ctx, entry),
      loc,
      entries: [],
      apps: [],
      flags: {
        required: valuesOfArray(
          flagsLiteral ? namedProperty(flagsLiteral, 'required') : undefined,
          ctx,
        ),
        disallowed: valuesOfArray(
          flagsLiteral ? namedProperty(flagsLiteral, 'disallowed') : undefined,
          ctx,
        ),
      },
      properties: propertiesOf(object, ctx),
      ...(generated
        ? {
            multiplicity: generated.multiplicity,
            ...(generated.mappedValues ? { mappedValues: generated.mappedValues } : {}),
          }
        : {}),
    };
    records.set(key, { record: next, entries: new Set([entry.id]) });
    Object.entries(next.properties).forEach(([name, value]) => reportOpaque(name, value, next));
    next.flags.required.forEach((value, index) =>
      reportOpaque(`flags.required[${index}]`, value, next),
    );
    next.flags.disallowed.forEach((value, index) =>
      reportOpaque(`flags.disallowed[${index}]`, value, next),
    );
  };

  const unresolvedElement = (expr: ts.Expression, ctx: ProgramCtx, entry: Entry): void => {
    const loc = locOf(expr, ctx);
    report(
      makeDiagnostic(
        'unresolved-element',
        `Cannot read '${ts.SyntaxKind[unwrapExpression(expr).kind]}' as an extension in ${
          entry.id
        }.`,
        loc,
        pkgOf(loc.file, ctx, entry),
      ),
    );
  };

  const addElement = (
    expr: ts.Expression,
    ctx: ProgramCtx,
    entry: Entry,
    seen: Set<string>,
    generated: Generated | undefined,
  ): void => {
    const node = unwrapExpression(expr);
    if (ts.isObjectLiteralExpression(node)) {
      const type = typeIdOf(node, ctx);
      if (type === undefined) {
        unresolvedElement(node, ctx, entry);
        return;
      }
      record(node, type, ctx, entry, generated);
      return;
    }
    const followed = followedInitializer(node, ctx);
    if (followed && !seen.has(followed.key)) {
      addElement(followed.node, ctx, entry, new Set([...seen, followed.key]), generated);
      return;
    }
    unresolvedElement(node, ctx, entry);
  };

  const addMapped = (
    call: MapCall,
    ctx: ProgramCtx,
    entry: Entry,
    seen: Set<string>,
    expr: ts.Expression,
  ): void => {
    const object = callbackObject(call.callback);
    if (!object) {
      unresolvedElement(expr, ctx, entry);
      return;
    }
    let source = unwrapExpression(call.source);
    let guard = seen;
    while (!ts.isArrayLiteralExpression(source)) {
      const followed = followedInitializer(source, ctx);
      if (!followed || guard.has(followed.key)) {
        break;
      }
      guard = new Set([...guard, followed.key]);
      source = unwrapExpression(followed.node);
    }
    if (!ts.isArrayLiteralExpression(source)) {
      const loc = locOf(call.source, ctx);
      report(
        makeDiagnostic(
          'multiplicity-unknown',
          `Cannot count the elements the mapped array of ${entry.id} produces.`,
          loc,
          pkgOf(loc.file, ctx, entry),
        ),
      );
      addElement(object, ctx, entry, seen, { multiplicity: 'unknown' });
      return;
    }
    addElement(object, ctx, entry, seen, {
      multiplicity: source.elements.length,
      mappedValues: source.elements.map((element) => resolveValue(element, ctx)),
    });
  };

  const walkArray = (
    expr: ts.Expression,
    ctx: ProgramCtx,
    entry: Entry,
    seen: Set<string>,
  ): void => {
    const node = unwrapExpression(expr);
    if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((element) => {
        if (ts.isSpreadElement(element)) {
          walkArray(element.expression, ctx, entry, seen);
        } else if (ts.isOmittedExpression(element)) {
          unresolvedElement(node, ctx, entry);
        } else {
          addElement(element, ctx, entry, seen, undefined);
        }
      });
      return;
    }
    const mapped = mapCallOf(node);
    if (mapped) {
      addMapped(mapped, ctx, entry, seen, node);
      return;
    }
    const followed = followedInitializer(node, ctx);
    if (followed && !seen.has(followed.key)) {
      walkArray(followed.node, ctx, entry, new Set([...seen, followed.key]));
      return;
    }
    unresolvedElement(node, ctx, entry);
  };

  return {
    visit: (ctx) => {
      const owned = new Map(
        ctx.ownedFiles.map((file) => [relFile(ctx.repoRoot, file.fileName), file]),
      );
      for (const entry of entries) {
        const file = owned.get(entry.file);
        if (!file) {
          continue;
        }
        walked.add(entry.id);
        const exported = defaultExport(file, ctx);
        if (!exported) {
          report(
            makeDiagnostic(
              'unresolved-element',
              `Entry ${entry.id} has no default export that resolves to an array.`,
              { file: entry.file, line: 1 },
              entry.pkg,
            ),
          );
          continue;
        }
        walkArray(exported, ctx, entry, new Set<string>());
      }
    },

    finish: () => {
      entries
        .filter((entry) => !walked.has(entry.id))
        .forEach((entry) =>
          report(
            makeDiagnostic(
              'unresolved-element',
              `No program owns the entry module of ${entry.id}, so its extensions are unknown.`,
              { file: entry.file, line: 1 },
              entry.pkg,
            ),
          ),
        );
      return {
        extensions: [...records.values()].map(({ record: found, entries: ids }) => ({
          ...found,
          entries: [...ids].toSorted(),
        })),
        diagnostics: [...diagnostics.values()],
      };
    },
  };
};
