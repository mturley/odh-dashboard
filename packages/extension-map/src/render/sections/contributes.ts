import path from 'path';
import {
  contributesHeading,
  fileLink,
  pathLink,
  pkgDisplayName,
  pointLink,
  relLink,
} from '../links';
import { defList, githubAnchor, joinBlocks, oneLine, table } from '../markdown';
import { flowchart, mermaidId } from '../mermaid';
import type { EdgeStyle } from '../mermaid';
import type {
  Entry,
  ExtensionMapModel,
  ExtensionPoint,
  ExtensionRecord,
  Loc,
  Pkg,
  SymbolRef,
  Value,
} from '../../model/types';

/** Extensions of one point from one package collapse into a single node at this count. */
const COLLAPSE_AT = 5;

/** Above this many columns a contribution is rendered as a definition list (spec §5.10). */
const MAX_COLUMNS = 7;

/** Properties that tend to name a contribution, most identifying first. */
const IDENTITY_KEYS = ['id', 'title', 'name', 'path', 'label', 'key'];

const REQUIRES = 'Requires';
const DISALLOWS = 'Disallows';
const CODEREF = 'CodeRef target';
const SOURCE = 'Source';

type CellCtx = {
  docPath: string;
  /** The record whose property is being rendered: `mapped` values live on it. */
  record: ExtensionRecord;
  /** What to call an anonymous function: the property it is assigned to. */
  label: string;
};

type NotResolved = { property: string; reason: string; loc: Loc };

/** One property of a record, or `undefined` when it does not set that property. */
const propertyOf = (record: ExtensionRecord, key: string): Value | undefined =>
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
const valueText = (value: Value): string => {
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
    case 'mapped':
      return 'one per mapped element';
    default:
      return 'not resolved';
  }
};

const moduleBasename = (module: string): string =>
  path.posix.basename(module).replace(/\.[^.]+$/, '');

/** The CodeRef target cell: a link when the target is known in this repo, plain text otherwise. */
const codeRefCell = (value: Extract<Value, { kind: 'codeRef' }>, docPath: string): string => {
  const exported = value.export ?? '?';
  if (value.external) {
    return `\`${value.module}#${exported}\` (external)`;
  }
  const label = `${moduleBasename(value.module)}#${exported}`;
  if (value.export === null || !value.target) {
    return `\`${label}\``;
  }
  return relLink(docPath, value.target, label);
};

