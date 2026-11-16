import { consumerLink, consumersOf } from './consumes';
import {
  consumesLink,
  contributesLink,
  docPathFor,
  pkgDisplayName,
  pointLink,
  relLink,
  sourceLink,
} from '../links';
import { githubAnchor, joinBlocks, oneLine, table } from '../markdown';
import { flowchart, mermaidId } from '../mermaid';
import type { EdgeStyle } from '../mermaid';
import type {
  Consumer,
  Diagnostic,
  DiagnosticCode,
  ExtensionMapModel,
  ExtensionPoint,
  Pkg,
  UseSite,
} from '../../model/types';

/**
 * The checker's expansion of a code reference's inner type, cut short: the declared `Type`
 * column beside it already carries the exact text as written in the source.
 */
const INNER_TYPE_LIMIT = 120;

const innerType = (inner: string): string => {
  const text = oneLine(inner);
  return text.length > INNER_TYPE_LIMIT ? `${text.slice(0, INNER_TYPE_LIMIT)}…` : text;
};

const propertyRows = (point: ExtensionPoint): string[][] =>
  point.properties.map((property) => [
    `\`${property.name}\``,
    property.optional ? '—' : 'yes',
    `\`${oneLine(property.typeText)}\``,
    property.codeRef ? `\`${innerType(property.codeRef.inner)}\`` : '—',
    property.doc ? oneLine(property.doc) : '',
  ]);

/** The packages that contribute an extension of this point, with a link to their page. */
const implementedBy = (
  point: ExtensionPoint,
  model: ExtensionMapModel,
  docPath: string,
): string | undefined => {
  const names = [
    ...new Set(
      model.extensions.filter((record) => record.type === point.id).map((record) => record.pkg),
    ),
  ].toSorted();
  if (names.length === 0) {
    return undefined;
  }
  const links = names.map((name) => {
    const contributor = model.packages.find((candidate) => candidate.name === name);
    return contributor
      ? contributesLink(docPath, point.id, contributor, pkgDisplayName(contributor))
      : `\`${name}\``;
  });
  return `**Implemented by:** ${links.join(', ')}`;
};

/** The packages whose code queries or uses this point, with a link to their Consumes section. */
const consumedIn = (
  point: ExtensionPoint,
  model: ExtensionMapModel,
  docPath: string,
): string | undefined => {
  const names = [
    ...new Set(consumersOf(model, point.id).map(({ consumer }) => consumer.pkg)),
  ].toSorted();
  if (names.length === 0) {
    return undefined;
  }
  const links = names.map((name) => {
    const consumer = model.packages.find((candidate) => candidate.name === name);
    return consumer
      ? consumesLink(docPath, point.id, consumer, pkgDisplayName(consumer))
      : `\`${name}\``;
  });
  return `**Consumed in:** ${links.join(', ')}`;
};

/**
 * `{@link X}` in a point's documentation: a link to point X's section when X is the type name of
 * exactly one point, else X as code. A label (`{@link X | label}` or `{@link X label}`) is kept as
 * the link text.
 */
const renderLinks = (text: string, model: ExtensionMapModel, docPath: string): string =>
  text.replace(/\{@link\s+([^\s|}]+)\s*\|?\s*([^}]*)\}/g, (_, target: string, label: string) =>
    linkToType(target, model, docPath, label.trim() || undefined),
  );

const linkToType = (
  target: string,
  model: ExtensionMapModel,
  docPath: string,
  label?: string,
): string => {
  const matches = model.points.filter((candidate) => candidate.typeName === target);
  if (matches.length !== 1) {
    return `\`${label ?? target}\``;
  }
  const link = pointLink(docPath, matches[0], model);
  return label === undefined
    ? link.replace(/^\[[^\]]*\]/, `[${target}]`)
    : link.replace(/^\[[^\]]*\]/, `[${label}]`);
};

