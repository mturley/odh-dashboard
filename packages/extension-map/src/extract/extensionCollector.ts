import path from 'node:path';
import ts from 'typescript';
import { resolveValue } from './values';
import type { ExtensionsResult } from './extensions';
import type { Collector, ProgramCtx } from '../programs/stream';
import { declKey, extensionTypeIds, locOf, resolveAlias } from '../programs/identity';
import { pkgForFile, toRelPosix } from '../discovery/workspace';
import { makeDiagnostic } from '../model/diagnostics';
import type { Diagnostic, Entry, ExtensionRecord, Loc, Value } from '../model/types';

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

const sourcePath = (root: string, file: string): string => path.resolve(root, file);

const declarationExpression = (declaration: ts.Declaration): ts.Expression | undefined => {
  if (ts.isVariableDeclaration(declaration)) {
    return declaration.initializer;
  }
  if (ts.isExportAssignment(declaration)) {
    return declaration.expression;
  }
  return undefined;
};

const symbolOf = (
  expression: ts.Identifier | ts.PropertyAccessExpression,
  ctx: ProgramCtx,
): ts.Symbol | undefined =>
  ctx.checker.getSymbolAtLocation(ts.isIdentifier(expression) ? expression : expression.name);

const followIdentifier = (
  expression: ts.Expression,
  ctx: ProgramCtx,
  seen: Set<string>,
): ts.Expression | undefined => {
  const current = unwrapExpression(expression);
  if (!ts.isIdentifier(current) && !ts.isPropertyAccessExpression(current)) {
    return undefined;
  }
  const symbol = symbolOf(current, ctx);
  if (symbol === undefined) {
    return undefined;
  }
  const declaration = resolveAlias(ctx.checker, symbol).valueDeclaration;
  if (declaration === undefined) {
    return undefined;
  }
  const key = declKey(declaration, ctx);
  if (seen.has(key)) {
    return undefined;
  }
  seen.add(key);
  return declarationExpression(declaration);
};

const defaultExportExpression = (
  file: ts.SourceFile,
  ctx: ProgramCtx,
): ts.Expression | undefined => {
  const moduleSymbol = ctx.checker.getSymbolAtLocation(file);
  const defaultSymbol =
    moduleSymbol === undefined
      ? undefined
      : ctx.checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === 'default');
  if (defaultSymbol !== undefined) {
    const declaration =
      resolveAlias(ctx.checker, defaultSymbol).valueDeclaration ??
      resolveAlias(ctx.checker, defaultSymbol).declarations?.[0];
    if (declaration !== undefined) {
      return declarationExpression(declaration);
    }
  }
  for (const statement of file.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      return statement.expression;
    }
  }
  return undefined;
};

const propertyName = (name: ts.PropertyName): string => {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
};

