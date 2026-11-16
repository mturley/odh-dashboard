import path from 'path';
import { INCLUDED_IN, hasApps, includedInCell, overrideNotes } from '../appNotes';
import { contributesHeading, fileLink, pointLink, relLink, sourceLink } from '../links';
import { defList, githubAnchor, joinBlocks, oneLine, table } from '../markdown';
import { flowchart, mermaidId } from '../mermaid';
import type { EdgeStyle } from '../mermaid';
import {
  codeRefCell,
  codeRefName,
  flagCell,
  notResolvedOf,
  propertyOf,
  suppliedCell,
  valueCell,
} from '../values';
import type { CellCtx } from '../values';
import type {
  Entry,
  ExtensionMapModel,
  ExtensionPoint,
  ExtensionRecord,
  Pkg,
} from '../../model/types';

/** Extensions of one point from one package collapse into a single node at this count. */
const COLLAPSE_AT = 5;

/** Above this many columns a contribution is rendered as a definition list (spec §5.10). */
const MAX_COLUMNS = 7;

const REQUIRES = 'Requires';
const DISALLOWS = 'Disallows';
const CODEREF = 'CodeRef target';
const SOURCE = 'Source';

/** How an extension reaches an app, in words, per entry kind. */
const PATH_WORDS: Record<Entry['path'], string> = {
  static: 'bundled',
  federated: 'federated',
  'distribution-static': 'bundled by a distribution',
  'distribution-local': 'local to a distribution',
};

/** How many extensions one record stands for, as far as the analysis could count them. */
const countOf = (record: ExtensionRecord): number =>
  typeof record.multiplicity === 'number' ? record.multiplicity : 1;

const hasUnknownCount = (records: ExtensionRecord[]): boolean =>
  records.some((record) => record.multiplicity === 'unknown');

const groupCount = (records: ExtensionRecord[]): number =>
  records.reduce((total, record) => total + countOf(record), 0);

/** `×7`, or `×7+` when one of the records stands for an uncounted number of extensions. */
const countLabel = (records: ExtensionRecord[]): string =>
  `×${groupCount(records)}${hasUnknownCount(records) ? '+' : ''}`;

/** The mark on a row that stands for more than one extension. */
const rowMark = (record: ExtensionRecord): string | undefined => {
  if (record.multiplicity === 'unknown') {
    return '×?';
  }
  return countOf(record) > 1 ? `×${countOf(record)}` : undefined;
};

/** The last segment of a point ID, used to name a contribution that names itself nowhere. */
const pointTail = (type: string): string => {
  const slash = type.lastIndexOf('/');
  if (slash !== -1) {
    return type.slice(slash + 1);
  }
  const dot = type.lastIndexOf('.');
  return dot === -1 ? type : type.slice(dot + 1);
};

/**
 * The name a contribution goes by, if it has one: its own `id`, `title` or `name`, else the
 * `const` it is bound to, else the export of its first resolved code reference.
 */
const selfName = (record: ExtensionRecord): string | undefined => {
  for (const key of ['id', 'title', 'name']) {
    const value = propertyOf(record, key);
    if (value?.kind === 'literal' || value?.kind === 'constant' || value?.kind === 'enumMember') {
      return String(value.value);
    }
  }
  if (record.binding !== undefined) {
    return record.binding;
  }
  for (const key of Object.keys(record.properties).toSorted()) {
    const value = propertyOf(record, key);
    if (value?.kind === 'codeRef' && value.export !== null) {
      return codeRefName(value);
    }
  }
  return undefined;
};

/**
 * What to call each contribution to one point: its own name where it has one, else the point's
 * last segment and its position among this package's contributions to that point. Names repeated
 * within the group are numbered so that each label identifies exactly one contribution.
 */
