import { isUnresolvedSpreadKey } from '../../extract/values';
import type {
  ExtensionMapModel,
  ExtensionPoint,
  ExtensionRecord,
  Pkg,
  SymbolRef,
  Value,
} from '../../model/types';
import { defList, table } from '../markdown';
import { docPathFor, pointLink, relLink, sourceSymbolName } from '../links';
import { flowchart, LEGEND_MD, mermaidId } from '../mermaid';

const codeValue = (value: string | number | boolean | null): string =>
  `\`${JSON.stringify(value)}\``;

const valueText = (value: Value | SymbolRef, fromDoc: string, model: ExtensionMapModel): string => {
  if (value.kind === 'literal') {
    return codeValue(value.value);
  }
  if (value.kind === 'enumMember') {
    return `\`${value.enumName}.${value.member}\` (${codeValue(value.value)})`;
  }
  if (value.kind === 'constant') {
    return `\`${value.name}\` (${codeValue(value.value)})`;
  }
  if (value.kind === 'codeRef') {
    const fallback =
      value.module
        .split('/')
        .at(-1)
        ?.replace(/\.[^.]+$/u, '') ?? value.module;
    const label =
      value.export === 'default' && value.target !== undefined
        ? sourceSymbolName(value.target, fallback)
        : value.export ?? fallback;
    const target = value.target === undefined ? label : relLink(fromDoc, value.target, label);
    return `${value.module}#${target}`;
  }
  if (value.kind === 'array') {
    return value.items.map((item) => valueText(item, fromDoc, model)).join(', ');
  }
  if (value.kind === 'object') {
    return Object.entries(value.props)
      .filter(([key]) => !isUnresolvedSpreadKey(key))
      .map(([key, item]) => `${key}: ${valueText(item, fromDoc, model)}`)
      .join(', ');
  }
  if (value.kind === 'unresolved') {
    return `[not resolved](#diagnostics)`;
  }
  return relLink(fromDoc, value.loc, value.name);
};

const codeRefs = (extension: ExtensionRecord): Extract<Value, { kind: 'codeRef' }>[] =>
  Object.values(extension.properties).filter(
    (value): value is Extract<Value, { kind: 'codeRef' }> => value.kind === 'codeRef',
  );

const unresolvedRows = (extension: ExtensionRecord): string[][] => {
  const rows: string[][] = [];
  const visit = (value: Value, location: string): void => {
    if (value.kind === 'unresolved') {
      rows.push([location, value.reason, '[diagnostics](#diagnostics)']);
      return;
    }
    if (value.kind === 'array') {
      value.items.forEach((item, index) => visit(item, `${location}[${index}]`));
    } else if (value.kind === 'object') {
      for (const [key, item] of Object.entries(value.props)) {
        visit(
          item,
          isUnresolvedSpreadKey(key) ? `${location} (unknown spread)` : `${location}.${key}`,
        );
      }
    } else if (value.kind === 'codeRef' && value.supplies !== undefined) {
      for (const [key, item] of Object.entries(value.supplies)) {
        if (item.kind !== 'symbol') {
          visit(
            item,
            isUnresolvedSpreadKey(key)
              ? `${location} supplies (unknown spread)`
              : `${location} supplies.${key}`,
          );
        }
      }
    }
  };
  for (const [key, value] of Object.entries(extension.properties)) {
    visit(value, isUnresolvedSpreadKey(key) ? 'properties (unknown spread)' : `properties.${key}`);
  }
  extension.flags.required.forEach((value, index) => visit(value, `flags.required[${index}]`));
  extension.flags.disallowed.forEach((value, index) => visit(value, `flags.disallowed[${index}]`));
  return rows;
};

const literalProperties = (point: ExtensionPoint, extensions: ExtensionRecord[]): string[] => {
  const present = new Set(
    extensions.flatMap((extension) =>
      Object.keys(extension.properties).filter((key) => !isUnresolvedSpreadKey(key)),
    ),
  );
  return point.properties
    .filter((property) => present.has(property.name))
    .map((property) => property.name);
};

const extensionRow = (
  extension: ExtensionRecord,
  columns: string[],
  model: ExtensionMapModel,
  fromDoc: string,
): string[] =>
  columns.map((column) => {
    if (column.startsWith('property:')) {
      const value = extension.properties[column.slice('property:'.length)];
      return Object.prototype.hasOwnProperty.call(
        extension.properties,
        column.slice('property:'.length),
      )
        ? valueText(value, fromDoc, model)
        : '';
    }
    if (column === 'Requires') {
      return extension.flags.required.map((value) => valueText(value, fromDoc, model)).join(', ');
    }
    if (column === 'Disallows') {
      return extension.flags.disallowed.map((value) => valueText(value, fromDoc, model)).join(', ');
    }
    if (column === 'CodeRef target') {
      return codeRefs(extension)
        .map((value) => valueText(value, fromDoc, model))
        .join(', ');
    }
    if (column === 'Included in') {
      return extension.apps.map((app) => app.app).join(', ');
    }
    return relLink(fromDoc, extension.loc, extension.type);
  });

const suppliesRows = (
  extensions: ExtensionRecord[],
  fromDoc: string,
  model: ExtensionMapModel,
): string[][] =>
  extensions.flatMap((extension) =>
    codeRefs(extension).flatMap((codeRef) =>
      Object.entries(codeRef.supplies ?? {}).map(([name, value]) => [
        codeRef.export ?? codeRef.module,
        name,
        valueText(value, fromDoc, model),
      ]),
    ),
  );

