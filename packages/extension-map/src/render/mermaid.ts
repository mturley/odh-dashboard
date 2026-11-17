import { Buffer } from 'node:buffer';

export type EdgeStyle = 'solid' | 'derived' | 'renderedIn' | 'federated' | 'suppress' | 'patch';
export type NodeShape = 'box' | 'point' | 'rounded';

const fnv1a = (value: string): string => {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(value, 'utf8')) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').slice(-6);
};

export const mermaidId = (key: string): string =>
  `n_${key.replace(/[^A-Za-z0-9_]/gu, '_')}_${fnv1a(key)}`;

export const mermaidLabel = (value: string): string =>
  value.replace(/"/gu, '#quot;').replace(/</gu, '#lt;').replace(/>/gu, '#gt;');

export const LEGEND_MD = [
  '- `-->` declared or type-resolved contribution',
  '- `==>` derived relationship',
  '- `-. "rendered in" .->` rendered in one hop',
  '- `-. "federated" .->` federated contribution',
  '- `--x` suppression',
  '- `-- "patch" -->` patch',
].join('\n');

export type Flowchart = {
  node: (id: string, label: string, shape: NodeShape, cls?: string) => Flowchart;
  edge: (from: string, to: string, style: EdgeStyle, label?: string) => Flowchart;
  subgraph: (id: string, label: string, render: (chart: Flowchart) => void) => Flowchart;
  toString: () => string;
};

export const flowchart = (direction: 'LR' | 'TB'): Flowchart => {
  const lines = [`flowchart ${direction}`];
  const chart: Flowchart = {
    node: (id, label, shape, cls) => {
      const safeId = id.replace(/[^A-Za-z0-9_]/gu, '_');
      const escaped = mermaidLabel(label);
      const shaped =
        shape === 'box'
          ? `["${escaped}"]`
          : shape === 'point'
          ? `(("${escaped}"))`
          : `("${escaped}")`;
      lines.push(
        `  ${safeId}${shaped}${
          cls === undefined ? '' : `:::${cls.replace(/[^A-Za-z0-9_]/gu, '_')}`
        }`,
      );
      return chart;
    },
    edge: (from, to, style, label) => {
      const source = from.replace(/[^A-Za-z0-9_]/gu, '_');
      const target = to.replace(/[^A-Za-z0-9_]/gu, '_');
      const escapedLabel = label === undefined ? undefined : mermaidLabel(label);
      const connector =
        style === 'solid'
          ? escapedLabel === undefined
            ? '-->'
            : `-->|${escapedLabel}|`
          : style === 'derived'
          ? escapedLabel === undefined
            ? '==>'
            : `==>|${escapedLabel}|`
          : style === 'renderedIn'
          ? `-. "${escapedLabel ?? 'rendered in'}" .->`
          : style === 'federated'
          ? `-. "${escapedLabel ?? 'federated'}" .->`
          : style === 'suppress'
          ? escapedLabel === undefined
            ? '--x'
            : `--x|${escapedLabel}|`
          : `-- "${escapedLabel ?? 'patch'}" -->`;
      lines.push(`  ${source} ${connector} ${target}`);
      return chart;
    },
    subgraph: (id, label, render) => {
      lines.push(`  subgraph ${id.replace(/[^A-Za-z0-9_]/gu, '_')}["${mermaidLabel(label)}"]`);
      render(chart);
      lines.push('  end');
      return chart;
    },
    toString: () => lines.join('\n'),
  };
  return chart;
};