const identityLabels = (type: string, records: ExtensionRecord[]): Map<string, string> => {
  const bases = records.map(
    (record, index) => selfName(record) ?? `${pointTail(type)} #${index + 1}`,
  );
  const counts = new Map<string, number>();
  bases.forEach((base) => counts.set(base, (counts.get(base) ?? 0) + 1));
  const seen = new Map<string, number>();
  return new Map(
    records.map((record, index) => {
      const base = bases[index];
      if ((counts.get(base) ?? 0) < 2) {
        return [record.key, base];
      }
      const position = (seen.get(base) ?? 0) + 1;
      seen.set(base, position);
      return [record.key, `${base} #${position}`];
    }),
  );
};

const shorten = (s: string, max = 44): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** The properties some contribution to this point sets as a code reference. */
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

/**
 * The property columns of one point's table: declared order first, then anything extra. A property
 * any contribution sets as a code reference is left out — it lives in the CodeRef target column
 * for every row, so that `—` always means "this contribution does not set the property".
 */
const dataColumns = (
  records: ExtensionRecord[],
  point: ExtensionPoint | undefined,
  refKeys: string[],
): string[] => {
  const used = new Set<string>();
  records.forEach((record) =>
    Object.keys(record.properties).forEach((key) => {
      if (!refKeys.includes(key)) {
        used.add(key);
      }
    }),
  );
  const declared = (point?.properties ?? []).map((property) => property.name);
  const ordered = declared.filter((name) => used.has(name));
  const extra = [...used].filter((name) => !declared.includes(name)).toSorted();
  return [...ordered, ...extra];
};

/** Every code-reference property of one contribution, named when the column holds more than one. */
const codeRefTargetCell = (record: ExtensionRecord, keys: string[], docPath: string): string => {
  const parts = keys.flatMap((key) => {
    const value = propertyOf(record, key);
    if (value === undefined) {
      return [];
    }
    const cell =
      value.kind === 'codeRef'
        ? codeRefCell(value, docPath)
        : valueCell(value, { docPath, record, label: key });
    return [keys.length === 1 && value.kind === 'codeRef' ? cell : `\`${key}\`: ${cell}`];
  });
  return parts.length === 0 ? '—' : parts.join('<br>');
};

const suppliesRows = (
  records: ExtensionRecord[],
  keys: string[],
  docPath: string,
  labels: Map<string, string>,
): string[][] =>
  records.flatMap((record) =>
    keys.flatMap((key) => {
      const value = propertyOf(record, key);
      if (value?.kind !== 'codeRef' || !value.supplies) {
        return [];
      }
      const ctx: CellCtx = { docPath, record, label: key };
      return Object.entries(value.supplies)
        .toSorted(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, supplied]) => [
          labels.get(record.key) ?? '',
          keys.length === 1 ? name : `${key} → ${name}`,
          suppliedCell(supplied, ctx),
        ]);
    }),
  );