const propertyExpression = (
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined => {
  const property = object.properties.find((candidate) =>
    ts.isPropertyAssignment(candidate) || ts.isShorthandPropertyAssignment(candidate)
      ? propertyName(candidate.name) === name
      : false,
  );
  if (property === undefined) {
    return undefined;
  }
  if (ts.isPropertyAssignment(property)) {
    return property.initializer;
  }
  return ts.isShorthandPropertyAssignment(property) ? property.name : undefined;
};

const objectFromExpression = (
  expression: ts.Expression,
  ctx: ProgramCtx,
): ts.ObjectLiteralExpression | undefined => {
  let current = unwrapExpression(expression);
  const seen = new Set<string>();
  while (!ts.isObjectLiteralExpression(current)) {
    const initializer = followIdentifier(current, ctx, seen);
    if (initializer === undefined) {
      return undefined;
    }
    current = unwrapExpression(initializer);
  }
  return current;
};

const stringValue = (value: Value): string | undefined => {
  if (
    (value.kind === 'literal' || value.kind === 'constant' || value.kind === 'enumMember') &&
    typeof value.value === 'string'
  ) {
    return value.value;
  }
  return undefined;
};

const reportUnresolvedValues = (
  name: string,
  value: Value,
  loc: ReturnType<typeof locOf>,
  ctx: ProgramCtx,
  diagnostics: Diagnostic[],
): void => {
  const issuesIn = (current: Value): { unresolved: boolean; unsupportedCodeRef: boolean } => {
    if (current.kind === 'unresolved') {
      return { unresolved: true, unsupportedCodeRef: false };
    }
    if (current.kind === 'codeRef') {
      return { unresolved: false, unsupportedCodeRef: current.export === null };
    }
    const children =
      current.kind === 'array'
        ? current.items.map(issuesIn)
        : current.kind === 'object'
        ? Object.values(current.props).map(issuesIn)
        : [];
    return {
      unresolved: children.some((issue) => issue.unresolved),
      unsupportedCodeRef: children.some((issue) => issue.unsupportedCodeRef),
    };
  };
  const issues = issuesIn(value);
  if (issues.unresolved || issues.unsupportedCodeRef) {
    diagnostics.push(
      makeDiagnostic(
        'unresolved-value',
        issues.unsupportedCodeRef
          ? `extension property '${name}' contains a CodeRef with an unsupported then callback`
          : `extension property '${name}' contains a value that could not be resolved`,
        loc,
        pkgForFile(loc.file, ctx.ws),
      ),
    );
  }
};

const extensionRecord = (
  object: ts.ObjectLiteralExpression,
  entry: Entry,
  ctx: ProgramCtx,
  diagnostics: Diagnostic[],
  multiplicity?: number | 'unknown',
  mappedValues?: Value[],
): ExtensionRecord | undefined => {
  const checkerType = ctx.checker.getTypeAtLocation(object);
  const ids = extensionTypeIds(checkerType, ctx.checker);
  const typeExpression = propertyExpression(object, 'type');
  const type =
    typeExpression === undefined ? undefined : stringValue(resolveValue(typeExpression, ctx));
  if (ids === undefined || ids.length !== 1 || type === undefined || ids[0] !== type) {
    return undefined;
  }
  const loc = locOf(object, ctx);
  const key = declKey(object, ctx);
  const propertiesExpression = propertyExpression(object, 'properties');
  const propertiesObject =
    propertiesExpression === undefined
      ? undefined
      : objectFromExpression(propertiesExpression, ctx);
  const properties: Record<string, Value> = {};
  if (propertiesObject === undefined) {
    const unresolvedValue: Value = {
      kind: 'unresolved',
      reason: 'extension properties are not an object literal',
      loc,
    };
    properties.properties = unresolvedValue;
    reportUnresolvedValues('properties', unresolvedValue, loc, ctx, diagnostics);
  } else {
    for (const property of propertiesObject.properties) {
      if (ts.isPropertyAssignment(property)) {
        const name = propertyName(property.name);
        const value = resolveValue(property.initializer, ctx);
        properties[name] = value;
        reportUnresolvedValues(name, value, locOf(property, ctx), ctx, diagnostics);
      } else if (ts.isShorthandPropertyAssignment(property)) {
        const name = property.name.text;
        const value = resolveValue(property.name, ctx);
        properties[name] = value;
        reportUnresolvedValues(name, value, locOf(property, ctx), ctx, diagnostics);
      }
    }
  }

  const flagsObject = propertyExpression(object, 'flags');
  const flagProperties =
    flagsObject === undefined ? undefined : objectFromExpression(flagsObject, ctx);
  const readFlags = (name: 'required' | 'disallowed'): Value[] => {
    const expression =
      flagProperties === undefined ? undefined : propertyExpression(flagProperties, name);
    if (expression === undefined) {
      return [];
    }
    const value = resolveValue(expression, ctx);
    const values = value.kind === 'array' ? value.items : [value];
    values.forEach((item) => reportUnresolvedValues(`flags.${name}`, item, loc, ctx, diagnostics));
    return values;
  };

  return {
    key,
    type,
    pkg: pkgForFile(loc.file, ctx.ws) ?? entry.pkg,
    loc,
    entries: [entry.id],
    apps: [],
    flags: { required: readFlags('required'), disallowed: readFlags('disallowed') },
    properties,
    ...(multiplicity === undefined ? {} : { multiplicity }),
    ...(mappedValues === undefined ? {} : { mappedValues }),
  };
};

const arrayForMap = (
  expression: ts.Expression,
  ctx: ProgramCtx,
): ts.ArrayLiteralExpression | undefined => {
  let current = unwrapExpression(expression);
  const seen = new Set<string>();
  while (!ts.isArrayLiteralExpression(current)) {
    const initializer = followIdentifier(current, ctx, seen);
    if (initializer === undefined) {
      return undefined;
    }
    current = unwrapExpression(initializer);
  }
  return current;
};

const mapElement = (
  call: ts.CallExpression,
  entry: Entry,
  ctx: ProgramCtx,
  diagnostics: Diagnostic[],
): ExtensionRecord | undefined => {
  if (
    !ts.isPropertyAccessExpression(call.expression) ||
    call.expression.name.text !== 'map' ||
    call.arguments.length < 1
  ) {
    return undefined;
  }
  const source = arrayForMap(call.expression.expression, ctx);
  const mappedValues =
    source?.elements.map((element) =>
      ts.isSpreadElement(element)
        ? resolveValue(element.expression, ctx)
        : resolveValue(element, ctx),
    ) ?? [];
  const canCount =
    source !== undefined && mappedValues.every((value) => value.kind !== 'unresolved');
  const multiplicity: number | 'unknown' = canCount ? mappedValues.length : 'unknown';
  const callback = unwrapExpression(call.arguments[0]);
  const callbackBody =
    ts.isArrowFunction(callback) && !ts.isBlock(callback.body)
      ? unwrapExpression(callback.body)
      : undefined;
  const object =
    callbackBody !== undefined && ts.isObjectLiteralExpression(callbackBody)
      ? callbackBody
      : undefined;
  if (object === undefined) {
    diagnostics.push(
      makeDiagnostic(
        'unresolved-element',
        'map callback does not produce a statically recognizable extension object',
        locOf(call, ctx),
        pkgForFile(locOf(call, ctx).file, ctx.ws),
      ),
    );
    return undefined;
  }
  const record = extensionRecord(object, entry, ctx, diagnostics, multiplicity, mappedValues);
  if (record === undefined) {
    diagnostics.push(
      makeDiagnostic(
        'unresolved-element',
        'map callback object is not checker-proven to be an extension value',
        locOf(object, ctx),
        pkgForFile(locOf(object, ctx).file, ctx.ws),
      ),
    );
    return undefined;
  }
  if (multiplicity === 'unknown') {
    diagnostics.push(
      makeDiagnostic(
        'multiplicity-unknown',
        `extension '${record.type}' is generated from a non-literal or unresolved source array`,
        record.loc,
        record.pkg,
      ),
    );
  }
  return record;
};

type ForwardingFailure = { message: string; loc: Loc };
type ForwardingResult = { targetEntryIds: string[] } | { failure: ForwardingFailure };

const isWithinDirectory = (directory: string, file: string): boolean => {
  const relative = path.relative(directory, file);
  return (
    relative === '' ||
    (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
  );
};

/** Follows only explicit, static `export { default } from '…'` data. */
const forwardedEntryIds = (
  entry: Entry,
  ctx: ProgramCtx,
  entriesByFile: Map<string, Entry[]>,
): ForwardingResult => {
  let currentFile = sourcePath(ctx.repoRoot, entry.file);
  const seen = new Set<string>();
  while (!seen.has(currentFile)) {
    seen.add(currentFile);
    const source = ts.sys.readFile(currentFile);
    if (source === undefined) {
      return {
        failure: {
          message: `entry '${entry.id}' default re-export source could not be read`,
          loc: { file: toRelPosix(ctx.repoRoot, currentFile), line: 1 },
        },
      };
    }
    const sourceFile = ts.createSourceFile(
      currentFile,
      source,
      ctx.program.getCompilerOptions().target ?? ts.ScriptTarget.Latest,
      true,
    );
    const forwarding = sourceFile.statements.find(
      (statement): statement is ts.ExportDeclaration =>
        ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier !== undefined &&
        ts.isStringLiteralLike(statement.moduleSpecifier) &&
        statement.exportClause !== undefined &&
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.some(
          (element) =>
            element.name.text === 'default' &&
            (element.propertyName === undefined || element.propertyName.text === 'default'),
        ),
    );
    const specifier = forwarding?.moduleSpecifier;
    if (forwarding === undefined || specifier === undefined || !ts.isStringLiteralLike(specifier)) {
      const loc: Loc = {
        file: toRelPosix(ctx.repoRoot, currentFile),
        line:
          sourceFile.statements.length === 0
            ? 1
            : sourceFile.getLineAndCharacterOfPosition(sourceFile.statements[0].getStart()).line +
              1,
      };
      return {
        failure: {
          message: `entry '${entry.id}' is not a supported static default re-export`,
          loc,
        },
      };
    }
    const nextFile = ts.resolveModuleName(
      specifier.text,
      currentFile,
      ctx.program.getCompilerOptions(),
      ts.sys,
    ).resolvedModule?.resolvedFileName;
    if (nextFile === undefined) {
      return {
        failure: {
          message: `entry '${entry.id}' default re-export module could not be resolved`,
          loc: {
            file: toRelPosix(ctx.repoRoot, currentFile),
            line: sourceFile.getLineAndCharacterOfPosition(forwarding.getStart()).line + 1,
          },
        },
      };
    }
    currentFile = path.resolve(nextFile);
    if (seen.has(currentFile)) {
      return {
        failure: {
          message: `entry '${entry.id}' contains a cyclic default re-export`,
          loc: {
            file: toRelPosix(ctx.repoRoot, sourceFile.fileName),
            line: sourceFile.getLineAndCharacterOfPosition(forwarding.getStart()).line + 1,
          },
        },
      };
    }
    const targets = entriesByFile
      .get(currentFile)
      ?.filter((candidate) => candidate.id !== entry.id);
    if (targets !== undefined && targets.length > 0) {
      return { targetEntryIds: targets.map((target) => target.id) };
    }
  }
  return {
    failure: {
      message: `entry '${entry.id}' contains a cyclic default re-export`,
      loc: { file: entry.file, line: 1 },
    },
  };
};

const extensionsCollectorVisit = (
  entry: Entry,
  file: ts.SourceFile,
  ctx: ProgramCtx,
  diagnostics: Diagnostic[],
): ExtensionRecord[] => {
  const defaultExpression = defaultExportExpression(file, ctx);
  if (defaultExpression === undefined) {
    return [];
  }
  const found: ExtensionRecord[] = [];
  const unresolvedElement = (node: ts.Node, message: string): void => {
    const loc = locOf(node, ctx);
    diagnostics.push(
      makeDiagnostic('unresolved-element', message, loc, pkgForFile(loc.file, ctx.ws)),
    );
  };
  const visitElement = (expression: ts.Expression, seen = new Set<string>()): void => {
    const current = unwrapExpression(expression);
    if (ts.isIdentifier(current)) {
      const initializer = followIdentifier(current, ctx, seen);
      if (initializer === undefined) {
        unresolvedElement(
          current,
          'array identifier does not resolve to a declaration initializer',
        );
      } else {
        visitElement(initializer, seen);
      }
    } else if (ts.isArrayLiteralExpression(current)) {
      visitArrayExpression(current, new Set());
    } else if (ts.isCallExpression(current)) {
      const isMap =
        ts.isPropertyAccessExpression(current.expression) && current.expression.name.text === 'map';
      const record = isMap ? mapElement(current, entry, ctx, diagnostics) : undefined;
      if (record !== undefined) {
        found.push(record);
      } else if (!isMap) {
        unresolvedElement(current, 'array element is not a supported extension value');
      }
    } else if (ts.isObjectLiteralExpression(current)) {
      const record = extensionRecord(current, entry, ctx, diagnostics);
      if (record === undefined) {
        unresolvedElement(current, 'object element is not checker-proven to be an extension value');
      } else {
        found.push(record);
      }
    } else {
      unresolvedElement(current, 'array element is not a supported extension value');
    }
  };
  const visitArrayExpression = (expression: ts.Expression, seen: Set<string>): void => {
    const current = unwrapExpression(expression);
    if (ts.isArrayLiteralExpression(current)) {
      for (const element of current.elements) {
        if (ts.isSpreadElement(element)) {
          const spread = unwrapExpression(element.expression);
          if (ts.isCallExpression(spread)) {
            const isMap =
              ts.isPropertyAccessExpression(spread.expression) &&
              spread.expression.name.text === 'map';
            const record = isMap ? mapElement(spread, entry, ctx, diagnostics) : undefined;
            if (record !== undefined) {
              found.push(record);
            } else if (!isMap) {
              unresolvedElement(element, 'array spread is not a supported map or identifier array');
            }
          } else {
            const spreadSeen = new Set(seen);
            const initializer = ts.isIdentifier(spread)
              ? followIdentifier(spread, ctx, spreadSeen)
              : undefined;
            if (initializer === undefined) {
              unresolvedElement(element, 'array spread does not resolve to an identifier array');
            } else {
              visitArrayExpression(initializer, spreadSeen);
            }
          }
        } else {
          visitElement(element);
        }
      }
      return;
    }
    if (ts.isCallExpression(current)) {
      const isMap =
        ts.isPropertyAccessExpression(current.expression) && current.expression.name.text === 'map';
      const record = isMap ? mapElement(current, entry, ctx, diagnostics) : undefined;
      if (record !== undefined) {
        found.push(record);
      } else if (!isMap) {
        unresolvedElement(current, 'entry default export does not resolve to an array');
      }
      return;
    }
    const initializer = followIdentifier(current, ctx, seen);
    if (initializer !== undefined) {
      visitArrayExpression(initializer, seen);
      return;
    }
    unresolvedElement(current, 'entry default export does not resolve to an array');
  };
  visitArrayExpression(defaultExpression, new Set());
  return found;
};

/** Collects extension arrays and values in the program owning each entry. */
export const extensionsCollector = (entries: Entry[]): Collector<ExtensionsResult> => {
  const records = new Map<string, ExtensionRecord>();
  const diagnostics: Diagnostic[] = [];
  const ownedEntryIds = new Set<string>();
  const processedForwardingEntries = new Set<string>();
  const forwardedByEntry = new Map<string, Set<string>>();

  const addAliasesToRecord = (record: ExtensionRecord): void => {
    for (const entryId of record.entries) {
      for (const aliasId of forwardedByEntry.get(entryId) ?? []) {
        if (!record.entries.includes(aliasId)) {
          record.entries.push(aliasId);
        }
      }
    }
  };

  const addRecord = (record: ExtensionRecord): void => {
    addAliasesToRecord(record);
    const existing = records.get(record.key);
    if (existing === undefined) {
      records.set(record.key, record);
    } else {
      for (const entryId of record.entries) {
        if (!existing.entries.includes(entryId)) {
          existing.entries.push(entryId);
        }
      }
    }
  };

  const associateAlias = (targetEntryId: string, aliasEntryId: string): void => {
    const aliases = forwardedByEntry.get(targetEntryId) ?? new Set<string>();
    aliases.add(aliasEntryId);
    forwardedByEntry.set(targetEntryId, aliases);
    for (const record of records.values()) {
      if (record.entries.includes(targetEntryId) && !record.entries.includes(aliasEntryId)) {
        record.entries.push(aliasEntryId);
      }
    }
  };

  const visit = (ctx: ProgramCtx): void => {
    const entriesByFile = new Map<string, Entry[]>();
    for (const entry of entries) {
      const file = sourcePath(ctx.repoRoot, entry.file);
      entriesByFile.set(file, [...(entriesByFile.get(file) ?? []), entry]);
    }
    for (const file of ctx.ownedFiles) {
      const matchingEntries = entriesByFile.get(path.resolve(file.fileName)) ?? [];
      for (const entry of matchingEntries) {
        ownedEntryIds.add(entry.id);
        for (const record of extensionsCollectorVisit(entry, file, ctx, diagnostics)) {
          addRecord(record);
        }
      }
    }
    for (const entry of entries) {
      if (ownedEntryIds.has(entry.id) || processedForwardingEntries.has(entry.id)) {
        continue;
      }
      const entryFile = sourcePath(ctx.repoRoot, entry.file);
      if (!isWithinDirectory(ctx.dir, entryFile)) {
        continue;
      }
      processedForwardingEntries.add(entry.id);
      const forwarding = forwardedEntryIds(entry, ctx, entriesByFile);
      if ('failure' in forwarding) {
        const { loc, message } = forwarding.failure;
        diagnostics.push(
          makeDiagnostic('unresolved-element', message, loc, pkgForFile(loc.file, ctx.ws)),
        );
      } else {
        for (const targetId of forwarding.targetEntryIds) {
          associateAlias(targetId, entry.id);
        }
      }
    }
  };

  return {
    visit,
    finish: () => {
      const uniqueDiagnostics = new Map<string, Diagnostic>();
      for (const diagnostic of diagnostics) {
        const loc =
          diagnostic.loc === undefined ? '' : `${diagnostic.loc.file}:${diagnostic.loc.line}`;
        uniqueDiagnostics.set(
          `${diagnostic.code}:${loc}:${diagnostic.message}:${diagnostic.pkg ?? ''}`,
          diagnostic,
        );
      }
      return { extensions: [...records.values()], diagnostics: [...uniqueDiagnostics.values()] };
    },
  };
};
