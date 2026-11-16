import ts from 'typescript';
import { arrayLiteralFor, arrowBodyExpression, resolveValue } from './values';
import { pkgForFile, relFile } from '../discovery/workspace';
import { makeDiagnostic } from '../model/diagnostics';
import type { Diagnostic, Entry, ExtensionRecord, Value } from '../model/types';
import {
  constBindingName,
  constInitializer,
  declKey,
  locOf,
  resolveAlias,
  unwrapExpression,
} from '../programs/identity';
import type { Collector, ProgramCtx } from '../programs/stream';

export type ExtensionsResult = {
  extensions: ExtensionRecord[];
  /**
   * Per `Entry.id`, the `ExtensionRecord.key` of each extension the entry's array registers, in
   * array order (a record registered twice appears twice). Not part of the model: app
   * composition needs it to put an app's catalog in order.
   */
  order: Record<string, string[]>;
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

/** One member of a resolved object, where index access alone would not admit a missing key. */
const propAt = (props: Readonly<Record<string, Value>>, name: string): Value | undefined =>
  Object.hasOwn(props, name) ? props[name] : undefined;

/**
 * The extension point id a resolved `type` names. A constant or enum member counts: its value is
 * proven, not guessed. The property may have arrived through an object spread.
 */
const typeIdOf = (props: Record<string, Value>): string | undefined => {
  const value = propAt(props, 'type');
  const id =
    value?.kind === 'literal' || value?.kind === 'constant' || value?.kind === 'enumMember'
      ? value.value
      : undefined;
  return typeof id === 'string' ? id : undefined;
};

/**
 * The initializer a reference names, so an element or array written once can be reached by name.
 * Only a `const` that is not mutated in place is followed, so a reported value is the real one.
 */
const followedInitializer = (
  expr: ts.Expression,
  ctx: ProgramCtx,
): { node: ts.Expression; key: string } | undefined => {
  if (!ts.isIdentifier(expr) && !ts.isPropertyAccessExpression(expr)) {
    return undefined;
  }
  const raw = ctx.checker.getSymbolAtLocation(expr);
  const symbol = raw ? resolveAlias(ctx.checker, raw) : undefined;
  const followed = constInitializer(symbol, ctx.checker);
  return followed ? { node: followed.initializer, key: declKey(followed.decl, ctx) } : undefined;
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
  /** Record keys per entry, in the order the entry's array registers them. */
  const order = new Map<string, string[]>();

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
   * One flag list. A list written as something other than an array literal is kept as the one
   * value it resolved to, so that a list the walk cannot read is reported instead of looking empty.
   */
  const flagList = (value: Value | undefined): Value[] => {
    if (value === undefined) {
      return [];
    }
    return value.kind === 'array' ? value.items : [value];
  };

  /** The `properties` of an extension, as a map of resolved values. */
  const propertiesOf = (props: Record<string, Value>): Record<string, Value> => {
    const value = propAt(props, 'properties');
    if (value === undefined) {
      return {};
    }
    // A `properties` that is not an object is kept under its own name, so that the reason it
    // could not be read is reported like any other unresolved value.
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
    props: Record<string, Value>,
    ctx: ProgramCtx,
    entry: Entry,
    generated: Generated | undefined,
  ): void => {
    const key = declKey(object, ctx);
    const sequence = order.get(entry.id);
    if (sequence) {
      sequence.push(key);
    } else {
      order.set(entry.id, [key]);
    }
    const existing = records.get(key);
    if (existing) {
      existing.entries.add(entry.id);
      return;
    }
    const loc = locOf(object, ctx);
    const binding = constBindingName(object);
    const flags = propAt(props, 'flags');
    const flagsProps = flags?.kind === 'object' ? flags.props : {};
    const next: ExtensionRecord = {
      key,
      type,
      pkg: pkgOf(loc.file, ctx, entry),
      loc,
      ...(binding === undefined ? {} : { binding }),
      entries: [],
      apps: [],
      flags: {
        required: flagList(propAt(flagsProps, 'required')),
        disallowed: flagList(propAt(flagsProps, 'disallowed')),
      },
      properties: propertiesOf(props),
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
    if (flags !== undefined && flags.kind !== 'object') {
      reportOpaque('flags', flags, next);
    }
  };

  const unresolvedElement = (
    expr: ts.Expression,
    ctx: ProgramCtx,
    entry: Entry,
    why?: string,
  ): void => {
    const loc = locOf(expr, ctx);
    const node = unwrapExpression(expr);
    report(
      makeDiagnostic(
        'unresolved-element',
        `Cannot read '${ts.SyntaxKind[node.kind]}' as an extension${why ? `: ${why}` : ''}.`,
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
      const value = resolveValue(node, ctx);
      if (value.kind !== 'object') {
        unresolvedElement(node, ctx, entry, value.kind === 'unresolved' ? value.reason : undefined);
        return;
      }
      const type = typeIdOf(value.props);
      if (type === undefined) {
        unresolvedElement(node, ctx, entry, "no 'type' that resolves to a string");
        return;
      }
      record(node, type, value.props, ctx, entry, generated);
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
    const source = arrayLiteralFor(call.source, ctx);
    if (!source) {
      const loc = locOf(call.source, ctx);
      report(
        makeDiagnostic(
          'multiplicity-unknown',
          'Cannot count the elements this mapped array produces.',
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
        order: Object.fromEntries(order),
        diagnostics: [...diagnostics.values()],
      };
    },
  };
};
