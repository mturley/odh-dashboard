# PR #6771 Visual Verification — Tab-Route Navigation

Screenshots captured from `localhost:4010` across multiple cluster environments.

---

## Tab-Route Pages

### `/ai-hub/models` (redirects to `/ai-hub/models/catalog`)
Confirmed redirect. "Models" page title with 3-tab bar: Catalog / Registry / Deployments.

![Models redirect to Catalog](01-models-redirect.png)

### `/ai-hub/models/catalog` — Catalog tab active
Model Catalog renders with 3-tab bar.

![Catalog tab](01-models-redirect.png)

### `/ai-hub/models/registry` — Registry tab active
Model Registry renders, Registry tab highlighted.

![Registry tab](02-models-registry.png)

### `/ai-hub/models/deployments` — Deployments tab active
Deployments renders, Deployments tab highlighted.

![Deployments tab](03-models-deployments.png)

### `/ai-hub/mcp-servers` (redirects to `/ai-hub/mcp-servers/catalog`)
Confirmed redirect. "MCP servers" page title with 2-tab bar: Catalog / Deployments.

![MCP servers redirect](04-mcp-servers-redirect.png)

### `/ai-hub/mcp-servers/catalog` — Catalog tab active
MCP Catalog renders with 2-tab bar.

![MCP servers catalog](04-mcp-servers-catalog.png)

### `/ai-hub/mcp-servers/deployments` — Deployments tab active
MCP Deployments renders, Deployments tab highlighted. No redundant title (suppressed via `noTitle`).

![MCP servers deployments](04b-mcp-servers-deployments.png)

---

## Old URL Redirects

All redirects confirmed working:

| Old URL | Redirects To | Screenshot |
|---------|-------------|------------|
| `/ai-hub/catalog` | `/ai-hub/models/catalog` | ![](05-redirect-catalog.png) |
| `/ai-hub/registry` | `/ai-hub/models/registry/test-registry` | ![](06-redirect-registry.png) |
| `/ai-hub/deployments` | `/ai-hub/models/deployments` | ![](07-redirect-deployments.png) |
| `/ai-hub/mcp-catalog` | `/ai-hub/mcp-servers/catalog` | ![](08-redirect-mcp-catalog.png) |
| `/ai-hub/mcp-deployments` | `/ai-hub/mcp-servers/deployments` | ![](08b-redirect-mcp-deployments.png) |
| `/modelServing` | `/ai-hub/models/deployments` | ![](09-redirect-modelServing.png) |

---

## Invalid Tab Handling

### `/ai-hub/models/nonexistent-tab`
Redirects to last-visited tab (session storage). In this case it went to `/ai-hub/models/deployments` because that was the most recently visited tab.

![Invalid tab models](10-invalid-tab-models.png)

### `/ai-hub/mcp-servers/nonexistent-tab`
Redirects to `/ai-hub/mcp-servers/catalog` (default tab).

![Invalid tab MCP](11-invalid-tab-mcp.png)

---

## Sub-Pages

### Model Catalog Detail — `/ai-hub/models/catalog/{source}/{model}`
"Models" title with tab bar above, breadcrumb "Catalog > model-name" below. Catalog tab active.

![Catalog detail](12-subpage-catalog-detail.png)

### Registry Detail — `/ai-hub/models/registry/{registry-name}`
"Models" title, Registry tab active, registry content with model table.

![Registry detail](13-subpage-registry-detail.png)

### Registered Model — `/ai-hub/models/registry/{registry}/registered-models/{id}`
"Models" title, Registry tab active, breadcrumb "Model registry - test-registry > Test".

![Registered model](14-subpage-registered-model.png)

### Model Version — `/ai-hub/models/registry/{registry}/registered-models/{id}/versions/{vid}`
Breadcrumb "Model registry - test-registry > Test > test", Registry tab active.

![Model version](15-subpage-model-version.png)

### Namespace-Scoped Deployments — `/ai-hub/models/deployments/{namespace}`
Deployments tab active, project selector showing namespace.

![Deployments namespace](16-subpage-deployments-namespace.png)

### Deploy Wizard — `/ai-hub/models/deployments/deploy`
Deploy wizard renders with step navigation. No tab bar on this page.

![Deploy wizard](17-subpage-deploy-wizard.png)

### MCP Server Detail — `/ai-hub/mcp-servers/catalog/{id}`
"MCP servers" title with tab bar (Catalog / Deployments), breadcrumb "MCP Catalog > kubernetes-mcp-server".

![MCP server detail](18-subpage-mcp-server-detail.png)

### Metrics Page — `/ai-hub/models/deployments/{namespace}/metrics/{name}`
"Models" title, breadcrumb "Deployments > s3 tewst", metrics charts rendered. No tab bar on this sub-page.
*(Captured on a different cluster with a deployed model.)*

![Metrics page](19-subpage-metrics.png)

---

## Navigation Sidebar Highlighting

### Models pages — "Models" nav item highlighted
AI hub section expanded, "Models" highlighted with active styling.

![Nav models highlighted](20-nav-models-highlighted.png)

### MCP servers pages — "MCP servers" nav item highlighted
AI hub section expanded, "MCP servers" highlighted with active styling.

![Nav MCP highlighted](21-nav-mcp-highlighted.png)

---

## Notes

- **Metrics page (screenshot 19)** was captured on a separate cluster that had a deployed model. That cluster did not have the same MCP catalog configuration.
- **Invalid tab redirect** uses session storage for the last-visited tab, so an invalid tab redirects to the previously visited tab rather than always defaulting to the first tab.
- **MCP servers page** on the green-rosa-1 cluster shows "MCP catalog configuration required" since no MCP sources are configured there, but the page and nav highlighting work correctly.