/** A value as one table cell: code-formatted, with links to code the value points at. */
const valueCell = (value: Value, ctx: CellCtx): string => {
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

/** A feature flag: its readable name, with the value when the two differ. */
const flagCell = (values: Value[], ctx: CellCtx): string => {
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

/** The name of the thing a code reference points at, when it has one. */
const codeRefName = (value: Extract<Value, { kind: 'codeRef' }>): string =>
  value.export === null || value.export === 'default' ? moduleBasename(value.module) : value.export;

/**
 * What to call one contribution: the first identifying literal it sets, else what its first code
 * reference points at, else its line.
 */
const identityOf = (record: ExtensionRecord): string => {
  for (const key of IDENTITY_KEYS) {
    const value = propertyOf(record, key);
    if (value?.kind === 'literal' || value?.kind === 'constant' || value?.kind === 'enumMember') {
      return String(value.value);
    }
  }
  for (const key of Object.keys(record.properties).toSorted()) {
    const value = propertyOf(record, key);
    if (value?.kind === 'codeRef') {
      return codeRefName(value);
    }
  }
  return `line ${record.loc.line}`;
};

const shorten = (s: string, max = 44): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

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

const notResolvedOf = (record: ExtensionRecord): NotResolved[] => {
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

/** Every value except a code reference belongs in a property column; those get their own. */
const isDataValue = (value: Value): boolean => value.kind !== 'codeRef';

/** The property columns of one point's table: declared order first, then anything extra. */
const dataColumns = (records: ExtensionRecord[], point: ExtensionPoint | undefined): string[] => {
  const used = new Set<string>();
  records.forEach((record) =>
    Object.entries(record.properties).forEach(([key, value]) => {
      if (isDataValue(value)) {
        used.add(key);
      }
    }),
  );
  const declared = (point?.properties ?? []).map((property) => property.name);
  const ordered = declared.filter((name) => used.has(name));
  const extra = [...used].filter((name) => !declared.includes(name)).toSorted();
  return [...ordered, ...extra];
};

const codeRefColumns = (records: ExtensionRecord[]): string[] => {
  const keys = new Set<string>();
  records.forEach((record) =>
    Object.entries(record.properties).forEach(([key, value]) => {
      if (value.kind === 'codeRef') {
        keys.add(key);
      }
    }),
  );
  return [...keys].toSorted();
};

const codeRefTargetCell = (record: ExtensionRecord, keys: string[], docPath: string): string => {
  const parts = keys.flatMap((key) => {
    const value = propertyOf(record, key);
    if (value?.kind !== 'codeRef') {
      return [];
    }
    const cell = codeRefCell(value, docPath);
    return [keys.length === 1 ? cell : `\`${key}\`: ${cell}`];
  });
  return parts.length === 0 ? '—' : parts.join('<br>');
};

const suppliesRows = (records: ExtensionRecord[], keys: string[], docPath: string): string[][] =>
  records.flatMap((record) =>
    keys.flatMap((key) => {
      const value = propertyOf(record, key);
      if (value?.kind !== 'codeRef' || !value.supplies) {
        return [];
      }
      const ctx: CellCtx = { docPath, record, label: key };
      return Object.entries(value.supplies)
        .toSorted(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, supplied]: [string, Value | SymbolRef]) => [
          identityOf(record),
          keys.length === 1 ? name : `${key} → ${name}`,
          supplied.kind === 'symbol'
            ? relLink(docPath, supplied.loc, supplied.name)
            : valueCell(supplied, ctx),
        ]);
    }),
  );

/** One point's contributions: a table (or definition lists), supplies and what is unresolved. */
const renderPointTable = (
  records: ExtensionRecord[],
  point: ExtensionPoint | undefined,
  model: ExtensionMapModel,
  docPath: string,
): string => {
  const dataKeys = dataColumns(records, point);
  const refKeys = codeRefColumns(records);
  const hasRequires = records.some((record) => record.flags.required.length > 0);
  const hasDisallows = records.some((record) => record.flags.disallowed.length > 0);
  const headers = [
    ...dataKeys,
    ...(hasRequires ? [REQUIRES] : []),
    ...(hasDisallows ? [DISALLOWS] : []),
    ...(refKeys.length > 0 ? [CODEREF] : []),
    SOURCE,
  ];

  const cellsOf = (record: ExtensionRecord): [string, string][] => {
    const entries: [string, string][] = dataKeys.map((key) => {
      const value = propertyOf(record, key);
      return [
        key,
        value === undefined || !isDataValue(value)
          ? '—'
          : valueCell(value, { docPath, record, label: key }),
      ];
    });
    const ctx: CellCtx = { docPath, record, label: 'flags' };
    if (hasRequires) {
      entries.push([REQUIRES, flagCell(record.flags.required, ctx)]);
    }
    if (hasDisallows) {
      entries.push([DISALLOWS, flagCell(record.flags.disallowed, ctx)]);
    }
    if (refKeys.length > 0) {
      entries.push([CODEREF, codeRefTargetCell(record, refKeys, docPath)]);
    }
    entries.push([SOURCE, relLink(docPath, record.loc, path.posix.basename(record.loc.file))]);
    return entries;
  };

  const body =
    headers.length > MAX_COLUMNS
      ? records
          .map((record) => defList([['Contribution', identityOf(record)], ...cellsOf(record)]))
          .join('\n\n')
      : table(
          headers,
          records.map((record) => cellsOf(record).map(([, cell]) => cell)),
        );

  const supplies = suppliesRows(records, refKeys, docPath);
  const unresolved = records.flatMap((record) =>
    notResolvedOf(record).map((item) => [
      identityOf(record),
      item.property,
      item.reason,
      pathLink(docPath, item.loc),
    ]),
  );
  return joinBlocks([
    point === undefined
      ? '> This extension type matches no extension point declared in this repository.'
      : `Defined in ${pointLink(docPath, point, model)}.`,
    body,
    supplies.length === 0
      ? undefined
      : joinBlocks([
          '**Supplies** (what each CodeRef target provides):',
          table(['Contribution', 'Supplies', 'Value'], supplies),
        ]),
    unresolved.length === 0
      ? undefined
      : joinBlocks([
          '**Not resolved** (never drawn in a diagram):',
          table(['Contribution', 'Property', 'Reason', 'Source'], unresolved),
        ]),
  ]);
};

const namespaceOf = (type: string): string => {
  const dot = type.indexOf('.');
  return dot === -1 ? type : type.slice(0, dot);
};

const groupBy = <T>(items: T[], key: (item: T) => string): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const group = groups.get(key(item));
    if (group) {
      group.push(item);
    } else {
      groups.set(key(item), [item]);
    }
  });
  return groups;
};

