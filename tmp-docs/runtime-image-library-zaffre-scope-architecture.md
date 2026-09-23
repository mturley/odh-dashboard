# Runtime image library: Zaffre scope and architecture

See the primary [Green/Zaffre coordination document](https://docs.google.com/document/d/14rHHAyLgZrTmFcauCS2wLasZL2-6fXkm34tZTNDJPL4/edit?tab=t.0#heading=h.1ws9hwmbjjdw) for the current cross-team discussion and decisions.

## Terminology

- **Runtime image library**: The AI Hub experience for discovering Runtime images. It replaces the earlier “Runtime Catalog” terminology.
- **Runtime image**: An AI Hub API object that represents an installable image and includes metadata plus zero or more supported deployment resources.
- **Deployment resource**: A reusable, cluster/dashboard-scoped resource installed from a Runtime image. For this feature, it is either a Serving runtime template or an LLM accelerator configuration.
- **Install**: Creating one of the deployment resources from a Runtime image in the dashboard’s existing model deployment settings.

A deployment resource is **not project-scoped**. Existing model-deployment wizard flows later create project-scoped resources that reference or clone a selected deployment resource; those downstream flows are out of scope.

## Feature goal

A dashboard administrator can choose a Runtime image in the Runtime image library and install one of its supported deployment resources. The installed resource becomes available in the existing model-deployment wizard selection UI alongside resources created manually through Model deployment settings.

The feature eliminates the manual recreation of supported reusable deployment-resource configuration while preserving the existing creation and list experiences.

## Scope boundary

### Green / AI Hub owns

- The Runtime image library as a new tab on **Model deployment settings**.
- The library list and Runtime image detail page.
- AI Hub API/BFF integration and the canonical Runtime image domain/API type.
- A new feature flag and `SupportedArea`; its name and exact route/action permission gates remain to be agreed.
- Rendering the existing `core.action` extension point on Runtime image detail pages, filtered by the new, TBD action group.
- Supplying the agreed action props to the Zaffre-owned Install action extension.

### Zaffre / Model Serving owns

- The Install `core.action` extension registered in Green’s agreed action group.
- Redirecting directly to the Install page when the user clicks **Install**; no project selection or other prompt is part of the action.
- The full-page Install wizard route, page shell, breadcrumbs, router-state handling, destination selection, and Step 1 validation.
- The `RuntimeImageInstallData` handoff contract exported by model-serving, subject to Green–Zaffre agreement on its concrete fields.
- The `model-serving.runtime-image/install-target` extension point for platform-specific Step 2 implementations.
- Reuse/refactor coordination for the existing creation forms.

### Out of scope

- Runtime image library browsing, filtering, detail-page UI, and API/BFF data retrieval.
- Library administration, version governance, registry mirrors, or general Runtime image library management.
- Asking the user to choose a project while installing.
- Model deployment after installation: creating an InferenceService or LLMInferenceService and its project-scoped resources.
- Changes to the downstream deployment-method workflows.

## User flow

1. An administrator opens **Model deployment settings > Runtime image library**.
2. The Runtime image detail page consumes `core.action` extensions in the agreed action group and renders Zaffre’s **Install** action.
3. The action receives the agreed install data through `componentProps` and redirects directly to the Zaffre Install page, passing the data through the router-state pattern used by the model-catalog deployment flow.
4. Zaffre’s Install page presents a two-step full-page wizard:
   1. **Install destination**: choose a supported deployment resource type.
   2. **Configure template** or **Configure accelerator**: render the matching platform-owned, prefilled form body.
5. The selected platform form directly creates the resource and redirects to the existing corresponding list tab:
   - **Serving runtime templates**, or
   - **LLM accelerator configurations**.

## Available install destinations

A Runtime image may support either target or both. The intended contract is at most one resource for each target; this API cardinality must be explicitly confirmed with Green.

Step 1 must only offer destinations present in the Runtime image’s deployment resources:

- **Serving runtime template** when the Runtime image defines one.
- **LLM accelerator configuration** when the Runtime image defines one.

If the Runtime image supplies neither supported resource, the Install page displays an explicit error/empty state with a safe return route to the Runtime image detail page. It must not render an empty Step 1 or attempt to create anything. Green should also decide whether to suppress or disable the detail-page Install action for such an image.

## Install-data contract

The canonical full Runtime image type belongs to Green/model-registry. Zaffre should not import that type, its AI Hub API hooks, or library-page internals.

Model-serving will export an installer-facing handoff type, analogous to the existing `DeployPrefillData` contract used by model-catalog deployment. Green’s action props will contain the agreed installer-facing data rather than requiring Zaffre to fetch or understand the full AI Hub API model.

The desired keyed-resource model is:

```ts
type RuntimeImageInstallData = {
  runtimeImageId: string;
  runtimeImageName: string;
  deploymentResources: {
    servingRuntimeTemplate?: /* agreed resource type */;
    llmAcceleratorConfiguration?: /* agreed resource type */;
  };
};
```

The final concrete resource shapes are not settled. Green’s OpenAPI and data review will determine whether action props contain complete K8s-shaped resources or a smaller, form-ready representation.

If the final contract requires the complete `LLMInferenceServiceConfigKind`, the teams will decide whether that currently LLMD-owned type should be promoted into model-serving’s shared public types. This decision is deferred until the API-to-install-data mapping is agreed.

The contract needs representative fixtures for a Runtime image with: a Serving runtime template only, an accelerator configuration only, both resources, neither resource, and incomplete/invalid resource data.

Regardless of the final compile-time type shape, runtime validation remains necessary before a form uses API/router data. Invalid or incomplete data must show an actionable error state, never silently default into a broken create call.

## Existing form requirements

### Serving runtime template

Current implementation:

- `packages/kserve/src/settings/servingRuntimeTemplates/CustomServingRuntimeAddTemplate.tsx`
- Full-page routes: `packages/kserve/src/settings/servingRuntimeTemplates/ServingRuntimeTemplatesFormRoutes.tsx`

The existing form requires:

- ServingRuntime YAML, validated as a ServingRuntime;
- API protocol: `REST` or `GRPC`;
- one or more model types: `predictive` and/or `generative`.

Existing edit prefill reads the YAML from `TemplateKind.objects[0]`, API protocol from `opendatahub.io/apiProtocol`, and model types from the JSON-encoded `opendatahub.io/model-type` Template annotation.

### LLM accelerator configuration

Current implementation:

- `packages/llmd-serving/src/settings/llmAcceleratorConfigs/LlmAcceleratorConfigAddForm.tsx`
- Full-page routes: `packages/llmd-serving/src/settings/llmAcceleratorConfigs/LlmAcceleratorConfigFormRoutes.tsx`

The existing form requires:

- display name/Kubernetes name source;
- optional runtime version (`opendatahub.io/runtime-version`);
- valid LLMInferenceServiceConfig YAML.

On create, it normalizes API version and kind, dashboard namespace, accelerator/dashboard labels, display name, and version metadata.

### Resource provenance

Green and Zaffre must confirm whether library deployment resources are clean source definitions or serialized live Kubernetes resources. Server-assigned metadata—such as `resourceVersion`, UID, managed fields, owner references, and controller-specific annotations—must not be recreated. The installation flow must treat library resources as sources, not as live resources to copy verbatim.

## Package architecture

### Routing

Green registers the Runtime image library tab via `app.tab-route/tab`. model-serving can independently register a full-page absolute `app.route`; it does not need literal nested JSX inside Green’s package. This follows the existing KServe and LLMD Serving pattern: their list content is tabbed, while Add/Edit/Duplicate forms are separate full-page routes.

The final library/detail/Install URL hierarchy and identifier strategy are unresolved. A routing spike is needed, likely Green-owned because it depends on their pages and routes. This does not block Zaffre: Zaffre can initially mount an independent top-level page, then migrate it when the final nested path is known. Flags, breadcrumbs, and return/cancel paths must be aligned as part of that work.

### Dependency direction

The intended dependency direction is:

```text
model-registry / AI Hub package ──► model-serving
kserve ───────────────────────────► model-serving
llmd-serving ─────────────────────► model-serving
model-serving ────────────────────► no platform package
```

Model-serving must not directly import form components from KServe or LLMD Serving because both platform packages already depend on model-serving. That would create a circular dependency.

### Install page and target extensions

Model-serving owns the Install page shell and Step 1. KServe and LLMD Serving contribute Step 2 through `model-serving.runtime-image/install-target` extensions.

The target extension requirements are:

- identify its supported install destination;
- support model-serving’s Step 1 destination presentation;
- receive the selected Runtime image deployment resource;
- validate/map resource data into its existing form state;
- render a reusable target-specific form body;
- own resource creation, error/loading behavior, and redirect to its existing list page after success.

The exact TypeScript extension API is intentionally deferred to the implementation story. The responsibility boundary is established now.

## Form reuse/refactor direction

Existing Add/Edit/Duplicate route components combine route handling, breadcrumbs/page shell, source-resource lookup, initial state, form UI, and submission behavior. They cannot simply be mounted inside the new Install wizard.

The expected refactor is:

```text
Existing platform page route
  └─ platform-owned reusable target form body
       ├─ accepts explicit initial/prefill data
       ├─ validates and maps target resource data
       ├─ owns create behavior and submit state
       └─ redirects to its existing list page on success

model-serving Install page
  └─ owns page shell, Step 1, selected-target rendering, and invalid-state UX
```

This keeps KServe and LLMD Serving responsible for their resource APIs and avoids reversed package dependencies.

## Error handling

The Install page must show explicit, non-silent error/empty states for:

- missing or invalid router-state install data;
- a Runtime image with no supported deployment resource;
- selected target data that fails platform-owned validation;
- create failures from the platform form.

The established model-catalog deployment router-state pattern survives reload. Invalid-data handling is still required for malformed state, unsupported deep links, or unavailable/mismatched deployment resources.

## Decisions made

- Use **Runtime image library**, not Runtime Catalog.
- The library UI and AI Hub data integration are Green-owned.
- Green uses the existing `core.action` mechanism to render the Install action; Zaffre owns the action extension.
- Green creates the feature flag and `SupportedArea`; exact naming and gates remain open.
- Zaffre owns the Install wizard.
- No project selection occurs in this feature.
- Deployment resources are not project-scoped.
- A Runtime image can offer one or both supported deployment resources.
- Use optional keyed deployment-resource properties, not an array.
- Step 1 derives available destinations from defined resource properties.
- Model-serving owns the wizard shell and Step 1.
- KServe and LLMD Serving own Step 2 form bodies, creation, and post-success redirects through install-target extensions.
- Model-serving exports an install-data contract analogous to `DeployPrefillData`; model-registry imports it rather than the reverse.

## Open decisions

- Final Runtime image library/detail/Install URL shape and identifier strategy.
- Action `group` value for the Runtime image detail page.
- Feature-flag and `SupportedArea` name, route gates, and RBAC behavior.
- Exact Runtime image API-to-install-data mapping, including resource cardinality.
- Whether action props contain complete deployment resources or form-ready data.
- Whether the contract uses the complete `LLMInferenceServiceConfigKind`, and consequently whether that type moves to model-serving shared types.
- Exact install-target extension TypeScript API.
- Return/cancel destination and the detail-page behavior for no-resource Runtime images.