/** Diagnostic codes listed in a point's "Not resolved" table, besides every `unresolved-*`. */
const POINT_NOT_RESOLVED: ReadonlySet<DiagnosticCode> = new Set<DiagnosticCode>([
  'guard-unknown-callee',
  'point-id-literal',
]);

/**
 * What the analysis could not prove about one point: `guard-unknown-callee` and
 * `point-id-literal` findings about it, and `unresolved-*` findings about it or, when they are
 * about no point, located inside one of its extensions.
 */
const notResolvedFor = (point: ExtensionPoint, model: ExtensionMapModel): Diagnostic[] => {
  const records = model.extensions.filter((record) => record.type === point.id);
  const inRecord = (diagnostic: Diagnostic): boolean =>
    diagnostic.loc !== undefined &&
    records.some(
      (record) =>
        record.loc.file === diagnostic.loc?.file &&
        diagnostic.loc.line >= record.loc.line &&
        diagnostic.loc.line <= (record.loc.endLine ?? record.loc.line),
    );
  return model.diagnostics.filter((diagnostic) => {
    const about = diagnostic.pointId === point.id;
    if (diagnostic.code.startsWith('unresolved-')) {
      return about || (diagnostic.pointId === undefined && inRecord(diagnostic));
    }
    return POINT_NOT_RESOLVED.has(diagnostic.code) && about;
  });
};

/** Use kinds in edge labels and node tables, the most telling first. */
const KIND_ORDER: readonly UseSite['kind'][] = [
  'lazy-render',
  'jsx-render',
  'hook-run',
  'call',
  'filter',
  'type-check',
  'read',
];

/** Shortens a label for a diagram node; the node table always carries the full name. */
const shorten = (s: string, max = 44): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * One point's flow: contributor packages → the point → the consumers that query or use it → where
 * each consumer is rendered or called (one hop up). Only proven edges are drawn; the node table
 * after it carries a link for every node.
 */
