import path from 'path';
import { githubAnchor } from '../../src/render/markdown';
import { renderPackagePage } from '../../src/render/packagePage';
import { renderAll } from '../../src/render/renderAll';
import { FLOW_DIAGRAM_MIN_NODES } from '../../src/render/sections/pointFlow';
import { makeDiagnostic } from '../../src/model/diagnostics';
import { emptyModel } from '../../src/model/sort';
import type {
  Consumer,
  DiagnosticCode,
  ExtensionMapModel,
  ExtensionRecord,
  Pkg,
  QuerySite,
  UseSite,
} from '../../src/model/types';

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
const user: Pkg = {
  name: '@odh-dashboard/user',
  dir: 'packages/user',
  kind: 'package',
  upstreamDirs: [],
};

const POINT_ID = 'demo.thing/slot';
const SLOT_ID = 'packages/user/src/Slot.tsx#Slot';

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

const consumer = (
  id: string,
  symbol: string,
  file: string,
  renderedIn: Consumer['renderedIn'] = [],
): Consumer => ({
  id,
  pkg: user.name,
  symbol,
  loc: { file, line: 5, endLine: 20 },
  renderedIn,
});

const querySite = (id: string, file: string): QuerySite => ({
  consumer: id,
  pointIds: [POINT_ID],
  hook: 'useExtensions',
  resolved: false,
  loc: { file, line: 6 },
  provenance: 'type-resolved',
});

const useSite = (id: string, file: string): UseSite => ({
  consumer: id,
  pointId: POINT_ID,
  path: 'properties.component',
  kind: 'lazy-render',
  direct: true,
  loc: { file, line: 14 },
  provenance: 'type-resolved',
});

/** A model with one point, two contributions, and one consumer rendered in one parent. */
const fixtureModel = (): ExtensionMapModel => ({
  ...emptyModel(),
  packages: [contributor, definer, user],
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
      typeParams: [],
      guards: ['isSlotExtension'],
      doc: { summary: 'A slot in the thing.', see: [], links: [], extensionData: [] },
      properties: [{ name: 'id', optional: false, typeText: 'string' }],
    },
  ],
  extensions: [record('one'), record('two')],
  consumers: [
    consumer(SLOT_ID, 'Slot', 'packages/user/src/Slot.tsx', [
      { symbol: 'Page', loc: { file: 'packages/user/src/Page.tsx', line: 12 }, how: 'jsx' },
    ]),
  ],
  querySites: [querySite(SLOT_ID, 'packages/user/src/Slot.tsx')],
  useSites: [useSite(SLOT_ID, 'packages/user/src/Slot.tsx')],
});

/** The same model with a second consumer, so the point reaches three flow nodes. */
const threeNodeModel = (): ExtensionMapModel => {
  const model = fixtureModel();
  const HOOK_ID = 'packages/user/src/useThing.ts#useThing';
  model.consumers = [
    ...model.consumers,
    consumer(HOOK_ID, 'useThing', 'packages/user/src/useThing.ts'),
  ];
  model.querySites = [...model.querySites, querySite(HOOK_ID, 'packages/user/src/useThing.ts')];
  model.useSites = [...model.useSites, useSite(HOOK_ID, 'packages/user/src/useThing.ts')];
  return model;
};

const CONSUMERS_HEADER = '| Consumer | Package | Query | Uses | Rendered or called in |';

/** Every markdown link on a page, outside fenced blocks. */
const linksOf = (content: string): { text: string; href: string }[] =>
  [...content.matchAll(/\[([^\]\n]*)\]\(([^)\s]*)\)/g)].map(([, text, href]) => ({ text, href }));

/** The `## On this page` block of a page, up to the next `## ` heading. */
const tocOf = (content: string): string => {
  const start = content.indexOf('## On this page');
  expect(start).toBeGreaterThan(-1);
  const rest = content.slice(start + 1);
  const end = rest.indexOf('\n## ');
  return end === -1 ? rest : rest.slice(0, end);
};