/** The one diagram of a namespace, plus the node table that carries its links. */
const renderNamespaceDiagram = (
  ns: string,
  byType: Map<string, ExtensionRecord[]>,
  model: ExtensionMapModel,
  pkg: Pkg,
  docPath: string,
  entriesById: Map<string, Entry>,
): string | undefined => {
  const chart = flowchart('LR');
  const rows: string[][] = [];
  const pkgNode = mermaidId(pkg.name);
  const drawn = [...byType.entries()].filter(([type]) =>
    model.points.some((point) => point.id === type),
  );
  if (drawn.length === 0) {
    return undefined;
  }
  chart.node(pkgNode, pkgDisplayName(pkg), 'box', 'pkg');
  rows.push([pkgDisplayName(pkg), 'this package', fileLink(docPath, pkg.dir, pkg.dir)]);

  // One edge per loading path the extension actually travels: an extension exported both
  // statically and through a remote reaches the host both ways.
  const stylesOf = (record: ExtensionRecord): EdgeStyle[] => {
    const styles = new Set<EdgeStyle>(
      record.entries.map((id) =>
        entriesById.get(id)?.path === 'federated' ? 'federated' : 'solid',
      ),
    );
    return styles.size === 0 ? ['solid'] : [...styles].toSorted();
  };

  const pointNodes: [string, string, string][] = [];
  drawn.forEach(([type, records]) => {
    const pointNode = mermaidId(type);
    const pointLabel = type.startsWith(`${ns}.`) ? type.slice(ns.length + 1) : type;
    pointNodes.push([pointNode, pointLabel, type]);
    if (records.length >= COLLAPSE_AT) {
      const collapsed = mermaidId(`${type}#collapsed`);
      chart.node(collapsed, `×${records.length}`, 'rounded', 'collapsed');
      rows.push([
        `×${records.length}`,
        `${records.length} extensions of ${type}`,
        `[see the table below](#${githubAnchor(contributesHeading(type))})`,
      ]);
      [...new Set(records.flatMap(stylesOf))].toSorted().forEach((style) => {
        chart.edge(pkgNode, collapsed, style);
      });
    } else {
      records.forEach((record) => {
        const node = mermaidId(record.key);
        chart.node(node, shorten(identityOf(record)), 'box');
        rows.push([
          shorten(identityOf(record)),
          `extension of ${type}`,
          relLink(docPath, record.loc, path.posix.basename(record.loc.file)),
        ]);
        stylesOf(record).forEach((style) => {
          chart.edge(pkgNode, node, style);
        });
      });
    }
  });

  // The point nodes are declared last so they sit inside the namespace subgraph.
  chart.subgraph(mermaidId(`ns:${ns}`), ns, () => {
    pointNodes.forEach(([node, label]) => {
      chart.node(node, label, 'point', 'point');
    });
  });
  drawn.forEach(([type, records]) => {
    const pointNode = mermaidId(type);
    if (records.length >= COLLAPSE_AT) {
      chart.edge(mermaidId(`${type}#collapsed`), pointNode, 'solid');
    } else {
      records.forEach((record) => {
        chart.edge(mermaidId(record.key), pointNode, 'solid');
      });
    }
  });
  pointNodes.forEach(([, label, type]) => {
    const point = model.points.find((candidate) => candidate.id === type);
    rows.push([label, 'extension point', point ? pointLink(docPath, point, model) : `\`${type}\``]);
  });

  return joinBlocks([chart.toString(), table(['Node', 'What', 'Link'], rows)]);
};

/** The `## Contributes` section: what this package adds to other packages' extension points. */
export const renderContributes = (
  model: ExtensionMapModel,
  pkg: Pkg,
  docPath: string,
): { markdown: string; hasDiagram: boolean } | undefined => {
  const records = model.extensions.filter((record) => record.pkg === pkg.name);
  if (records.length === 0) {
    return undefined;
  }
  const entriesById = new Map(model.entries.map((entry) => [entry.id, entry]));
  const byNamespace = groupBy(records, (record) => namespaceOf(record.type));
  let hasDiagram = false;

  const namespaces = [...byNamespace.entries()]
    .toSorted(([a], [b]) => (a < b ? -1 : 1))
    .map(([ns, nsRecords]) => {
      const byType = new Map(
        [...groupBy(nsRecords, (record) => record.type).entries()].toSorted(([a], [b]) =>
          a < b ? -1 : 1,
        ),
      );
      const diagram = renderNamespaceDiagram(ns, byType, model, pkg, docPath, entriesById);
      hasDiagram = hasDiagram || diagram !== undefined;
      return joinBlocks([
        `### Namespace \`${ns}\``,
        diagram,
        ...[...byType.entries()].map(([type, typeRecords]) =>
          joinBlocks([
            `#### ${contributesHeading(type)}`,
            renderPointTable(
              typeRecords,
              model.points.find((point) => point.id === type),
              model,
              docPath,
            ),
          ]),
        ),
      ]);
    });

  return {
    markdown: joinBlocks([
      '## Contributes',
      oneLine(`The extensions this package declares, grouped by the namespace of the extension
         point they target.`),
      ...namespaces,
    ]),
    hasDiagram,
  };
};