const renderFlow = (
  point: ExtensionPoint,
  model: ExtensionMapModel,
  docPath: string,
): string | undefined => {
  const records = model.extensions.filter((record) => record.type === point.id);
  const consumers = consumersOf(model, point.id);
  if (records.length === 0 && consumers.length === 0) {
    return undefined;
  }
  const entries = new Map(model.entries.map((entry) => [entry.id, entry]));
  const chart = flowchart('LR');
  const rows: string[][] = [];
  const pointNode = mermaidId(point.id);

  const contributors = [...new Set(records.map((record) => record.pkg))].toSorted();
  contributors.forEach((name) => {
    const contributor = model.packages.find((candidate) => candidate.name === name);
    const label = contributor ? `${pkgDisplayName(contributor)} (${contributor.kind})` : name;
    chart.node(mermaidId(`pkg:${name}`), label, 'box', 'pkg');
    rows.push([
      label,
      'contributes extensions of this point',
      contributor
        ? contributesLink(docPath, point.id, contributor, pkgDisplayName(contributor))
        : `\`${name}\``,
    ]);
  });
  chart.node(pointNode, point.id, 'point', 'point');
  rows.push([point.id, 'this extension point', `[${point.id}](#${githubAnchor(point.id)})`]);

  contributors.forEach((name) => {
    const own = records.filter((record) => record.pkg === name);
    // Dashed only when every entry that carries every one of the package's extensions is federated.
    const federated = own.every((record) => {
      const paths = record.entries.flatMap((id) => {
        const entry = entries.get(id);
        return entry ? [entry.path] : [];
      });
      return paths.length > 0 && paths.every((entryPath) => entryPath === 'federated');
    });
    const style: EdgeStyle = federated ? 'federated' : 'solid';
    chart.edge(mermaidId(`pkg:${name}`), pointNode, style);
  });

  /**
   * One node per symbol (`<file>#<symbol>`, the consumer id scheme), so a consumer that also
   * renders or calls another consumer of this point is drawn once. Every edge is still one hop.
   */
  type SymbolNode = {
    symbol: string;
    consumer?: (typeof consumers)[number];
    refs: { target: string; ref: Consumer['renderedIn'][number] }[];
  };
  const nodes = new Map<string, SymbolNode>();
  consumers.forEach((entry) =>
    nodes.set(entry.consumer.id, { symbol: entry.consumer.symbol, consumer: entry, refs: [] }),
  );
  consumers.forEach(({ consumer }) =>
    consumer.renderedIn.forEach((ref) => {
      const key = `${ref.loc.file}#${ref.symbol}`;
      const found = nodes.get(key) ?? { symbol: ref.symbol, refs: [] };
      found.refs.push({ target: consumer.symbol, ref });
      nodes.set(key, found);
    }),
  );
  const nodeId = (key: string): string => mermaidId(`symbol:${key}`);

  /** What a consumer does with the point: its query hook or wrapper, then its use kinds. */
  const kindsOf = ({ querySites, uses }: (typeof consumers)[number]): string[] => [
    ...new Set([
      ...querySites.map((site) => site.wrapper ?? site.hook),
      ...KIND_ORDER.filter((kind) => uses.some((use) => use.kind === kind)),
    ]),
  ];

  consumers.forEach((entry) => {
    const key = entry.consumer.id;
    chart.node(nodeId(key), shorten(entry.consumer.symbol), 'box');
    chart.edge(pointNode, nodeId(key), 'solid', shorten(kindsOf(entry).join(', '), 60));
  });
  nodes.forEach((node, key) => {
    if (!node.consumer) {
      chart.node(nodeId(key), shorten(node.symbol), 'rounded');
    }
  });
  // One edge per (consumer, renderer, how); the node table keeps every reference line.
  const drawn = new Set<string>();
  consumers.forEach(({ consumer }) =>
    consumer.renderedIn.forEach((ref) => {
      const to = nodeId(`${ref.loc.file}#${ref.symbol}`);
      const edgeKey = `${consumer.id}\0${to}\0${ref.how}`;
      if (drawn.has(edgeKey)) {
        return;
      }
      drawn.add(edgeKey);
      chart.edge(
        nodeId(consumer.id),
        to,
        'renderedIn',
        ref.how === 'call' ? 'called in' : 'rendered in',
      );
    }),
  );

  nodes.forEach((node) => {
    const what: string[] = [];
    const links: string[] = [];
    if (node.consumer) {
      const { consumer, uses } = node.consumer;
      const oneOf = [...new Set(uses.flatMap((use) => (use.oneOf ? [use.oneOf.join(', ')] : [])))];
      what.push(
        `consumer in ${consumer.pkg} — ${kindsOf(node.consumer).join(', ')}${oneOf
          .map((ids) => ` (one of: ${ids})`)
          .join('')}`,
      );
      links.push(consumerLink(consumer, docPath));
    }
    const targets = (how: 'jsx' | 'call'): string[] => [
      ...new Set(node.refs.filter(({ ref }) => ref.how === how).map(({ target }) => target)),
    ];
    if (targets('jsx').length > 0) {
      what.push(`renders ${targets('jsx').join(', ')} (one hop up)`);
    }
    if (targets('call').length > 0) {
      what.push(`calls ${targets('call').join(', ')} (one hop up)`);
    }
    node.refs.forEach(({ target, ref }) =>
      links.push(
        `${ref.how === 'call' ? 'calls' : 'renders'} ${target} at ${sourceLink(docPath, ref.loc)}`,
      ),
    );
    rows.push([shorten(node.symbol), what.join('; '), links.join('<br>')]);
  });

  return joinBlocks([chart.toString(), table(['Node', 'What', 'Link'], rows)]);
};

