/** How an edge is drawn. Only proven edges are ever passed here (spec §4.4). */
export type EdgeStyle = 'solid' | 'derived' | 'renderedIn' | 'federated' | 'suppress' | 'patch';

export type NodeShape = 'box' | 'point' | 'rounded';

/** Node classes the builder knows how to declare. Styling stays theme-neutral. */
const CLASS_DEFS: Record<string, string> = {
  pkg: 'stroke-width:2px',
  point: 'stroke-width:1px',
  collapsed: 'stroke-dasharray: 5 5',
};

/** 32-bit FNV-1a, so one key always gets the same node id. */
const fnv1a = (key: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/** A Mermaid-safe node id for a key, unique per key and stable across runs. */
export const mermaidId = (key: string): string =>
  `n_${key.replace(/[^A-Za-z0-9_]/g, '_')}_${fnv1a(key).toString(16).padStart(6, '0').slice(-6)}`;

/** Escapes the characters that end a quoted Mermaid label. */
export const mermaidLabel = (s: string): string =>
  s.replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;');

const wrapShape = (id: string, label: string, shape: NodeShape): string => {
  const text = `"${mermaidLabel(label)}"`;
  if (shape === 'point') {
    return `${id}([${text}])`;
  }
  return shape === 'rounded' ? `${id}(${text})` : `${id}[${text}]`;
};

const connector = (style: EdgeStyle, label?: string): string => {
  switch (style) {
    case 'derived':
      return label ? `== "${mermaidLabel(label)}" ==>` : '==>';
    case 'renderedIn':
      return `-. "${mermaidLabel(label ?? 'rendered in')}" .->`;
    case 'federated':
      return `-. "${mermaidLabel(label ?? 'federated')}" .->`;
    case 'suppress':
      return label ? `-- "${mermaidLabel(label)}" --x` : '--x';
    case 'patch':
      return `-- "${mermaidLabel(label ?? 'patch')}" -->`;
    default:
      return label ? `-- "${mermaidLabel(label)}" -->` : '-->';
  }
};

export type Flowchart = {
  /** Declares a node once; a repeated id keeps the first declaration. */
  node: (id: string, label: string, shape: NodeShape, cls?: string) => void;
  edge: (a: string, b: string, style: EdgeStyle, label?: string) => void;
  /** Declares everything `fn` adds inside a subgraph. */
  subgraph: (id: string, label: string, fn: () => void) => void;
  /** The fenced `mermaid` block. */
  toString: () => string;
};

/** A `flowchart` builder that emits a complete, parseable Mermaid block. */
export const flowchart = (dir: 'LR' | 'TB'): Flowchart => {
  const lines: string[] = [];
  const declared = new Set<string>();
  const classes = new Set<string>();
  let depth = 0;
  const push = (line: string): void => {
    lines.push(`${'  '.repeat(depth + 1)}${line}`);
  };

  return {
    node: (id, label, shape, cls) => {
      if (declared.has(id)) {
        return;
      }
      declared.add(id);
      if (cls !== undefined) {
        if (!(cls in CLASS_DEFS)) {
          throw new Error(`Unknown Mermaid node class '${cls}'`);
        }
        classes.add(cls);
      }
      push(`${wrapShape(id, label, shape)}${cls === undefined ? '' : `:::${cls}`}`);
    },
    edge: (a, b, style, label) => {
      if (!declared.has(a) || !declared.has(b)) {
        throw new Error(`Mermaid edge between undeclared nodes: ${a} -> ${b}`);
      }
      push(`${a} ${connector(style, label)} ${b}`);
    },
    subgraph: (id, label, fn) => {
      push(`subgraph ${id} ["${mermaidLabel(label)}"]`);
      depth += 1;
      fn();
      depth -= 1;
      push('end');
    },
    toString: () =>
      [
        '```mermaid',
        `flowchart ${dir}`,
        ...[...classes].toSorted().map((cls) => `  classDef ${cls} ${CLASS_DEFS[cls]}`),
        ...lines,
        '```',
      ].join('\n'),
  };
};

/** The edge styles a reader needs to know, for every page that has a diagram. */
export const LEGEND_MD = [
  '## Legend',
  '',
  '| Edge | Meaning |',
  '| --- | --- |',
  '| `A --> B` | Declared in code, or resolved by the type checker. |',
  '| `A ==> B` | Derived: proven through a type or a JSDoc tag rather than a direct reference. |',
  '| `A -. "rendered in" .-> B` | B renders A (one hop). |',
  '| `A -. "federated" .-> B` | A reaches B through a Module Federation remote loaded at runtime. |',
  '| `A --x B` | A suppresses B. |',
  '| `A -- "patch" --> B` | A patches B. |',
  '',
  'Nodes drawn with a dashed border collapse several extensions of the same point; the table',
  'beside the diagram always lists every one of them. Anything the analysis could not resolve is',
  'never drawn — it is listed in a "Not resolved" table instead.',
].join('\n');
