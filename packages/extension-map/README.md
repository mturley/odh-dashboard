# @odh-dashboard/extension-map

Static analysis that reads the ODH Dashboard workspace (without executing package code) and generates documentation mapping the extension system: extension points, contributors, consumers and the apps that compose them.

## Commands

- `pnpm docs:extension-map` regenerates the documentation.
- `pnpm docs:extension-map:check` checks that the committed documentation is up to date.

## The analysis model (JSON)

Every page is rendered from one model of the extension system, and that model is a stable interface: a different output (another page layout, a site, a script that answers a question) can be built on the same analysis. `pnpm --filter @odh-dashboard/extension-map generate --json <file>` writes the model to `<file>` as JSON (a relative path resolves against `packages/extension-map`), next to regenerating the docs. The JSON is not committed: its line numbers change with every edit.

The reference for every type and field is [`src/model/types.ts`](src/model/types.ts); each field carries a comment stating what it means, when it is absent and how its array is ordered. The top level holds:

| Array | What it holds |
| --- | --- |
| `packages` | Display packages (nested workspace packages such as `<pkg>/frontend` and `upstream/` subtrees roll up into their parent). |
| `entries` | Modules whose default export is an array of extensions, one per loading path (static export, federated expose, distribution export). |
| `apps` | Composition roots (the host, distributions) and their entries in catalog order. |
| `points` | Extension points: the type alias, its JSDoc, its declared properties and its guards. |
| `guards` | Type guards that narrow to extension points. |
| `extensions` | Declared extensions with their resolved property and flag values, CodeRef targets and what those targets supply. |
| `overrides` | Suppresses, patches and redefines per app, with their effect. |
| `consumers`, `querySites`, `useSites` | Code that fetches extensions, where it fetches them, and how it uses them. |
| `carriedTypes` | Types extension points carry inside `CodeRef` properties. |
| `diagnostics` | Everything the analysis could not prove, and problems it found, each with a location. |

`apps`, `overrides`, `consumers`, `querySites`, `useSites` and `carriedTypes` are part of the interface but stay empty until the analyses that fill them are built.

**How records join.** Extension points are identified by their point ID (the string literal of `Extension`'s first type argument): `ExtensionRecord.type`, `Guard.pointIds`, `QuerySite.pointIds` and `UseSite.pointId` all hold point IDs. Declarations that carry no such literal are identified by a declaration key, `<repo-relative file>:<start offset>` (`ExtensionRecord.key`, `ExtensionPoint.properties[].codeRef.innerKey`); a key is stable only while the source before the declaration is unchanged. Entries are joined by `Entry.id` (`<pkg>#<key>`), packages by name, consumers by `Consumer.id` (`<file>#<symbol>`). Paths are repo-relative POSIX paths, lines are 1-based, and no path or key points into the generated `frontend/@mf-types` copies.

**Values are proven, never guessed.** A property value is a literal, a named constant or enum member, a code reference, a function or code-like constant named by reference, or an array or object of those. Anything else is `unresolved`, with the reason and a location, and is also reported as a diagnostic.

**Stability policy.** The model states facts about the code, not decisions about how to show them. Arrays are sorted by stable keys (catalog order is kept where it matters), so the same code always produces the same JSON. Fields may be added without notice; any breaking change to the model's shape (a field removed, renamed or given a new meaning) bumps `ExtensionMapModel.version`, currently `1`.

## Coverage and limits

- Uses inside generic helpers (code whose extension is typed by a type parameter, such as plugin-core's `ExtensibleActions`) are not attributed to any point; the caller's query site is.
