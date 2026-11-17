import { emptyModel } from '../../src/model/sort';
import type { ExtensionMapModel, Pkg } from '../../src/model/types';
import { escapeCell, table, defList } from '../../src/render/markdown';
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
      .node('b', 'Point', 'point')
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
    expect(diagram).toContain('b(("Point"))');
    expect(diagram).toContain('-. "federated" .->');
    expect(diagram).toContain('-- "patch" -->');
    expect(diagram).toContain('==>');
    expect(diagram).toContain('--x');
  });
});

describe('package pages', () => {
  it('follows every diagram with a node link table', () => {
    const { content } = renderPackagePage(model, packagePage);
    const diagrams = content.split('```mermaid').slice(1);
    expect(diagrams.length).toBeGreaterThan(0);
    expect(
      diagrams.every((diagram) => diagram.indexOf('```') < diagram.indexOf('| Node | Link |')),
    ).toBe(true);
  });

  it('switches to definition lists when a point table has more than seven columns', () => {
    const { content } = renderPackagePage(model, packagePage);
    expect(content).toContain('- **method**: `"GET"`');
    expect(content).toContain('- **Source**:');
  });

  it('collapses five same-point contributions into one diagram node', () => {
    const extension = model.extensions.find((item) => item.type === 'fx.route');
    if (extension === undefined) {
      throw new Error('Missing fixture contribution');
    }
    const fiveExtensions = Array.from({ length: 5 }, (_, index) => ({
      ...extension,
      key: `${extension.key}-${index}`,
      loc: { ...extension.loc, line: extension.loc.line + index },
    }));
    const { content } = renderPackagePage({ ...model, extensions: fiveExtensions }, packagePage);
    expect(content).toContain('fx.route ×5');
    expect(content.match(/^ {2}point_n_fx_route_[a-f0-9]{6}\(\(/gmu)).toHaveLength(1);
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
