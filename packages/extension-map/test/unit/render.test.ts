import { docPathFor, docsDirFor, pkgDisplayName, pointLink, relLink } from '../../src/render/links';
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
  upstreamDirs: [],
};

const contributor: Pkg = {
  name: '@odh-dashboard/contributor',
  dir: 'packages/contributor',
  kind: 'package',
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
  it('puts package docs next to the package, and the core app docs in frontend', () => {
    expect(docsDirFor({ name: '@fx/a', dir: 'packages/a' })).toBe('packages/a/docs');
    expect(docsDirFor({ name: '@odh-dashboard/internal', dir: 'frontend/src' })).toBe(
      'frontend/docs',
    );
    expect(docPathFor(contributor)).toBe('packages/contributor/docs/extensions.md');
  });

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
      pkgDisplayName({ ...contributor, name: '@odh-dashboard/internal', dir: 'frontend/src' }),
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
  it('labels the package node with its kind, so an extension cannot share its label', () => {
    const model = fixtureModel();
    model.extensions = [record('contributor')];
    const { content } = renderPackagePage(model, contributor);
    expect(content).toContain('["contributor (package)"]:::pkg');
    expect(content).toContain('| contributor (package) | this package |');
  });

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

  it('marks a point the analysis reported unused, and draws no flow for it', () => {
    const model = fixtureModel();
    model.extensions = [];
    model.diagnostics = [
      {
        code: 'point-unused',
        severity: 'info',
        message: `Nothing in this repository contributes an extension of '${POINT_ID}' or queries or uses it.`,
        loc: { file: 'packages/definer/src/points.ts', line: 4 },
        pkg: definer.name,
      },
    ];
    const { content } = renderPackagePage(model, definer);
    expect(content).toContain('> **Unused.**');
    expect(content).not.toContain('```mermaid');
  });

  it('renders values, flags, CodeRef targets, supplies and what is not resolved', () => {
    const { content } = renderPackagePage(fixtureModel(), contributor);
    expect(content).toContain('#### Contributes to demo.thing/slot');
    expect(content).toContain("`ONE_ID` (`'one'`)");
    expect(content).toContain("`SupportedArea.A` (`'a'`)");
    expect(content).toContain('`ADMIN_USER`');
    expect(content).toContain('[Thing#Thing](../src/Thing.tsx#L7)');
    // A property any contribution sets as a code reference never becomes a data column too,
    // so an em dash always means "this contribution does not set the property".
    expect(content).not.toContain('| id | component |');
    expect(content).toContain(
      '| `component`: [not resolved](../extensions.ts#L22) | [extensions.ts](../extensions.ts#L10) |',
    );
    expect(content).toContain("| one | title | `'Thing'` |");
    expect(content).toContain('[not resolved](../extensions.ts#L22)');
    expect(content).toContain('**Not resolved**');
    expect(content).toContain(
      '| two | component | CallExpression is not a resolvable value | [extensions.ts:22](../extensions.ts#L22) |',
    );
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
    const model = fixtureModel();
    model.extensions = [];
    const page = renderPackagePage(model, definer);
    expect(page.content).not.toContain('## Loading paths');
    expect(page.content).not.toContain('## Diagnostics');
    expect(page.content).not.toContain('## Legend');
    expect(renderPackagePage(fixtureModel(), contributor).content).toContain('## Legend');
  });

  it('counts the extensions a mapped record stands for in the collapse label', () => {
    const model = fixtureModel();
    model.extensions = [
      record('a'),
      record('b'),
      record('c'),
      record('d'),
      record('e', {
        multiplicity: 3,
        mappedValues: [
          { kind: 'literal', value: '/one' },
          { kind: 'literal', value: '/two' },
          { kind: 'literal', value: '/three' },
        ],
      }),
    ];
    const { content } = renderPackagePage(model, contributor);
    expect(content).toContain('("×7"):::collapsed');
    expect(content).toContain('| ×7 | 7 extensions of demo.thing/slot |');
    expect(content).toContain("| `×3` `'e'` |");
  });

  it('marks an uncounted record with a plus and says "at least"', () => {
    const model = fixtureModel();
    model.extensions = [
      record('a'),
      record('b'),
      record('c'),
      record('d'),
      record('e', { multiplicity: 'unknown' }),
    ];
    const { content } = renderPackagePage(model, contributor);
    expect(content).toContain('("×5+"):::collapsed');
    expect(content).toContain('| ×5+ | at least 5 extensions of demo.thing/slot |');
  });

  it('gives each contribution its own heading in the definition-list path', () => {
    const model = fixtureModel();
    const wide = (id: string): ExtensionRecord =>
      record(id, {
        flags: { required: [{ kind: 'literal', value: 'AREA' }], disallowed: [] },
        properties: {
          id: { kind: 'literal', value: id },
          a: { kind: 'literal', value: 1 },
          b: { kind: 'literal', value: 2 },
          c: { kind: 'literal', value: 3 },
          d: { kind: 'literal', value: 4 },
          e: { kind: 'literal', value: 5 },
          f: { kind: 'literal', value: 6 },
        },
      });
    model.extensions = [wide('first'), wide('second')];
    const { content } = renderPackagePage(model, contributor);
    expect(content).toContain('##### first');
    expect(content).toContain('##### second');
    expect(content.match(/^##### /gm)).toHaveLength(2);
  });

  it('draws exactly one edge per extension, dashed only when every entry is federated', () => {
    const model = fixtureModel();
    model.entries = [
      model.entries[0],
      {
        id: '@odh-dashboard/contributor#mf:./extensions',
        pkg: contributor.name,
        file: 'packages/contributor/frontend/src/odh/extensions.ts',
        path: 'federated',
        key: 'mf:./extensions',
      },
    ];
    model.extensions = [
      record('both', {
        entries: [
          '@odh-dashboard/contributor#./extensions',
          '@odh-dashboard/contributor#mf:./extensions',
        ],
      }),
      record('remote-only', { entries: ['@odh-dashboard/contributor#mf:./extensions'] }),
    ];
    const { content } = renderPackagePage(model, contributor);
    const pkgNode = mermaidId(contributor.name);
    const edges = content
      .split('\n')
      .filter((line) => line.trim().startsWith(`${pkgNode} `))
      .map((line) => line.trim());
    expect(edges).toHaveLength(2);
    expect(edges[0]).toContain(
      `${pkgNode} --> ${mermaidId('packages/contributor/extensions.ts:both')}`,
    );
    expect(edges[1]).toContain(
      `${pkgNode} -. "federated" .-> ${mermaidId(
        'packages/contributor/extensions.ts:remote-only',
      )}`,
    );
    expect(content).toContain('| both | extension of demo.thing/slot — bundled and federated |');
    expect(content).toContain('| remote-only | extension of demo.thing/slot — federated |');
  });

  it('names a contribution that names itself nowhere after the point and its position', () => {
    const model = fixtureModel();
    model.extensions = [
      record('x', { properties: { step: { kind: 'literal', value: 'first' } } }),
      record('y', { properties: { step: { kind: 'literal', value: 'second' } } }),
    ];
    const { content } = renderPackagePage(model, contributor);
    expect(content).toContain('["slot #1"]');
    expect(content).toContain('["slot #2"]');
    expect(content).not.toMatch(/\["line \d+"\]/);
  });

  it('renders a page only for packages that define or contribute', () => {
    const model = fixtureModel();
    model.packages = [
      ...model.packages,
      {
        ...definer,
        name: '@odh-dashboard/idle',
        dir: 'packages/idle',
      },
    ];
    expect(renderAll(model).map((file) => file.path)).toEqual([
      'packages/contributor/docs/extensions.md',
      'packages/definer/docs/extensions.md',
    ]);
  });

  it('names a contribution by its id, then its binding, then its CodeRef export', () => {
    const model = fixtureModel();
    const component = {
      kind: 'codeRef' as const,
      module: 'packages/contributor/src/Thing.tsx',
      export: 'Thing',
      target: { file: 'packages/contributor/src/Thing.tsx', line: 7 },
    };
    model.extensions = [
      record('a', { binding: 'idWins', properties: { id: { kind: 'literal', value: 'a' } } }),
      record('b', { binding: 'bindingWins', properties: { component } }),
      record('c', { properties: { component } }),
      record('d', { properties: { step: { kind: 'literal', value: 'x' } } }),
    ];
    const { content } = renderPackagePage(model, contributor);
    expect(content).toContain('["a"]');
    expect(content).toContain('["bindingWins"]');
    expect(content).toContain('["Thing"]');
    expect(content).toContain('["slot #4"]');
    expect(content).not.toContain('idWins');
  });

  it('uses the binding label in the Supplies and Not resolved tables', () => {
    const model = fixtureModel();
    model.extensions = [
      record('a', {
        binding: 'myFormData',
        properties: {
          extract: {
            kind: 'codeRef',
            module: 'packages/contributor/src/extract.ts',
            export: 'extract',
            target: { file: 'packages/contributor/src/extract.ts', line: 3 },
            supplies: { mode: { kind: 'literal', value: 'fast' } },
          },
          other: {
            kind: 'unresolved',
            reason: 'CallExpression is not a resolvable value',
            loc: { file: 'packages/contributor/extensions.ts', line: 30 },
          },
        },
      }),
    ];
    const { content } = renderPackagePage(model, contributor);
    expect(content).toContain("| myFormData | mode | `'fast'` |");
    expect(content).toContain('| myFormData | other | CallExpression is not a resolvable value |');
  });

  it('names the declaring file in a CodeRef link, and the imported module when they differ', () => {
    const model = fixtureModel();
    model.extensions = [
      record('a', {
        properties: {
          id: { kind: 'literal', value: 'a' },
          paths: {
            kind: 'codeRef',
            module: 'packages/contributor/src/hardware.ts',
            export: 'PATHS',
            target: { file: 'packages/shared/const.ts', line: 18, endLine: 23 },
          },
        },
      }),
      record('b', {
        properties: {
          id: { kind: 'literal', value: 'b' },
          paths: {
            kind: 'codeRef',
            module: 'packages/contributor/src/missing.ts',
            export: 'PATHS',
          },
        },
      }),
    ];
    const { content } = renderPackagePage(model, contributor);
    expect(content).toContain('[const#PATHS](../../shared/const.ts#L18-L23) (via `hardware`)');
    expect(content).toContain('`missing#PATHS`');
    expect(content).not.toContain('(via `missing`)');
  });

  it('renders a reference to a code-like constant as a link marked as code', () => {
    const model = fixtureModel();
    model.extensions = [
      record('a', {
        properties: {
          id: { kind: 'literal', value: 'a' },
          schema: {
            kind: 'reference',
            name: 'timeoutFieldSchema',
            loc: { file: 'packages/contributor/src/schema.ts', line: 5 },
          },
        },
      }),
    ];
    const { content } = renderPackagePage(model, contributor);
    expect(content).toContain('[timeoutFieldSchema](../src/schema.ts#L5) (code)');
    expect(content).not.toContain('**Not resolved**');
  });

  it('marks a reference nested in an object value as code', () => {
    const model = fixtureModel();
    model.extensions = [
      record('a', {
        properties: {
          id: { kind: 'literal', value: 'a' },
          reducers: {
            kind: 'object',
            props: {
              validationSchema: {
                kind: 'reference',
                name: 'timeoutFieldSchema',
                loc: { file: 'packages/contributor/src/schema.ts', line: 5 },
              },
            },
          },
        },
      }),
    ];
    const { content } = renderPackagePage(model, contributor);
    expect(content).toContain('`{ validationSchema: timeoutFieldSchema (code) }`');
  });

  it('names the apps that include each contribution, with conditional ones marked', () => {
    const model = fixtureModel();
    model.apps = [{ id: 'host', entries: [], featureFlags: {} }];
    model.extensions = [
      record('a', {
        apps: [
          { app: 'host', via: '@odh-dashboard/contributor#./extensions' },
          { app: 'rhaii', via: '@odh-dashboard/contributor#mf:./extensions', conditional: true },
        ],
      }),
      record('b'),
    ];
    const { content } = renderPackagePage(model, contributor);
    expect(content).toContain('| id | Included in | Source |');
    expect(content).toContain("| `'a'` | host, rhaii (conditional) |");
    expect(content).toContain("| `'b'` | — |");
  });

  it('shows no Included in column when the model has no apps', () => {
    expect(renderPackagePage(fixtureModel(), contributor).content).not.toContain('Included in');
  });

  it('notes each override under the contribution it targets, linking the override', () => {
    const model = fixtureModel();
    const target = record('a');
    const patchTarget = record('b');
    model.apps = [{ id: 'portal', entries: [], featureFlags: {} }];
    model.extensions = [
      target,
      patchTarget,
      {
        ...record('s'),
        key: 'distributions/portal/src/extensions.ts:1',
        type: 'app.suppress',
        loc: { file: 'distributions/portal/src/extensions.ts', line: 4 },
      },
      {
        ...record('p'),
        key: 'distributions/portal/src/extensions.ts:2',
        type: 'app.patch',
        loc: { file: 'distributions/portal/src/extensions.ts', line: 9 },
      },
    ];
    model.overrides = [
      {
        kind: 'suppress',
        app: 'portal',
        by: 'distributions/portal/src/extensions.ts:1',
        targetType: { kind: 'literal', value: POINT_ID },
        targetId: { kind: 'literal', value: 'a' },
        targets: [target.key],
        effect: 'removed',
      },
      {
        kind: 'patch',
        app: 'portal',
        by: 'distributions/portal/src/extensions.ts:2',
        targetType: { kind: 'literal', value: POINT_ID },
        targetId: { kind: 'literal', value: 'b' },
        targets: [patchTarget.key],
        effect: 'applied',
        patch: { group: { kind: 'literal', value: 'g' }, href: { kind: 'literal', value: '/h' } },
        ignoredKeys: ['href'],
      },
    ];
    const { content } = renderPackagePage(model, contributor);
    expect(content).toContain('**Suppressed / patched in**');
    expect(content).toContain(
      '| a | portal | suppressed | [extensions.ts:4](../../../distributions/portal/src/extensions.ts#L4) |',
    );
    expect(content).toContain(
      "| b | portal | patched if in use: `group` = `'g'` (ignored: `href`) | [extensions.ts:9](../../../distributions/portal/src/extensions.ts#L9) |",
    );
  });
});

describe('consumer side', () => {
  const user: Pkg = {
    name: '@odh-dashboard/user',
    dir: 'packages/user',
    kind: 'package',
    upstreamDirs: [],
  };
  const SLOT_ID = 'packages/user/src/Slot.tsx#Slot';

  const consumerModel = (): ExtensionMapModel => {
    const model = fixtureModel();
    model.packages = [contributor, definer, user];
    model.consumers = [
      {
        id: SLOT_ID,
        pkg: user.name,
        symbol: 'Slot',
        loc: { file: 'packages/user/src/Slot.tsx', line: 5, endLine: 20 },
        renderedIn: [
          { symbol: 'Page', loc: { file: 'packages/user/src/Page.tsx', line: 12 }, how: 'jsx' },
        ],
      },
    ];
    model.querySites = [
      {
        consumer: SLOT_ID,
        pointIds: [POINT_ID],
        hook: 'useExtensions',
        resolved: false,
        loc: { file: 'packages/user/src/Slot.tsx', line: 6 },
        provenance: 'type-resolved',
      },
    ];
    model.useSites = [
      {
        consumer: SLOT_ID,
        pointId: POINT_ID,
        path: 'properties.component',
        kind: 'lazy-render',
        direct: true,
        loc: { file: 'packages/user/src/Slot.tsx', line: 14 },
        provenance: 'type-resolved',
      },
    ];
    return model;
  };

  it('links the consuming packages from the definition, presence only', () => {
    expect(renderPackagePage(consumerModel(), definer).content).toContain(
      '**Consumed in:** [user](../../user/docs/extensions.md#consumes-demothingslot)',
    );
  });

  it('draws contributors, the point, consumers and where they are rendered, with a node table', () => {
    const { content } = renderPackagePage(consumerModel(), definer);
    const flow = content.slice(content.indexOf('```mermaid'));
    expect(flow).toContain(`${mermaidId(`pkg:${contributor.name}`)} --> ${mermaidId(POINT_ID)}`);
    expect(flow).toContain(
      `${mermaidId(POINT_ID)} -- "useExtensions, lazy-render" --> ${mermaidId(
        `consumer:${SLOT_ID}`,
      )}`,
    );
    expect(flow).toContain(
      `${mermaidId(`consumer:${SLOT_ID}`)} -. "rendered in" .-> ${mermaidId(
        'renderer:packages/user/src/Page.tsx#Page',
      )}`,
    );
    expect(flow).not.toContain('click ');
    expect(diagramsWithoutNodeTable(content)).toEqual([]);
    expect(content).toContain(
      '| Slot | consumer in @odh-dashboard/user — useExtensions, lazy-render | [Slot](../../user/src/Slot.tsx#L5-L20) |',
    );
    expect(content).toContain(
      '| Page | renders Slot (one hop up) | Page ([Page.tsx:12](../../user/src/Page.tsx#L12)) |',
    );
    expect(content).toContain('## Legend');
  });

  it('lists what the analysis could not resolve about a point next to its diagram', () => {
    const model = consumerModel();
    model.diagnostics = [
      {
        code: 'point-id-literal',
        severity: 'warning',
        message: `The string '${POINT_ID}' names an extension point outside its declaration and outside an extension.`,
        loc: { file: 'packages/user/src/odd.ts', line: 3 },
        pkg: user.name,
      },
      ...model.diagnostics,
    ];
    // The unresolved value sits inside the second extension's declaration.
    model.extensions = model.extensions.map((ext) => ({
      ...ext,
      loc: { ...ext.loc, endLine: 25 },
    }));
    const { content } = renderPackagePage(model, definer);
    expect(content).toContain('| `point-id-literal` |');
    expect(content).toContain('| `unresolved-value` | Cannot resolve the component');
  });

  it('renders the Consumes section of the consuming package', () => {
    const page = renderPackagePage(consumerModel(), user);
    expect(page.content).toContain('### Consumes demo.thing/slot');
    expect(page.content).toContain(
      '| [Slot](../src/Slot.tsx#L5-L20) | [useExtensions](../src/Slot.tsx#L6) | `properties.component` — lazy-render, direct ([Slot.tsx:14](../src/Slot.tsx#L14)) | Page ([Page.tsx:12](../src/Page.tsx#L12)) |',
    );
    expect(renderAll(consumerModel()).map((file) => file.path)).toContain(
      'packages/user/docs/extensions.md',
    );
  });

  it('links {@link X} to the point whose type is X, and keeps other names as code', () => {
    const model = consumerModel();
    model.points = [
      ...model.points.map((point) => ({
        ...point,
        doc: {
          ...point.doc,
          summary: 'Like {@link SlotExtension | the slot} and {@link Missing}.',
          links: ['SlotExtension', 'Missing'],
        },
      })),
    ];
    const { content } = renderPackagePage(model, definer);
    expect(content).toContain('Like [the slot](#demothingslot) and `Missing`.');
    expect(content).toContain('**Related:** [SlotExtension](#demothingslot), `Missing`');
  });
});
