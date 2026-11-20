import {
  consumerLink,
  consumersOf,
  queryCell,
  renderedInCell,
  symbolText,
  usesCell,
} from './consumes';
import type { PointConsumer } from './consumes';
import { pkgDisplayName } from '../links';
import { joinBlocks, table } from '../markdown';
import { flowchart, mermaidId } from '../mermaid';
import type { EdgeStyle } from '../mermaid';
import type { ExtensionMapModel, ExtensionPoint, Pkg } from '../../model/types';

/**
 * How many flow nodes a point needs before its flow is worth a diagram: its consumers plus the
 * one-hop parents that are not themselves consumers. Below it, one sentence says the same thing.
 */
export const FLOW_DIAGRAM_MIN_NODES = 3;

/** Shortens a label for a diagram node; the Consumers table always carries the full name. */
const shorten = (s: string, max = 44): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** One node of a point's flow: a symbol, and the way it consumes the point if it does. */
type SymbolNode = {
  /** `<file>#<symbol>`, the consumer id scheme, so one symbol is always one node. */
  key: string;
  symbol: string;
  /** Present when the symbol queries or uses the point itself. */
  consumer?: PointConsumer;
};

/** The package a consumer belongs to, named as it is in prose. */
const consumerPkgName = (entry: PointConsumer, model: ExtensionMapModel): string => {
  const owner = model.packages.find((candidate) => candidate.name === entry.consumer.pkg);
  return owner ? pkgDisplayName(owner) : entry.consumer.pkg;
};

/** Sorts by package then symbol, on code points alone, so the order never depends on a locale. */
const byPkgThenSymbol = (model: ExtensionMapModel) => (a: PointConsumer, b: PointConsumer) => {
  const keyOf = (entry: PointConsumer): string =>
    `${consumerPkgName(entry, model)}\u0000${entry.consumer.symbol}`;
  const [left, right] = [keyOf(a), keyOf(b)];
  return left < right ? -1 : left > right ? 1 : 0;
};

/** The point's consumers in table (and node declaration) order: by package, then symbol. */
const orderedConsumers = (point: ExtensionPoint, model: ExtensionMapModel): PointConsumer[] =>
  consumersOf(model, point.id).toSorted(byPkgThenSymbol(model));

/**
 * Every node of the point's flow, consumers first in table order, then the one-hop parents that
 * consume nothing. A symbol that both consumes the point and renders another consumer is one node.
 */
const flowNodes = (consumers: PointConsumer[]): SymbolNode[] => {
  const nodes = new Map<string, SymbolNode>(
    consumers.map((entry) => [
      entry.consumer.id,
      { key: entry.consumer.id, symbol: entry.consumer.symbol, consumer: entry },
    ]),
  );
  const parents = new Map<string, SymbolNode>();
  consumers.forEach(({ consumer }) =>
    consumer.renderedIn.forEach((ref) => {
      const key = `${ref.loc.file}#${ref.symbol}`;
      if (!nodes.has(key)) {
        parents.set(key, { key, symbol: ref.symbol });
      }
    }),
  );
  return [...nodes.values(), ...parents.values()];
};

/** The contributor packages of a point, sorted, each with whether only a remote carries it. */
const contributorsOf = (
  point: ExtensionPoint,
  model: ExtensionMapModel,
): { name: string; pkg?: Pkg; federated: boolean }[] => {
  const entries = new Map(model.entries.map((entry) => [entry.id, entry]));
  const records = model.extensions.filter((record) => record.type === point.id);
  return [...new Set(records.map((record) => record.pkg))].toSorted().map((name) => {
    const own = records.filter((record) => record.pkg === name);
    // Dashed only when every entry that carries every one of the package's extensions is federated.
    const federated = own.every((record) => {
      const paths = record.entries.flatMap((id) => {
        const entry = entries.get(id);
        return entry ? [entry.path] : [];
      });
      return paths.length > 0 && paths.every((entryPath) => entryPath === 'federated');
    });
    return {
      name,
      pkg: model.packages.find((candidate) => candidate.name === name),
      federated,
    };
  });
};

/**
 * The `Consumers` table of one point: who queries or uses it, from where, how, and where each
 * consumer is itself rendered or called. It carries a link for every node of the flow diagram.
 */
