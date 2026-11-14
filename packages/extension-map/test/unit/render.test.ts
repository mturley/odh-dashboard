import { docPathFor, pkgDisplayName, pointLink, relLink } from '../../src/render/links';
import { HEADER, defList, escapeCell, githubAnchor, table } from '../../src/render/markdown';
import { flowchart, mermaidId, mermaidLabel } from '../../src/render/mermaid';
import { renderPackagePage } from '../../src/render/packagePage';
import { renderAll } from '../../src/render/renderAll';
import { emptyModel } from '../../src/model/sort';
import type { ExtensionMapModel, ExtensionRecord, Pkg } from '../../src/model/types';

const definer: Pkg = {
  name: '@odh-dashboard/definer',
  dir: 'packages/definer',
  kind: 'package',
  docsDir: 'packages/definer/docs',
  upstreamDirs: [],
};

const contributor: Pkg = {
  name: '@odh-dashboard/contributor',
  dir: 'packages/contributor',
  kind: 'package',
  docsDir: 'packages/contributor/docs',
  upstreamDirs: [],
};

const POINT_ID = 'demo.thing/slot';

const record = (id: string, extra: Partial<ExtensionRecord> = {}): ExtensionRecord => ({
  key: `packages/contributor/extensions.ts:${id}`,
  type: POINT_ID,
  pkg: contributor.name,
  loc: { file: 'packages/contributor/extensions.ts', line: 10 },
  entries: ['@odh-dashboard/contributor#./extensions'],
  apps: [],
  flags: { required: [], disallowed: [] },
  properties: { id: { kind: 'literal', value: id } },
  ...extra,
});

const fixtureModel = (): ExtensionMapModel => ({
  ...emptyModel(),
  packages: [contributor, definer],
  entries: [
    {
      id: '@odh-dashboard/contributor#./extensions',
      pkg: contributor.name,
      file: 'packages/contributor/extensions.ts',
      path: 'static',
      key: './extensions',
    },
  ],
  points: [
    {
      id: POINT_ID,
      pkg: definer.name,
      typeName: 'SlotExtension',
      loc: { file: 'packages/definer/src/points.ts', line: 4, endLine: 12 },
      typeParams: ['T'],
      guards: ['isSlotExtension'],
      doc: {
        summary: 'A slot in the thing.',
        see: [],
        links: ['OtherExtension'],
        extensionData: [],
      },
      properties: [
        { name: 'id', optional: false, typeText: 'string', doc: 'The slot id.' },
        {
          name: 'component',
          optional: true,
          typeText: 'CodeRef<React.FC>',
          codeRef: { inner: 'React.FC' },
        },
      ],
    },
  ],
  extensions: [
    record('one', {
      flags: {
        required: [{ kind: 'enumMember', enumName: 'SupportedArea', member: 'A', value: 'a' }],
        disallowed: [{ kind: 'literal', value: 'ADMIN_USER' }],
      },
      properties: {
        id: { kind: 'constant', name: 'ONE_ID', value: 'one' },
        component: {
          kind: 'codeRef',
          module: 'packages/contributor/src/Thing.tsx',
          export: 'Thing',
          target: { file: 'packages/contributor/src/Thing.tsx', line: 7 },
          supplies: { title: { kind: 'literal', value: 'Thing' } },
        },
      },
    }),
    record('two', {
      properties: {
        id: { kind: 'literal', value: 'two' },
        component: {
          kind: 'unresolved',
          reason: 'CallExpression is not a resolvable value',
          loc: { file: 'packages/contributor/extensions.ts', line: 22 },
        },
      },
    }),
  ],
  diagnostics: [
    {
      code: 'unresolved-value',
      severity: 'warning',
      message: 'Cannot resolve the component of the second extension.',
      loc: { file: 'packages/contributor/extensions.ts', line: 22 },
      pkg: contributor.name,
    },
  ],
});

