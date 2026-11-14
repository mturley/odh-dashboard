# @odh-dashboard/extension-map

A static analysis tool that maps the dashboard's extension system: it reads `package.json` files, `distribution.yaml` files and TypeScript sources as data (never executing them), builds one model of extension points, contributed extensions, overrides and consumers, and renders it as generated Markdown documentation under `docs/extension-map/`, each package's `docs/extensions.md` and opt-in views.

Commands (run from the repo root):

```text
pnpm docs:extension-map         # regenerate the extension map documentation
pnpm docs:extension-map:check   # verify the committed documentation is up to date
```

## Memory and cache modes

The analysis runs in an isolated child process with an explicitly capped V8
heap (`--max-old-space-size`), so a fatal out-of-memory failure cannot kill
the CLI and inherited heap flags cannot override the chosen cap. Before
spawning, the runner checks `process.availableMemory()` and picks a mode:

- **Cached analysis** (shared `SourceFile` cache, heap cap 6144 MiB) is
  selected when at least 8 GiB are available.
- **Uncached analysis** (heap cap up to 4096 MiB, always leaving at least
  1024 MiB of the available budget free; 2048 MiB when availability is
  unknown) is selected below the threshold or when availability cannot be
  determined.
- `--no-source-cache` always disables the cache. The programmatic
  `sourceCache: true` option is a preference and remains subject to the safe
  budget.
- If even a 1024 MiB child heap is not possible, the CLI fails before
  spawning with an actionable message.
- A cached child that dies from a V8 heap out of memory — or is possibly
  killed for memory (SIGKILL) — is retried exactly once, uncached, in a fresh
  child with a re-checked budget. Every other failure (analysis errors,
  cancellation, spawn or IPC failures) is surfaced and never retried.
- The selected mode and any fallback are reported on stderr; `--json` and
  generated output are written only after a successful analysis.

The budget check is a heuristic, not a guarantee: it protects against V8 heap
out-of-memory errors, not against an OS-level kill, and it cannot reserve
memory against concurrent consumers.
