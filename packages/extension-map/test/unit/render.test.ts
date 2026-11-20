import { emptyModel } from '../../src/model/sort';
import type { ExtensionMapModel, Pkg } from '../../src/model/types';
import { HEADER, escapeCell, table, defList } from '../../src/render/markdown';
import { githubAnchor, pointLink, relLink } from '../../src/render/links';
import { flowchart, mermaidId, mermaidLabel } from '../../src/render/mermaid';
import { renderPackagePage } from '../../src/render/packagePage';
import { renderAll } from '../../src/render/renderAll';

const packagePage: Pkg = {
  name: '@fx/contributor',
  dir: 'packages/contributor',
  kind: 'package',
  docsDir: 'packages/contributor/docs',
  upstreamDirs: [],
};

const model: ExtensionMapModel = {
  ...emptyModel(),
  packages: [
    packagePage,
    {
      name: '@fx/points',
      dir: 'packages/points',
      kind: 'package',
      docsDir: 'packages/points/docs',
      upstreamDirs: [],
    },
  ],
  entries: [
    {
      id: '@fx/contributor#./extensions',
      pkg: '@fx/contributor',
      file: 'packages/contributor/extensions.ts',
      path: 'static',
      key: './extensions',
    },
  ],
  points: [
    {
      id: 'fx.route',
      pkg: '@fx/points',
      typeName: 'RouteExtension',
      loc: { file: 'packages/points/src/route.ts', line: 4 },
      typeParams: [],
      guards: [],
      doc: { summary: 'A route', see: [], links: [], extensionData: [] },
      properties: [
        { name: 'path', optional: false, typeText: 'string' },
        { name: 'component', optional: false, typeText: 'CodeRef' },
        { name: 'method', optional: true, typeText: 'string' },
      ],
    },
  ],
  diagnostics: [
    {
      code: 'unresolved-value',
      severity: 'warning',
      message: 'extension object spread could not be resolved',
      loc: { file: 'packages/contributor/extensions.ts', line: 30 },
      pkg: '@fx/contributor',
    },
  ],
  extensions: [
    {
      key: 'packages/contributor/extensions.ts:20',
      type: 'fx.route',
      pkg: '@fx/contributor',
      loc: { file: 'packages/contributor/extensions.ts', line: 20 },
      entries: ['@fx/contributor#./extensions'],
      apps: [],
      flags: { required: [], disallowed: [] },
      properties: {
        path: { kind: 'literal', value: '/hello' },
        component: {
          kind: 'codeRef',
          module: './Hello',
          export: 'Hello',
          target: { file: 'packages/contributor/src/Hello.tsx', line: 3 },
        },
        method: { kind: 'literal', value: 'GET' },
        '<unresolved spread:packages/contributor/extensions.ts:30:123>': {
          kind: 'unresolved',
          reason: 'object spread contribution is not statically resolved',
          loc: { file: 'packages/contributor/extensions.ts', line: 30 },
        },
      },
    },
  ],
};

