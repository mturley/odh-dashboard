import path from 'path';
import {
  EFFECT,
  INCLUDED_IN,
  effectCell,
  hasApps,
  hasOverrideEffects,
  includedInCell,
  overrideNotes,
} from '../appNotes';
import { contributesHeading, pointLink, relLink, sourceLink } from '../links';
import { defList, joinBlocks, oneLine, table } from '../markdown';
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
import type { ExtensionMapModel, ExtensionPoint, ExtensionRecord, Pkg } from '../../model/types';

/** Above this many columns a contribution is rendered as a definition list (spec §5.10). */
const MAX_COLUMNS = 7;

const REQUIRES = 'Requires';
const DISALLOWS = 'Disallows';
const CODEREF = 'CodeRef target';
const SOURCE = 'Source';

/** How many extensions one record stands for, as far as the analysis could count them. */
const countOf = (record: ExtensionRecord): number =>
  typeof record.multiplicity === 'number' ? record.multiplicity : 1;

/** The mark on a row that stands for more than one extension. */
export const rowMark = (record: ExtensionRecord): string | undefined => {
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
export const identityLabels = (type: string, records: ExtensionRecord[]): Map<string, string> => {
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
  const hasEffect = hasApps(model) && hasOverrideEffects(records, model);
  const hasRequires = records.some((record) => record.flags.required.length > 0);
  const hasDisallows = records.some((record) => record.flags.disallowed.length > 0);
  const headers = [
    ...dataKeys,
    ...(hasRequires ? [REQUIRES] : []),
    ...(hasDisallows ? [DISALLOWS] : []),
    ...(refKeys.length > 0 ? [CODEREF] : []),
    ...(hasEffect ? [EFFECT] : []),
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
    if (hasEffect) {
      entries.push([EFFECT, effectCell(record, model, docPath)]);
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

/** One namespace of a package's contributions: its points, each with its records, both sorted. */
export type ContributionGroup = { ns: string; byType: Map<string, ExtensionRecord[]> };

/**
 * This package's contributions grouped exactly as the `## Contributes` section renders them:
 * namespaces sorted, points sorted within each. The table of contents follows this order.
 */
export const contributionGroups = (model: ExtensionMapModel, pkg: Pkg): ContributionGroup[] =>
  [
    ...groupBy(
      model.extensions.filter((record) => record.pkg === pkg.name),
      (record) => namespaceOf(record.type),
    ).entries(),
  ]
    .toSorted(([a], [b]) => (a < b ? -1 : 1))
    .map(([ns, nsRecords]) => ({
      ns,
      byType: new Map(
        [...groupBy(nsRecords, (record) => record.type).entries()].toSorted(([a], [b]) =>
          a < b ? -1 : 1,
        ),
      ),
    }));

/** The `## Contributes` section: what this package adds to other packages' extension points. */
export const renderContributes = (
  model: ExtensionMapModel,
  pkg: Pkg,
  docPath: string,
): string | undefined => {
  const groups = contributionGroups(model, pkg);
  if (groups.length === 0) {
    return undefined;
  }
  return joinBlocks([
    '## Contributes',
    oneLine(`The extensions this package declares, grouped by the namespace of the extension
       point they target.`),
    ...groups.map(({ ns, byType }) =>
      joinBlocks([
        `### Namespace \`${ns}\``,
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
      ]),
    ),
  ]);
};
