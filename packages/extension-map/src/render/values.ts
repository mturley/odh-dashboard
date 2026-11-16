import path from 'path';
import { relLink } from './links';
import type { ExtensionRecord, Loc, SymbolRef, Value } from '../model/types';

export type CellCtx = {
  docPath: string;
  /** The record whose property is being rendered: `mapped` values live on it. */
  record: ExtensionRecord;
  /** What to call an anonymous function: the property it is assigned to. */
  label: string;
};

/** One property of a record, or `undefined` when it does not set that property. */
export const propertyOf = (record: ExtensionRecord, key: string): Value | undefined =>
  Object.hasOwn(record.properties, key) ? record.properties[key] : undefined;

const literalText = (value: string | number | boolean | null): string =>
  typeof value === 'string' ? `'${value}'` : String(value);

const readableName = (value: Value): string | undefined => {
  if (value.kind === 'enumMember') {
    return `${value.enumName}.${value.member}`;
  }
  return value.kind === 'constant' ? value.name : undefined;
};

/** One-line text for a value nested inside another value: no links, no code fences. */
export const valueText = (value: Value): string => {
  switch (value.kind) {
    case 'literal':
      return literalText(value.value);
    case 'enumMember':
    case 'constant':
      return `${readableName(value) ?? ''} (${literalText(value.value)})`;
    case 'array':
      return `[${value.items.map(valueText).join(', ')}]`;
    case 'object':
      return `{ ${Object.entries(value.props)
        .map(([key, prop]) => `${key}: ${valueText(prop)}`)
        .join(', ')} }`;
    case 'codeRef':
      return `${value.module}#${value.export ?? '?'}`;
    case 'function':
      return value.name ?? 'function';
    case 'reference':
      return `${value.name} (code)`;
    case 'mapped':
      return 'one per mapped element';
    default:
      return 'not resolved';
  }
};

export const moduleBasename = (module: string): string =>
  path.posix.basename(module).replace(/\.[^.]+$/, '');

/** The name of the thing a code reference points at, when it names one. */
export const codeRefName = (value: Extract<Value, { kind: 'codeRef' }>): string =>
  value.export === null || value.export === 'default' ? moduleBasename(value.module) : value.export;

/**
 * The CodeRef target cell. When the target is known in this repo: a link named after the file
 * that declares the export, followed by the module the code imports when that module only
 * re-exports it. Otherwise plain `module#export` text.
 */
export const codeRefCell = (
  value: Extract<Value, { kind: 'codeRef' }>,
  docPath: string,
): string => {
  const exported = value.export ?? '?';
  if (value.external) {
    return `\`${value.module}#${exported}\` (external)`;
  }
  if (value.export === null || !value.target) {
    return `\`${moduleBasename(value.module)}#${exported}\``;
  }
  const link = relLink(docPath, value.target, `${moduleBasename(value.target.file)}#${exported}`);
  return value.target.file === value.module
    ? link
    : `${link} (via \`${moduleBasename(value.module)}\`)`;
};

/** A value as one table cell: code-formatted, with links to code the value points at. */
export const valueCell = (value: Value, ctx: CellCtx): string => {
  switch (value.kind) {
    case 'literal':
      return `\`${literalText(value.value)}\``;
    case 'enumMember':
    case 'constant':
      return `\`${readableName(value) ?? ''}\` (\`${literalText(value.value)}\`)`;
    case 'array':
      return value.items.length === 0
        ? '(empty)'
        : value.items.map((item) => valueCell(item, ctx)).join(', ');
    case 'object':
      return `\`${valueText(value)}\``;
    case 'function':
      return `\`function\` (${relLink(ctx.docPath, value.loc, value.name ?? ctx.label)})`;
    case 'reference':
      return `${relLink(ctx.docPath, value.loc, value.name)} (code)`;
    case 'mapped':
      return (ctx.record.mappedValues ?? []).length === 0
        ? 'one per mapped element'
        : (ctx.record.mappedValues ?? []).map((item) => valueCell(item, ctx)).join(' · ');
    case 'codeRef':
      return codeRefCell(value, ctx.docPath);
    default:
      return relLink(ctx.docPath, value.loc, 'not resolved');
  }
};

/** One supplied property of a code reference's target. */
export const suppliedCell = (supplied: Value | SymbolRef, ctx: CellCtx): string =>
  supplied.kind === 'symbol'
    ? relLink(ctx.docPath, supplied.loc, supplied.name)
    : valueCell(supplied, ctx);

/** A feature flag: its readable name, with the value when the two differ. */
export const flagCell = (values: Value[], ctx: CellCtx): string => {
  if (values.length === 0) {
    return '—';
  }
  return values
    .map((value) => {
      // A flag written as a bare string literal is already its own readable name.
      if (value.kind === 'literal') {
        return `\`${value.value === null ? 'null' : String(value.value)}\``;
      }
      if (value.kind !== 'enumMember' && value.kind !== 'constant') {
        return valueCell(value, ctx);
      }
      const name = readableName(value) ?? '';
      const same = typeof value.value === 'string' && name.endsWith(value.value);
      return same ? `\`${name}\`` : `\`${name}\` (\`${literalText(value.value)}\`)`;
    })
    .join(', ');
};

export type NotResolved = { property: string; reason: string; loc: Loc };

const collectNotResolved = (
  value: Value,
  property: string,
  record: ExtensionRecord,
  out: NotResolved[],
): void => {
  switch (value.kind) {
    case 'unresolved':
      out.push({ property, reason: value.reason, loc: value.loc });
      break;
    case 'codeRef':
      if (value.export === null) {
        out.push({
          property,
          reason: 'the code reference resolves to no export',
          loc: value.target ?? record.loc,
        });
      }
      Object.entries(value.supplies ?? {}).forEach(([key, supplied]) => {
        if (supplied.kind !== 'symbol') {
          collectNotResolved(supplied, `${property} → ${key}`, record, out);
        }
      });
      break;
    case 'array':
      value.items.forEach((item, index) =>
        collectNotResolved(item, `${property}[${index}]`, record, out),
      );
      break;
    case 'object':
      Object.entries(value.props).forEach(([key, prop]) =>
        collectNotResolved(prop, `${property}.${key}`, record, out),
      );
      break;
    default:
      break;
  }
};

/** Everything about one contribution the analysis could not resolve, in property order. */
export const notResolvedOf = (record: ExtensionRecord): NotResolved[] => {
  const out: NotResolved[] = [];
  Object.entries(record.properties).forEach(([key, value]) =>
    collectNotResolved(value, key, record, out),
  );
  record.flags.required.forEach((value, index) =>
    collectNotResolved(value, `flags.required[${index}]`, record, out),
  );
  record.flags.disallowed.forEach((value, index) =>
    collectNotResolved(value, `flags.disallowed[${index}]`, record, out),
  );
  (record.mappedValues ?? []).forEach((value, index) =>
    collectNotResolved(value, `mapped[${index}]`, record, out),
  );
  return out;
};