/** One point's contributions: a table (or definition lists), supplies and what is unresolved. */
const renderPointTable = (
  type: string,
  records: ExtensionRecord[],
  point: ExtensionPoint | undefined,
  model: ExtensionMapModel,
  docPath: string,
): string => {
  const labels = identityLabels(type, records);
  const refKeys = codeRefColumns(records);
  const dataKeys = dataColumns(records, point, refKeys);
  const hasRequires = records.some((record) => record.flags.required.length > 0);
  const hasDisallows = records.some((record) => record.flags.disallowed.length > 0);
  const headers = [
    ...dataKeys,
    ...(hasRequires ? [REQUIRES] : []),
    ...(hasDisallows ? [DISALLOWS] : []),
    ...(refKeys.length > 0 ? [CODEREF] : []),
    ...(hasApps(model) ? [INCLUDED_IN] : []),
    SOURCE,
  ];

  const cellsOf = (record: ExtensionRecord): [string, string][] => {
    const entries: [string, string][] = dataKeys.map((key) => {
      const value = propertyOf(record, key);
      return [key, value === undefined ? '—' : valueCell(value, { docPath, record, label: key })];
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
    if (hasApps(model)) {
      entries.push([INCLUDED_IN, includedInCell(record)]);
    }
    entries.push([SOURCE, relLink(docPath, record.loc, path.posix.basename(record.loc.file))]);
    return entries;
  };

  /** The row of one contribution, with its `×N` mark where it stands for several extensions. */
  const rowOf = (record: ExtensionRecord): string[] => {
    const cells = cellsOf(record).map(([, cell]) => cell);
    const mark = rowMark(record);
    return mark === undefined ? cells : [`\`${mark}\` ${cells[0]}`, ...cells.slice(1)];
  };

  const body =
    headers.length > MAX_COLUMNS
      ? records
          .map((record) => {
            const mark = rowMark(record);
            const items: [string, string][] = cellsOf(record);
            if (mark !== undefined) {
              items.unshift(['Stands for', `${mark} extensions`]);
            }
            return joinBlocks([`##### ${labels.get(record.key) ?? ''}`, defList(items)]);
          })
          .join('\n\n')
      : table(headers, records.map(rowOf));

  const supplies = suppliesRows(records, refKeys, docPath, labels);
  const unresolved = records.flatMap((record) =>
    notResolvedOf(record).map((item) => [
      labels.get(record.key) ?? '',
      item.property,
      item.reason,
      sourceLink(docPath, item.loc),
    ]),
  );
  return joinBlocks([
    point === undefined
      ? '> This extension type matches no extension point declared in this repository.'
      : `Defined in ${pointLink(docPath, point, model)}.`,
    body,
    hasApps(model) ? overrideNotes(records, model, docPath, labels) : undefined,
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
  const pkgLabel = `${pkg.name.replace(/^@odh-dashboard\//, '')} (${pkg.kind})`;
  const drawn = [...byType.entries()].filter(([type]) =>
    model.points.some((point) => point.id === type),
  );
  if (drawn.length === 0) {
    return undefined;
  }
  chart.node(pkgNode, pkgLabel, 'box', 'pkg');
  rows.push([pkgLabel, 'this package', fileLink(docPath, pkg.dir, pkg.dir)]);

  const pathsOf = (record: ExtensionRecord): Entry['path'][] => [
    ...new Set(
      record.entries.flatMap((id) => {
        const entry = entriesById.get(id);
        return entry ? [entry.path] : [];
      }),
    ),
  ];

  /** Dashed only when every entry that carries the extension is a federated one. */
  const styleOf = (record: ExtensionRecord): EdgeStyle => {
    const paths = pathsOf(record);
    return paths.length > 0 && paths.every((entryPath) => entryPath === 'federated')
      ? 'federated'
      : 'solid';
  };

  const loadingWords = (record: ExtensionRecord): string => {
    const words = pathsOf(record)
      .map((entryPath) => PATH_WORDS[entryPath])
      .toSorted();
    return words.length === 0 ? '' : ` — ${words.join(' and ')}`;
  };

  const pointNodes: [string, string, string][] = [];
  drawn.forEach(([type, records]) => {
    const pointNode = mermaidId(type);
    const pointLabel = type.startsWith(`${ns}.`) ? type.slice(ns.length + 1) : type;
    const labels = identityLabels(type, records);
    pointNodes.push([pointNode, pointLabel, type]);
    if (groupCount(records) >= COLLAPSE_AT) {
      const collapsed = mermaidId(`${type}#collapsed`);
      chart.node(collapsed, countLabel(records), 'rounded', 'collapsed');
      rows.push([
        countLabel(records),
        `${hasUnknownCount(records) ? 'at least ' : ''}${groupCount(
          records,
        )} extensions of ${type}`,
        `[see the table below](#${githubAnchor(contributesHeading(type))})`,
      ]);
      chart.edge(
        pkgNode,
        collapsed,
        records.every((record) => styleOf(record) === 'federated') ? 'federated' : 'solid',
      );
    } else {
      records.forEach((record) => {
        const node = mermaidId(record.key);
        const label = shorten(labels.get(record.key) ?? '');
        chart.node(node, label, 'box');
        rows.push([
          label,
          `extension of ${type}${loadingWords(record)}`,
          relLink(docPath, record.loc, path.posix.basename(record.loc.file)),
        ]);
        chart.edge(pkgNode, node, styleOf(record));
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
    if (groupCount(records) >= COLLAPSE_AT) {
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
              type,
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