/** Mermaid blocks on a page that are not followed by a table carrying a link per node. */
const diagramsWithoutNodeTable = (content: string): string[] => {
  const blocks = content.split('```mermaid').slice(1);
  return blocks
    .filter((block) => {
      const after = block.slice(block.indexOf('```') + 3).split(/^#/m)[0];
      return !after.includes('| Node | What | Link |');
    })
    .map((block) => block.split('\n')[1]);
};

describe('markdown primitives', () => {
  it('computes GitHub anchors', () => {
    expect(githubAnchor('model-serving.platform/exclude-deployment')).toBe(
      'model-servingplatformexclude-deployment',
    );
    expect(githubAnchor('Contributes to app.route')).toBe('contributes-to-approute');
  });

  it('escapes mermaid and table text', () => {
    expect(mermaidLabel('a<"b">')).toBe('a#lt;#quot;b#quot;#gt;');
    expect(mermaidId('model-serving.platform/x')).toMatch(
      /^n_model_serving_platform_x_[0-9a-f]{6}$/,
    );
    expect(escapeCell('a|b\nc')).toBe('a\\|b<br>c');
  });

  it('gives the same mermaid id to the same key and different ids to different keys', () => {
    expect(mermaidId('a.b')).toBe(mermaidId('a.b'));
    expect(mermaidId('a.b')).not.toBe(mermaidId('a_b'));
  });

  it('renders tables and definition lists', () => {
    expect(table(['A', 'B'], [['1', '2']])).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(
      defList([
        ['A', '1'],
        ['B', '2'],
      ]),
    ).toBe('- **A:** 1\n- **B:** 2');
  });

  it('starts the header with the auto-generated comment', () => {
    expect(HEADER.split('\n')[0]).toBe(
      '<!-- AUTO-GENERATED by @odh-dashboard/extension-map. Do not edit by hand. -->',
    );
    expect(HEADER).toContain('> Generated file. Regenerate with `pnpm docs:extension-map`.');
  });
});

describe('links', () => {
  it('builds relative line links', () => {
    const loc = { file: 'packages/kserve/src/deployments.ts', line: 36 };
    const link = relLink('packages/kserve/docs/extensions.md', loc, 'useWatchDeployments');
    expect(link).toBe('[useWatchDeployments](../src/deployments.ts#L36)');
  });

  it('renders a line range when a declaration spans lines', () => {
    const loc = { file: 'packages/x/src/a.ts', line: 4, endLine: 9 };
    expect(relLink('packages/x/docs/extensions.md', loc, 'A')).toBe('[A](../src/a.ts#L4-L9)');
  });

  it('links a point to the defining package page, and to an anchor on its own page', () => {
    const model = fixtureModel();
    const [point] = model.points;
    expect(pointLink('packages/contributor/docs/extensions.md', point, model)).toBe(
      `[${POINT_ID}](../../definer/docs/extensions.md#demothingslot)`,
    );
    expect(pointLink('packages/definer/docs/extensions.md', point, model)).toBe(
      `[${POINT_ID}](#demothingslot)`,
    );
  });

  it('names packages without the scope, and the core app by where it lives', () => {
    expect(pkgDisplayName(contributor)).toBe('contributor');
    expect(
      pkgDisplayName({ ...contributor, name: '@odh-dashboard/internal', docsDir: 'frontend/docs' }),
    ).toBe('frontend (core app)');
    expect(docPathFor(contributor)).toBe('packages/contributor/docs/extensions.md');
  });
});

describe('mermaid flowchart', () => {
  it('declares nodes, edges and subgraphs with the styles of the legend', () => {
    const chart = flowchart('LR');
    chart.node('a', 'A', 'box', 'pkg');
    chart.subgraph('ns', 'demo', () => {
      chart.node('b', 'B', 'point');
    });
    chart.edge('a', 'b', 'federated');
    const out = chart.toString();
    expect(out.split('\n')[1]).toBe('flowchart LR');
    expect(out).toContain('classDef pkg stroke-width:2px');
    expect(out).toContain('a["A"]:::pkg');
    expect(out).toContain('subgraph ns ["demo"]');
    expect(out).toContain('b(["B"])');
    expect(out).toContain('a -. "federated" .-> b');
  });

  it('refuses an edge to a node that was never declared', () => {
    const chart = flowchart('TB');
    chart.node('a', 'A', 'box');
    expect(() => chart.edge('a', 'missing', 'solid')).toThrow(/undeclared/);
  });
});

describe('renderPackagePage', () => {
  it('follows every diagram with a node link table', () => {
    expect(
      diagramsWithoutNodeTable(renderPackagePage(fixtureModel(), contributor).content),
    ).toEqual([]);
  });

  it('emits no ts or js fences', () => {
    expect(renderPackagePage(fixtureModel(), contributor).content).not.toMatch(
      /```(js|jsx|ts|tsx)\b/,
    );
  });

  it('starts every page with the header', () => {
    renderAll(fixtureModel()).forEach((file) => {
      expect(file.content.startsWith(HEADER)).toBe(true);
    });
  });

  it('renders the defining page with properties, implemented-by links and no Contributes', () => {
    const page = renderPackagePage(fixtureModel(), definer);
    expect(page.path).toBe('packages/definer/docs/extensions.md');
    expect(page.content).toContain(`### ${POINT_ID}`);
    expect(page.content).toContain('Declared as [SlotExtension](../src/points.ts#L4-L12)');
    expect(page.content).toContain('| `component` | — | `CodeRef<React.FC>` | `React.FC` |');
    expect(page.content).toContain(
      '**Implemented by:** [contributor](../../contributor/docs/extensions.md#contributes-to-demothingslot)',
    );
    expect(page.content).not.toContain('## Contributes');
  });

  it('marks a point nothing contributes as unused', () => {
    const model = fixtureModel();
    model.extensions = [];
    expect(renderPackagePage(model, definer).content).toContain('> **Unused.**');
  });

  it('renders values, flags, CodeRef targets, supplies and what is not resolved', () => {
    const { content } = renderPackagePage(fixtureModel(), contributor);
    expect(content).toContain('#### Contributes to demo.thing/slot');
    expect(content).toContain("`ONE_ID` (`'one'`)");
    expect(content).toContain("`SupportedArea.A` (`'a'`)");
    expect(content).toContain('`ADMIN_USER`');
    expect(content).toContain('[Thing#Thing](../src/Thing.tsx#L7)');
    expect(content).toContain("| one | title | `'Thing'` |");
    expect(content).toContain('[not resolved](../extensions.ts#L22)');
    expect(content).toContain('**Not resolved**');
    expect(content).toContain('## Diagnostics');
    expect(content).toContain('| `unresolved-value` | warning |');
  });

  it('collapses five or more extensions of one point into one node', () => {
    const model = fixtureModel();
    model.extensions = ['a', 'b', 'c', 'd', 'e'].map((id) => record(id));
    const { content } = renderPackagePage(model, contributor);
    expect(content).toContain('("×5"):::collapsed');
    expect(content).toContain('| ×5 | 5 extensions of demo.thing/slot |');
    // The adjacent table is still complete.
    ['a', 'b', 'c', 'd', 'e'].forEach((id) => expect(content).toContain(`\`'${id}'\``));
  });

  it('draws a federated contribution with the federated edge style', () => {
    const model = fixtureModel();
    model.entries = [{ ...model.entries[0], path: 'federated' }];
    const { content } = renderPackagePage(model, contributor);
    expect(content).toContain('-. "federated" .->');
    expect(content).toContain('loaded at runtime by the host as a Module Federation remote');
  });

  it('omits empty sections and the legend when there is no diagram', () => {
    const page = renderPackagePage(fixtureModel(), definer);
    expect(page.content).not.toContain('## Loading paths');
    expect(page.content).not.toContain('## Diagnostics');
    expect(page.content).not.toContain('## Legend');
    expect(renderPackagePage(fixtureModel(), contributor).content).toContain('## Legend');
  });

  it('renders a page only for packages that define or contribute', () => {
    const model = fixtureModel();
    model.packages = [
      ...model.packages,
      {
        ...definer,
        name: '@odh-dashboard/idle',
        dir: 'packages/idle',
        docsDir: 'packages/idle/docs',
      },
    ];
    expect(renderAll(model).map((file) => file.path)).toEqual([
      'packages/contributor/docs/extensions.md',
      'packages/definer/docs/extensions.md',
    ]);
  });
});