const pointTable = (
  model: ExtensionMapModel,
  point: ExtensionPoint,
  extensions: ExtensionRecord[],
  fromDoc: string,
): string => {
  const properties = literalProperties(point, extensions);
  const columns = [
    ...properties.map((property) => `property:${property}`),
    'Requires',
    'Disallows',
    'CodeRef target',
    'Included in',
    'Source',
  ];
  const headers = columns.map((column) =>
    column.startsWith('property:') ? column.slice('property:'.length) : column,
  );
  const rows = extensions.map((extension) => extensionRow(extension, columns, model, fromDoc));
  const contributionTable =
    columns.length > 7
      ? extensions
          .map((extension) => {
            const row = extensionRow(extension, columns, model, fromDoc);
            return defList(
              headers.map((header, index): [string, string] => [header, row[index] ?? '']),
            );
          })
          .join('\n\n')
      : table(headers, rows);
  const unresolved = extensions.flatMap(unresolvedRows);
  const supplies = suppliesRows(extensions, fromDoc, model);
  return [
    `#### ${point.id}`,
    contributionTable,
    unresolved.length === 0
      ? ''
      : `**Not resolved**\n\n${table(['Location', 'Reason', 'Link'], unresolved)}`,
    supplies.length === 0
      ? ''
      : `**Supplies**\n\n${table(['CodeRef', 'Supply', 'Value'], supplies)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
};

const namespaceOf = (point: ExtensionPoint): string => point.id.split('.')[0];

const representedCount = (extensions: ExtensionRecord[]): number | undefined => {
  let count = 0;
  for (const extension of extensions) {
    if (extension.multiplicity === 'unknown') {
      return undefined;
    }
    count += extension.multiplicity ?? 1;
  }
  return count;
};

const renderNamespaceDiagram = (
  model: ExtensionMapModel,
  pkg: Pkg,
  namespace: string,
  points: ExtensionPoint[],
  byPoint: Map<string, ExtensionRecord[]>,
): string => {
  const fromDoc = docPathFor(pkg);
  const chart = flowchart('LR');
  const pkgNode = `pkg_${mermaidId(pkg.name)}`;
  chart.node(pkgNode, pkg.name, 'box');
  const nodeRows: string[][] = [[pkg.name, `[${pkg.name}](#contributes)`]];
  for (const point of points) {
    const extensions = byPoint.get(point.id) ?? [];
    if (extensions.length === 0) {
      continue;
    }
    const node = `point_${mermaidId(point.id)}`;
    const count = representedCount(extensions);
    const suffix = count !== undefined && count >= 5 ? ` ×${count}` : '';
    chart.node(node, `${point.id}${suffix}`, 'point');
    const federatedEntries = new Set(
      model.entries.filter((entry) => entry.path === 'federated').map((entry) => entry.id),
    );
    const federated = extensions.some((extension) =>
      extension.entries.some((entry) => federatedEntries.has(entry)),
    );
    chart.edge(pkgNode, node, federated ? 'federated' : 'solid');
    const links = [
      pointLink(fromDoc, point, model),
      ...extensions.map((extension) => relLink(fromDoc, extension.loc, point.id)),
    ];
    nodeRows.push([`${point.id}${suffix}`, links.join('<br>')]);
  }
  const diagram = `\`\`\`mermaid\n${chart.toString()}\n\`\`\``;
  return [`### ${namespace}`, diagram, table(['Node', 'Link'], nodeRows), LEGEND_MD].join('\n\n');
};

export const renderContributes = (model: ExtensionMapModel, pkg: Pkg): string => {
  const contributions = model.extensions.filter((extension) => extension.pkg === pkg.name);
  if (contributions.length === 0) {
    return '';
  }
  const pointById = new Map(model.points.map((point) => [point.id, point]));
  const byPoint = new Map<string, ExtensionRecord[]>();
  for (const extension of contributions) {
    if (!pointById.has(extension.type)) {
      continue;
    }
    const current = byPoint.get(extension.type) ?? [];
    current.push(extension);
    byPoint.set(extension.type, current);
  }
  const points = [...byPoint.keys()]
    .map((id) => pointById.get(id))
    .filter((point): point is ExtensionPoint => point !== undefined)
    .toSorted((a, b) => a.id.localeCompare(b.id));
  const namespaces = [...new Set(points.map(namespaceOf))].toSorted();
  const diagrams = namespaces.map((namespace) =>
    renderNamespaceDiagram(
      model,
      pkg,
      namespace,
      points.filter((point) => namespaceOf(point) === namespace),
      byPoint,
    ),
  );
  const fromDoc = docPathFor(pkg);
  const dataTables = points.map((point) =>
    pointTable(model, point, byPoint.get(point.id) ?? [], fromDoc),
  );
  const unresolvedUnknownPoints = contributions.filter(
    (extension) => !pointById.has(extension.type),
  );
  const unknown =
    unresolvedUnknownPoints.length === 0
      ? ''
      : `### Not resolved\n\n${table(
          ['Extension type', 'Source', 'Reason'],
          unresolvedUnknownPoints.map((extension) => [
            extension.type,
            relLink(fromDoc, extension.loc, extension.type),
            'No matching declared extension point; no diagram edge was inferred.',
          ]),
        )}`;
  return ['## Contributes', ...diagrams, ...dataTables, unknown].filter(Boolean).join('\n\n');
};