describe('render helpers', () => {
  it('computes GitHub anchors', () => {
    expect(githubAnchor('model-serving.platform/exclude-deployment')).toBe(
      'model-servingplatformexclude-deployment',
    );
  });

  it('escapes Mermaid and table text', () => {
    expect(mermaidLabel('a<"b">')).toBe('a#lt;#quot;b#quot;#gt;');
    expect(mermaidId('model-serving.platform/x')).toMatch(
      /^n_model_serving_platform_x_[0-9a-f]{6}$/,
    );
    expect(escapeCell('a|b\nc')).toBe('a\\|b<br>c');
    expect(table(['Name'], [['a|b\nc']])).toContain('a\\|b<br>c');
    expect(defList([['Name', 'a|b']])).toContain('a\\|b');
  });

  it('builds relative source and point links', () => {
    const loc = { file: 'packages/kserve/src/deployments.ts', line: 36 };
    expect(relLink('packages/kserve/docs/extensions.md', loc, 'useWatchDeployments')).toBe(
      '[useWatchDeployments](../src/deployments.ts#L36)',
    );
    expect(pointLink('packages/contributor/docs/extensions.md', model.points[0], model)).toBe(
      '[fx.route](../../points/docs/extensions.md#fxroute)',
    );
  });

  it('builds Mermaid nodes and each edge style', () => {
    const diagram = flowchart('LR')
      .node('a', 'A <B>', 'box')
      .node('b', 'Point <"label">', 'point')
      .node('c', 'Rounded', 'rounded')
      .edge('a', 'b', 'solid')
      .edge('a', 'b', 'derived')
      .edge('a', 'b', 'renderedIn')
      .edge('a', 'b', 'federated')
      .edge('a', 'b', 'suppress')
      .edge('a', 'b', 'patch')
      .toString();
    expect(diagram).toContain('flowchart LR');
    expect(diagram).toContain('#lt;');
    expect(diagram).toContain('b("Point #lt;#quot;label#quot;#gt;")');
    expect(diagram).not.toContain('b(("Point #lt;#quot;label#quot;#gt;"))');
    expect(diagram).toContain('-. "federated" .->');
    expect(diagram).toContain('-- "patch" -->');
    expect(diagram).toContain('==>');
    expect(diagram).toContain('--x');
  });
});

