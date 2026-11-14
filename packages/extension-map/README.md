# @odh-dashboard/extension-map

A static analysis tool that maps the dashboard's extension system: it reads `package.json` files, `distribution.yaml` files and TypeScript sources as data (never executing them), builds one model of extension points, contributed extensions, overrides and consumers, and renders it as generated Markdown documentation under `docs/extension-map/`, each package's `docs/extensions.md` and opt-in views.

Commands (run from the repo root):

```text
pnpm docs:extension-map         # regenerate the extension map documentation
pnpm docs:extension-map:check   # verify the committed documentation is up to date
```