/** The point's "Not resolved" table, next to its flow diagram. */
const renderNotResolved = (
  point: ExtensionPoint,
  model: ExtensionMapModel,
  docPath: string,
): string | undefined => {
  const found = notResolvedFor(point, model);
  if (found.length === 0) {
    return undefined;
  }
  return joinBlocks([
    '**Not resolved** (never drawn in a diagram):',
    table(
      ['Code', 'Message', 'Source'],
      found.map((diagnostic) => [
        `\`${diagnostic.code}\``,
        oneLine(diagnostic.message),
        diagnostic.loc ? sourceLink(docPath, diagnostic.loc) : '—',
      ]),
    ),
  ]);
};

/** The marker for a point nothing contributes to, nothing consumes, or neither. */
const usageMarker = (point: ExtensionPoint, model: ExtensionMapModel): string | undefined => {
  const has = (code: DiagnosticCode): boolean =>
    model.diagnostics.some(
      (diagnostic) => diagnostic.code === code && diagnostic.pointId === point.id,
    );
  if (has('point-unused')) {
    return '> **Unused.** No package in this repository contributes an extension of this point, and no code queries or uses it.';
  }
  if (has('point-no-contributors')) {
    return '> **No contributors.** No package in this repository contributes an extension of this point.';
  }
  return has('point-no-consumers')
    ? '> **No consumers.** No code in this repository queries or uses this point.'
    : undefined;
};

const renderPoint = (point: ExtensionPoint, model: ExtensionMapModel, docPath: string): string => {
  const deprecated =
    point.doc.deprecated === undefined
      ? undefined
      : `> **Deprecated.**${
          typeof point.doc.deprecated === 'string' ? ` ${point.doc.deprecated}` : ''
        }`;
  const declaration = [
    `Declared as ${relLink(docPath, point.loc, point.typeName)}`,
    point.typeParams.length === 0
      ? ''
      : `, with type parameters ${point.typeParams.map((p) => `\`${p}\``).join(', ')}`,
    '.',
  ].join('');

  return joinBlocks([
    `### ${point.id}`,
    deprecated,
    point.doc.summary === undefined ? undefined : renderLinks(point.doc.summary, model, docPath),
    point.doc.remarks === undefined ? undefined : renderLinks(point.doc.remarks, model, docPath),
    declaration,
    point.properties.length === 0
      ? undefined
      : joinBlocks([
          '**Properties:**',
          table(['Property', 'Required', 'Type', 'CodeRef of', 'Description'], propertyRows(point)),
        ]),
    point.doc.links.length === 0
      ? undefined
      : `**Related:** ${[...new Set(point.doc.links)]
          .map((link) => linkToType(link, model, docPath))
          .join(', ')}`,
    point.doc.see.length === 0
      ? undefined
      : `**See:** ${point.doc.see
          .map((see) => renderLinks(oneLine(see), model, docPath))
          .join('; ')}`,
    implementedBy(point, model, docPath),
    consumedIn(point, model, docPath),
    usageMarker(point, model),
    renderFlow(point, model, docPath),
    renderNotResolved(point, model, docPath),
  ]);
};

/** Whether any point this package declares gets a flow diagram. */
export const definesHasDiagram = (model: ExtensionMapModel, pkg: Pkg): boolean =>
  model.points.some(
    (point) =>
      point.pkg === pkg.name &&
      (model.extensions.some((record) => record.type === point.id) ||
        consumersOf(model, point.id).length > 0),
  );

/** The `## Defines` section: the extension points this package declares. */
export const renderDefines = (model: ExtensionMapModel, pkg: Pkg): string | undefined => {
  const points = model.points.filter((point) => point.pkg === pkg.name);
  if (points.length === 0) {
    return undefined;
  }
  const docPath = docPathFor(pkg);
  return joinBlocks([
    '## Defines',
    oneLine(`The extension points this package declares. Each heading is the point ID other
       packages use as an extension's \`type\`.`),
    ...points.map((point) => renderPoint(point, model, docPath)),
  ]);
};