const anchorsOf = (content: string): string[] =>
  [...content.matchAll(/^#{1,4} (.+)$/gm)].map(([, heading]) => githubAnchor(heading.trim()));

const mermaidBlocks = (content: string): string[] =>
  [...content.matchAll(/```mermaid\n([\s\S]*?)```/g)].map(([, block]) => block);

/** Symbol nodes of a diagram: the consumers and the one-hop parents it draws. */
const symbolNodeLabels = (block: string): string[] =>
  [...block.matchAll(/^\s*n_symbol_[A-Za-z0-9_]+[[(]\(?"([^"]*)"/gm)].map(([, label]) => label);

/** Diagrams that are not adjacent to a Consumers table naming every symbol node with a link. */
const diagramsWithoutConsumerTable = (content: string): string[] =>
  content
    .split('```mermaid')
    .slice(1)
    .flatMap((block, index) => {
      const after = block.slice(block.indexOf('```') + 3).split(/^#/m)[0];
      const before = content.split('```mermaid')[index];
      const table = after.includes(CONSUMERS_HEADER)
        ? after
        : before.slice(before.lastIndexOf(CONSUMERS_HEADER));
      if (!table.includes(CONSUMERS_HEADER)) {
        return [`diagram ${index + 1}: no Consumers table`];
      }
      const rows = table
        .split('\n')
        .filter((line) => line.startsWith('| ') && !line.startsWith('| ---'));
      return symbolNodeLabels(block).flatMap((label) => {
        const row = rows.find((line) => line.includes(label));
        return row !== undefined && /\]\(\.\.?\//.test(row)
          ? []
          : [`diagram ${index + 1}: ${label}`];
      });
    });

describe('page nav and table of contents', () => {
  it('opens every page with a nav line and `## On this page`', () => {
    renderAll(threeNodeModel()).forEach((file) => {
      const headings = [...file.content.matchAll(/^## (.+)$/gm)].map(([, heading]) => heading);
      expect(headings[0]).toBe('On this page');
      const nav = file.content.slice(0, file.content.indexOf('## On this page')).trimEnd();
      expect(nav.split('\n').at(-1)).toMatch(
        /^\[[^\]]+\]\(#[a-z-]+\)( · \[[^\]]+\]\(#[a-z-]+\))*$/,
      );
    });
  });

  it('lists only the sections the page has, and the legend only with a diagram', () => {
    const navOf = (page: Pkg, model: ExtensionMapModel): string => {
      const { content } = renderPackagePage(model, page);
      return (
        content.slice(0, content.indexOf('## On this page')).trimEnd().split('\n').at(-1) ?? ''
      );
    };
    expect(navOf(contributor, fixtureModel())).toBe(
      '[Loading paths](#loading-paths) · [Contributes](#contributes)',
    );
    expect(navOf(definer, threeNodeModel())).toBe('[Defines](#defines) · [Legend](#legend)');
    expect(navOf(user, fixtureModel())).toBe('[Consumes](#consumes)');
  });

  it('builds the three sub-tables of the table of contents', () => {
    const toc = tocOf(renderPackagePage(threeNodeModel(), definer).content);
    expect(toc).toContain('**Defines**');
    expect(toc).toContain('| Extension point | Implemented by | Consumed in |');
    expect(toc).toContain(
      `| [${POINT_ID}](#${githubAnchor(
        POINT_ID,
      )}) | [contributor](../../contributor/docs/extensions.md#contributes-to-demothingslot) | [user](../../user/docs/extensions.md#consumes-demothingslot) |`,
    );
    expect(toc).not.toContain('**Contributes**');

    const contributorToc = tocOf(renderPackagePage(fixtureModel(), contributor).content);
    expect(contributorToc).toContain('**Contributes**');
    expect(contributorToc).toContain('| Extension | Extension point |');
    expect(contributorToc).toContain(
      `| [one](#contributes-to-demothingslot) | [${POINT_ID}](../../definer/docs/extensions.md#demothingslot) |`,
    );

    const userToc = tocOf(renderPackagePage(fixtureModel(), user).content);
    expect(userToc).toContain('**Consumes**');
    expect(userToc).toContain('| Consumer | Extension point |');
    expect(userToc).toContain(
      `| [Slot](#consumes-demothingslot) | [${POINT_ID}](../../definer/docs/extensions.md#demothingslot) |`,
    );
  });

  it('marks a point nothing uses as unused in the table of contents', () => {
    const model = fixtureModel();
    model.extensions = [];
    model.consumers = [];
    model.querySites = [];
    model.useSites = [];
    const toc = tocOf(renderPackagePage(model, definer).content);
    expect(toc).toContain(`| [${POINT_ID}](#${githubAnchor(POINT_ID)}) | unused | unused |`);
  });

  it('shows an em dash for one empty side', () => {
    const model = fixtureModel();
    model.extensions = [];
    const toc = tocOf(renderPackagePage(model, definer).content);
    expect(toc).toContain('| — | [user](../../user/docs/extensions.md#consumes-demothingslot) |');
  });

  it('counts the extensions a record stands for in its table-of-contents row', () => {
    const model = fixtureModel();
    model.extensions = [record('one', { multiplicity: 3 })];
    expect(tocOf(renderPackagePage(model, contributor).content)).toContain(
      '| [one ×3](#contributes-to-demothingslot) |',
    );
  });

  it('links nothing to source code from the table of contents', () => {
    renderAll(threeNodeModel()).forEach((file) => {
      linksOf(tocOf(file.content)).forEach(({ href }) => {
        expect(href.startsWith('#') || /extensions\.md#/.test(href)).toBe(true);
      });
    });
  });

  it('resolves every nav and table-of-contents anchor', () => {
    const files = renderAll(threeNodeModel());
    const anchors = new Map(files.map((file) => [file.path, anchorsOf(file.content)]));
    const broken = files.flatMap((file) => {
      // The nav line and the whole `## On this page` block: up to the section heading after it.
      const toc = file.content.indexOf('\n## On this page');
      const head = file.content.slice(0, file.content.indexOf('\n## ', toc + 1));
      return linksOf(head).flatMap(({ text, href }) => {
        const hash = href.indexOf('#');
        const target = href.slice(0, hash);
        const docPath =
          target === ''
            ? file.path
            : path.posix.normalize(path.posix.join(path.posix.dirname(file.path), target));
        const found = anchors.get(docPath);
        return found?.includes(href.slice(hash + 1))
          ? []
          : [`${file.path}: [${text}](${href}) -> ${docPath}`];
      });
    });
    expect(broken).toEqual([]);
  });
});

describe('contributor pages have no diagrams', () => {
  it('emits no mermaid block on a page that only contributes', () => {
    const { content } = renderPackagePage(fixtureModel(), contributor);
    expect(content).toContain('## Contributes');
    expect(content).not.toContain('```mermaid');
    expect(content).not.toContain('## Legend');
  });

  it('keeps the per-point detail sections and their anchors', () => {
    const { content } = renderPackagePage(fixtureModel(), contributor);
    expect(content).toContain('#### Contributes to demo.thing/slot');
    expect(content).not.toContain('| Node | What | Link |');
  });
});

describe('consumers table and selective flow diagrams', () => {
  it('always renders a Consumers table for a point with consumers', () => {
    const { content } = renderPackagePage(fixtureModel(), definer);
    expect(content).toContain(CONSUMERS_HEADER);
    expect(content).toContain(
      '| [Slot](../../user/src/Slot.tsx#L5-L20) | user | [useExtensions](../../user/src/Slot.tsx#L6) | `properties.component` — lazy-render, direct ([Slot.tsx:14](../../user/src/Slot.tsx#L14)) | Page ([Page.tsx:12](../../user/src/Page.tsx#L12)) |',
    );
  });

  it('writes a flow sentence instead of a diagram below the threshold', () => {
    const { content } = renderPackagePage(fixtureModel(), definer);
    expect(content).not.toContain('```mermaid');
    expect(content).toContain(
      `**Flow:** contributor → ${POINT_ID} → user · Slot → rendered in Page`,
    );
  });

  it('draws the diagram at exactly the threshold node count', () => {
    expect(FLOW_DIAGRAM_MIN_NODES).toBe(3);
    const { content } = renderPackagePage(threeNodeModel(), definer);
    expect(mermaidBlocks(content)).toHaveLength(1);
    expect(content).not.toContain('**Flow:**');
    expect(content).toContain('## Legend');
  });

  it('puts no label on a point-to-consumer edge', () => {
    const [block] = mermaidBlocks(renderPackagePage(threeNodeModel(), definer).content);
    const fromPoint = block
      .split('\n')
      .filter((line) => /^\s*n_demo_thing_slot_\w+ .*n_symbol_/.test(line));
    expect(fromPoint).toHaveLength(2);
    fromPoint.forEach((line) => expect(line.trim()).toMatch(/_[0-9a-f]{6} --> n_symbol_/));
    expect(block).toContain('-. "rendered in" .->');
  });

  it('names every diagram node in the adjacent Consumers table', () => {
    expect(
      diagramsWithoutConsumerTable(renderPackagePage(threeNodeModel(), definer).content),
    ).toEqual([]);
  });

  it('says so when a side of the flow is empty, and marks a federated contributor', () => {
    const model = fixtureModel();
    model.consumers = [];
    model.querySites = [];
    model.useSites = [];
    model.entries = [{ ...model.entries[0], path: 'federated' }];
    expect(renderPackagePage(model, definer).content).toContain(
      `**Flow:** contributor (federated) → ${POINT_ID} → (no consumers)`,
    );

    const noContributors = fixtureModel();
    noContributors.extensions = [];
    expect(renderPackagePage(noContributors, definer).content).toContain(
      `**Flow:** (no contributors) → ${POINT_ID} → user · Slot → rendered in Page`,
    );
  });

  it('describes only the edge styles the remaining diagrams use', () => {
    const { content } = renderPackagePage(threeNodeModel(), definer);
    const legend = content.slice(content.indexOf('## Legend'));
    expect(legend).toContain('| `A --> B` |');
    expect(legend).toContain('| `A -. "rendered in" .-> B` |');
    expect(legend).toContain('| `A -. "called in" .-> B` |');
    expect(legend).toContain('| `A -. "federated" .-> B` |');
    expect(legend).not.toContain('Contributes diagram');
    expect(legend).not.toContain('`A --x B`');
    expect(legend).not.toContain('×N');
  });
});

describe('override effects on the declaring page', () => {
  const portal: Pkg = {
    name: '@odh-dashboard/portal',
    dir: 'distributions/portal',
    kind: 'distribution',
    upstreamDirs: [],
  };

  /** A model where `portal` suppresses one of `contributor`'s extensions and patches another. */
  const overrideModel = (): ExtensionMapModel => {
    const model = fixtureModel();
    model.packages = [contributor, definer, portal, user];
    model.apps = [{ id: 'portal', entries: [], featureFlags: {} }];
    const suppressKey = 'distributions/portal/src/extensions.ts:1';
    const patchKey = 'distributions/portal/src/extensions.ts:2';
    const overrideRecord = (key: string, type: string, line: number): ExtensionRecord => ({
      ...record('o'),
      key,
      type,
      pkg: portal.name,
      loc: { file: 'distributions/portal/src/extensions.ts', line },
      properties: {
        targetType: { kind: 'literal', value: POINT_ID },
        targetId: { kind: 'literal', value: 'one' },
      },
      apps: [{ app: 'portal', via: '@odh-dashboard/contributor#./extensions' }],
    });
    model.extensions = [
      record('one'),
      record('two'),
      overrideRecord(suppressKey, 'app.suppress', 4),
      overrideRecord(patchKey, 'app.patch', 9),
    ];
    model.overrides = [
      {
        kind: 'suppress',
        app: 'portal',
        by: suppressKey,
        targetType: { kind: 'literal', value: POINT_ID },
        targetId: { kind: 'literal', value: 'one' },
        targets: ['packages/contributor/extensions.ts:one'],
        effect: 'removed',
      },
      {
        kind: 'patch',
        app: 'portal',
        by: patchKey,
        targetType: { kind: 'literal', value: POINT_ID },
        targetId: { kind: 'literal', value: 'one' },
        targets: ['packages/contributor/extensions.ts:one'],
        effect: 'noop-suppressed',
        patch: { group: { kind: 'literal', value: 'g' } },
      },
    ];
    return model;
  };

  it('adds an Effect column saying what each override does', () => {
    const { content } = renderPackagePage(overrideModel(), portal);
    expect(content).toContain(
      '| portal: removes [one](../../../packages/contributor/docs/extensions.md#contributes-to-demothingslot) from contributor |',
    );
    expect(content).toContain('| portal: no effect — target suppressed |');
  });

  it('says which contribution an applied patch changes', () => {
    const model = overrideModel();
    model.overrides = model.overrides.map((override) =>
      override.kind === 'patch' ? { ...override, effect: 'applied' as const } : override,
    );
    expect(renderPackagePage(model, portal).content).toContain(
      '| portal: patches [one](../../../packages/contributor/docs/extensions.md#contributes-to-demothingslot) in contributor |',
    );
  });

  it('leaves an ordinary extension that redefines a suppressed key without an Effect column', () => {
    const model = overrideModel();
    model.overrides = [
      {
        kind: 'redefine',
        app: 'portal',
        by: 'packages/contributor/extensions.ts:two',
        targetType: { kind: 'literal', value: POINT_ID },
        targetId: { kind: 'literal', value: 'two' },
        targets: ['packages/contributor/extensions.ts:one'],
        effect: 'applied',
      },
    ];
    // The target-side note still reports the redefine; the contribution table gains no column.
    const { content } = renderPackagePage(model, contributor);
    expect(content).toContain('| id | Included in | Source |');
    expect(content).not.toContain('| id | Effect |');
    expect(content).toContain('| one | portal | redefined |');
  });

  it('adds no Effect column to a package that declares no override', () => {
    const { content } = renderPackagePage(overrideModel(), contributor);
    const detail = content.slice(content.indexOf('#### Contributes to'));
    // Its own contribution table keeps its columns; the Effect column of the target-side
    // "Suppressed / patched in" note is a different table.
    expect(detail).toContain('| id | Included in | Source |');
    expect(detail).not.toContain('| id | Effect |');
  });
});

describe('diagnostic severities', () => {
  it('calls an override finding about the code info, and an unproven one a warning', () => {
    const severityOf = (code: DiagnosticCode): string => makeDiagnostic(code, 'x').severity;
    (
      [
        'patch-noop-suppressed',
        'patch-noop-missing',
        'suppress-no-match',
        'patch-ignored-keys',
        'patch-dropped',
        'suppress-dropped',
      ] as const
    ).forEach((code) => expect(severityOf(code)).toBe('info'));
    expect(severityOf('unresolved-override')).toBe('warning');
    expect(severityOf('unresolved-distribution')).toBe('warning');
  });

  it('reports findings about the code as info and gaps in the map as warnings', () => {
    const model = fixtureModel();
    model.diagnostics = (
      [
        'patch-noop-suppressed',
        'patch-noop-missing',
        'suppress-no-match',
        'patch-ignored-keys',
        'patch-dropped',
        'suppress-dropped',
        'unresolved-override',
        'unresolved-distribution',
      ] as const
    ).map((code) => ({
      code,
      severity: code.startsWith('unresolved-') ? ('warning' as const) : ('info' as const),
      message: `about ${code}`,
      pkg: contributor.name,
    }));
    const { content } = renderPackagePage(model, contributor);
    expect(content).toContain('| `patch-noop-suppressed` | info |');
    expect(content).toContain('| `unresolved-override` | warning |');
    expect(content).toContain('warnings are things the analysis could not prove');
    expect(content).toContain('info entries are findings about the code');
  });
});