describe('package pages', () => {
  it('keeps contributed point Contents entries under their matching namespace sections', () => {
    const template = model.extensions[0];
    const points = ['app.area', 'model-serving.platform'].map((id) => ({
      ...model.points[0],
      id,
    }));
    const extensions = points.map((point, index) => ({
      ...template,
      key: `${template.key}-${point.id}`,
      type: point.id,
      loc: { ...template.loc, line: template.loc.line + index },
    }));
    const { content } = renderPackagePage({ ...model, points, extensions }, packagePage);
    const contents = content.slice(
      content.indexOf('## Contents'),
      content.indexOf('\n## Loading paths'),
    );
    const appNamespaceLink = contents.indexOf('  - [app](#app)');
    const appPointLink = contents.indexOf('    - [app.area](#apparea)');
    const servingNamespaceLink = contents.indexOf('  - [model-serving](#model-serving)');
    const servingPointLink = contents.indexOf(
      '    - [model-serving.platform](#model-servingplatform)',
    );
    expect(appNamespaceLink).toBeGreaterThanOrEqual(0);
    expect(appPointLink).toBeGreaterThan(appNamespaceLink);
    expect(servingNamespaceLink).toBeGreaterThan(appPointLink);
    expect(servingPointLink).toBeGreaterThan(servingNamespaceLink);
    expect(content.indexOf('### app\n')).toBeLessThan(content.indexOf('#### app.area\n'));
    expect(content.indexOf('#### app.area\n')).toBeLessThan(content.indexOf('### model-serving\n'));
    expect(content.indexOf('### model-serving\n')).toBeLessThan(
      content.indexOf('#### model-serving.platform\n'),
    );
  });

  it('renders a nested contents section with collision-safe heading links', () => {
    const secondPoint = {
      ...model.points[0],
      id: 'fxrou.te',
      pkg: packagePage.name,
      doc: { ...model.points[0].doc, summary: '```mermaid\n## Mermaid phantom\n```' },
    };
    const firstExtension = model.extensions[0];
    const { content } = renderPackagePage(
      {
        ...model,
        points: [...model.points, secondPoint],
        extensions: [
          firstExtension,
          { ...firstExtension, key: `${firstExtension.key}-second`, type: 'fxrou.te' },
        ],
      },
      packagePage,
    );
    expect(content).toContain('## Contents');
    expect(content).toContain('  - [fx](#fx)');
    expect(content).toContain('  - [fxrou.te](#fxroute)');
    expect(content).toContain('  - [fxrou](#fxrou)');
    expect(content).toContain('    - [fx.route](#fxroute-1)');
    expect(content).toContain('    - [fxrou.te](#fxroute-2)');
    expect(content).not.toContain('[Mermaid phantom]');
    expect(content).toContain(`${HEADER}\n\n## Contents`);
    expect(content.indexOf('## Contents')).toBeLessThan(content.indexOf('## Contributes'));
    expect(content).not.toContain('#flowchart');
  });

  it('follows every diagram with a node, contract, and registration source table', () => {
    const { content } = renderPackagePage(model, packagePage);
    const diagrams = content.split('```mermaid').slice(1);
    expect(diagrams.length).toBeGreaterThan(0);
    expect(
      diagrams.every((diagram) =>
        diagram
          .slice(diagram.indexOf('```'))
          .includes('| Node | Contract | Registration sources |'),
      ),
    ).toBe(true);
    expect(content).toContain('[fx.route](../../points/docs/extensions.md#fxroute)');
    expect(content).toContain('[../extensions.ts:20](../extensions.ts#L20)');
    expect(content).toContain(
      '| fx.route | [fx.route](../../points/docs/extensions.md#fxroute) | [../extensions.ts:20](../extensions.ts#L20) |',
    );
    expect(content).toContain('[@fx/contributor](#loading-paths)');
  });

  it('omits empty metadata and columns, preserves values, and uses an em dash for a missing retained cell', () => {
    const point = {
      ...model.points[0],
      properties: ['flag', 'count', 'empty', 'missing', 'unresolved'].map((name) => ({
        name,
        optional: true,
        typeText: 'unknown',
      })),
    };
    const first = {
      ...model.extensions[0],
      properties: {
        flag: { kind: 'literal' as const, value: false },
        count: { kind: 'literal' as const, value: 0 },
        empty: { kind: 'literal' as const, value: '' },
        missing: { kind: 'literal' as const, value: null },
        unresolved: {
          kind: 'unresolved' as const,
          reason: 'spread is not statically resolved',
          loc: { file: 'packages/contributor/extensions.ts', line: 30 },
        },
      },
      flags: { required: [{ kind: 'literal' as const, value: false }], disallowed: [] },
      apps: [],
    };
    const second = {
      ...first,
      key: `${first.key}-second`,
      loc: { ...first.loc, line: 21 },
      properties: {},
      flags: { required: [], disallowed: [] },
    };
    const { content } = renderPackagePage(
      { ...model, points: [point], extensions: [first, second] },
      packagePage,
    );
    expect(content).toContain(
      '| flag | count | empty | missing | unresolved | Requires | Source |',
    );
    expect(content).toContain(
      '| `false` | `0` | `""` | `null` | [not resolved](#diagnostics) | `false` |',
    );
    expect(content).toContain('| — | — | — | — | — | — | [fx.route]');
    expect(content).not.toContain('Disallows');
    expect(content).not.toContain('CodeRef target');
    expect(content).not.toContain('Included in');
  });

  it('labels each definition-list contribution with its source location', () => {
    const point = {
      ...model.points[0],
      properties: Array.from({ length: 8 }, (_, index) => ({
        name: `property${index}`,
        optional: true,
        typeText: 'string',
      })),
    };
    const contribution = model.extensions[0];
    const extensions = [20, 21].map((line) => ({
      ...contribution,
      key: `${contribution.key}-${line}`,
      loc: { ...contribution.loc, line },
      properties: Object.fromEntries(
        point.properties.map((property) => [
          property.name,
          { kind: 'literal' as const, value: property.name },
        ]),
      ),
    }));
    const { content } = renderPackagePage({ ...model, points: [point], extensions }, packagePage);
    expect(content).toContain(
      '**Contribution:** `fx.route` at `packages/contributor/extensions.ts:20`',
    );
    expect(content).toContain(
      '**Contribution:** `fx.route` at `packages/contributor/extensions.ts:21`',
    );
    expect(content.match(/\*\*Contribution:\*\*/gu)).toHaveLength(2);
  });

  it('filters empty columns before choosing between a table and definition lists', () => {
    const { content } = renderPackagePage(model, packagePage);
    expect(content).toContain('| path | component | method | CodeRef target | Source |');
    expect(content).not.toContain('- **method**:');
    expect(content).not.toContain('**Requires**');
  });

  it('shows a single mapped contribution record with multiplicity five as ×5', () => {
    const extension = model.extensions.find((item) => item.type === 'fx.route');
    if (extension === undefined) {
      throw new Error('Missing fixture contribution');
    }
    const { content } = renderPackagePage(
      { ...model, extensions: [{ ...extension, multiplicity: 5 }] },
      packagePage,
    );
    expect(content).toContain('fx.route ×5');
  });

  it('collapses five separate same-point contributions into one diagram node', () => {
    const extension = model.extensions.find((item) => item.type === 'fx.route');
    if (extension === undefined) {
      throw new Error('Missing fixture contribution');
    }
    const extensions = Array.from({ length: 5 }, (_, index) => ({
      ...extension,
      key: `${extension.key}-${index}`,
      loc: { ...extension.loc, line: extension.loc.line + index },
    }));
    const { content } = renderPackagePage({ ...model, extensions }, packagePage);
    expect(content).toContain('fx.route ×5');
    expect(content.match(/^ {2}point_n_fx_route_[a-f0-9]{6}\("/gmu)).toHaveLength(1);
  });

  it('sums known multiplicities and defaults missing multiplicity to one', () => {
    const extension = model.extensions.find((item) => item.type === 'fx.route');
    if (extension === undefined) {
      throw new Error('Missing fixture contribution');
    }
    const extensions = [
      { ...extension, key: `${extension.key}-mapped`, multiplicity: 3 },
      { ...extension, key: `${extension.key}-default-a` },
      { ...extension, key: `${extension.key}-default-b` },
    ];
    const { content } = renderPackagePage({ ...model, extensions }, packagePage);
    expect(content).toContain('fx.route ×5');
  });

  it('omits an exact diagram count when any mapped multiplicity is unknown', () => {
    const extension = model.extensions.find((item) => item.type === 'fx.route');
    if (extension === undefined) {
      throw new Error('Missing fixture contribution');
    }
    const extensions = [
      { ...extension, key: `${extension.key}-known`, multiplicity: 5 },
      { ...extension, key: `${extension.key}-unknown`, multiplicity: 'unknown' as const },
    ];
    const { content } = renderPackagePage({ ...model, extensions }, packagePage);
    expect(content).not.toContain('fx.route ×');
    expect(content).toContain('| fx.route |');
  });

  it('links located diagnostics to their source symbol', () => {
    const diagnostic = model.diagnostics[0];
    const { content } = renderPackagePage(
      {
        ...model,
        diagnostics: [
          {
            ...diagnostic,
            loc: { file: 'packages/kserve/extensions.ts', line: 68 },
          },
        ],
      },
      packagePage,
    );
    expect(content).toContain('[field](../../kserve/extensions.ts#L68)');
  });

  it('keeps an in-page link for diagnostics without a source location', () => {
    const diagnostic = model.diagnostics[0];
    const { content } = renderPackagePage(
      { ...model, diagnostics: [{ ...diagnostic, loc: undefined }] },
      packagePage,
    );
    expect(content).toContain('[details](#diagnostics)');
  });

  it('shows unresolved spreads without inventing extension properties', () => {
    const { content } = renderPackagePage(model, packagePage);
    expect(content).toContain('properties (unknown spread)');
    expect(content).toContain('object spread contribution is not statically resolved');
    expect(content).not.toContain('<unresolved spread:');
  });

  it('does not emit JavaScript or TypeScript fences', () => {
    expect(renderPackagePage(model, packagePage).content).not.toMatch(/```(js|jsx|ts|tsx)\b/);
  });

  it('shows proved contributions and links without diagramming unresolved values', () => {
    const { content } = renderPackagePage(model, packagePage);
    expect(content).toContain('## Loading paths');
    expect(content).toContain('## Contributes');
    expect(content).toContain('fx.route');
    expect(content).toContain('../src/Hello.tsx#L3');
    expect(content).not.toContain('https://github.com/');
  });

  it('renders package pages in stable path order', () => {
    expect(renderAll(model).map((file) => file.path)).toEqual([
      'packages/contributor/docs/extensions.md',
      'packages/points/docs/extensions.md',
    ]);
  });
});