const renderConsumersTable = (
  consumers: PointConsumer[],
  model: ExtensionMapModel,
  docPath: string,
): string | undefined =>
  consumers.length === 0
    ? undefined
    : joinBlocks([
        '**Consumers:**',
        table(
          ['Consumer', 'Package', 'Query', 'Uses', 'Rendered or called in'],
          consumers.map((entry) => [
            consumerLink(entry.consumer, docPath),
            consumerPkgName(entry, model),
            queryCell(entry.querySites, docPath),
            usesCell(entry.uses, docPath),
            renderedInCell(entry.consumer, docPath),
          ]),
        ),
      ]);

/**
 * The point's flow as a diagram: contributor packages → the point → its consumers → where each is
 * rendered or called. Point-to-consumer edges carry no label; the Consumers table has the detail.
 */
const renderFlowDiagram = (
  point: ExtensionPoint,
  model: ExtensionMapModel,
  nodes: SymbolNode[],
): string => {
  const chart = flowchart('LR');
  const pointNode = mermaidId(point.id);
  const contributors = contributorsOf(point, model);
  contributors.forEach(({ name, pkg }) =>
    chart.node(
      mermaidId(`pkg:${name}`),
      pkg ? `${pkgDisplayName(pkg)} (${pkg.kind})` : name,
      'box',
      'pkg',
    ),
  );
  chart.node(pointNode, point.id, 'point', 'point');
  contributors.forEach(({ name, federated }) => {
    const style: EdgeStyle = federated ? 'federated' : 'solid';
    chart.edge(mermaidId(`pkg:${name}`), pointNode, style);
  });

  const nodeId = (key: string): string => mermaidId(`symbol:${key}`);
  nodes.forEach((node) => {
    chart.node(nodeId(node.key), shorten(node.symbol), node.consumer ? 'box' : 'rounded');
    if (node.consumer) {
      chart.edge(pointNode, nodeId(node.key), 'solid');
    }
  });
  // One edge per (consumer, parent, how); the Consumers table keeps every reference line.
  const drawn = new Set<string>();
  nodes.forEach((node) =>
    (node.consumer?.consumer.renderedIn ?? []).forEach((ref) => {
      const to = nodeId(`${ref.loc.file}#${ref.symbol}`);
      const key = `${node.key}\0${to}\0${ref.how}`;
      if (drawn.has(key)) {
        return;
      }
      drawn.add(key);
      chart.edge(
        nodeId(node.key),
        to,
        'renderedIn',
        ref.how === 'call' ? 'called in' : 'rendered in',
      );
    }),
  );
  return chart.toString();
};

/** The point's flow in one sentence, for a flow too small to be worth a diagram. */
const renderFlowSentence = (
  point: ExtensionPoint,
  model: ExtensionMapModel,
  consumers: PointConsumer[],
): string => {
  const contributors = contributorsOf(point, model).map(({ name, pkg, federated }) => {
    const text = pkg ? pkgDisplayName(pkg) : name;
    return federated ? `${text} (federated)` : text;
  });
  const consumerText = consumers.map(
    (entry) => `${consumerPkgName(entry, model)} · ${symbolText(entry.consumer.symbol)}`,
  );
  const parents = [
    ...new Set(consumers.flatMap(({ consumer }) => consumer.renderedIn.map((ref) => ref.symbol))),
  ].toSorted();
  const flow = [
    contributors.length === 0 ? '(no contributors)' : contributors.join(', '),
    point.id,
    consumerText.length === 0 ? '(no consumers)' : consumerText.join(', '),
  ].join(' → ');
  return `**Flow:** ${flow}${parents.length === 0 ? '' : ` → rendered in ${parents.join(', ')}`}`;
};

/** Whether this point's flow is drawn as a diagram rather than written as a sentence. */
export const pointHasDiagram = (point: ExtensionPoint, model: ExtensionMapModel): boolean =>
  flowNodes(orderedConsumers(point, model)).length >= FLOW_DIAGRAM_MIN_NODES;

/**
 * One point's Consumers table and its flow: a diagram once the flow has enough nodes to be worth
 * one, a sentence otherwise. Nothing at all for a point with neither contributors nor consumers.
 */
export const renderPointFlow = (
  point: ExtensionPoint,
  model: ExtensionMapModel,
  docPath: string,
): string | undefined => {
  const consumers = orderedConsumers(point, model);
  const contributors = contributorsOf(point, model);
  if (consumers.length === 0 && contributors.length === 0) {
    return undefined;
  }
  const nodes = flowNodes(consumers);
  return joinBlocks([
    renderConsumersTable(consumers, model, docPath),
    nodes.length >= FLOW_DIAGRAM_MIN_NODES
      ? renderFlowDiagram(point, model, nodes)
      : renderFlowSentence(point, model, consumers),
  ]);
};
