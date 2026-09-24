# Runtime image library: Zaffre story worklist

## Purpose

This is a working breakdown for Zaffre-owned work only. It is intentionally independent of Green’s final Runtime image API shape and does not create a dependency on Green’s current catalog API proposal.

The detailed descriptions and acceptance criteria live in the six corresponding story draft files in this directory.

## Placeholder planning assumptions

- A Runtime image has **at most one** Serving runtime template and **at most one** LLM accelerator configuration.
- It is not yet known whether every Runtime image supplies both targets. Until confirmed otherwise, Zaffre supports a Runtime image with either target, both targets, or neither target.
- Zaffre begins with a clearly marked `PlaceholderRuntimeImageActionData` contract containing `cancelReturnRoute` and concrete, form-ready placeholder data for each optional target.
- Green owns the Runtime image library, its canonical API type/data source, and the final `core.action` group in which Zaffre’s Install action will be rendered.
- Green has already merged the `runtimeCatalog` feature flag and `SupportedArea.RUNTIME_CATALOG`.
- The placeholder action is rendered in the Zaffre-owned Model deployment settings **General settings** tab; shared `TabRoutePage` header code is not modified for placeholder scaffolding.
- The Install page also requires administrator/model-serving access consistent with Model deployment settings.
- Model-serving validates the generic action/router-state envelope. Each platform extension validates its own target payload when Step 2 renders.
- Platform target components own their Step 2 action bar and resource creation:
  - Install/Create performs platform creation and redirects to the existing target list after success.
  - Back invokes the shell-provided `onBack` callback.
  - Cancel navigates to `cancelReturnRoute`.

## Proposed stories

### 1. Add a placeholder Runtime image Install action and wizard foundation

**Likely package:** `model-serving`

Create the initial visible vertical slice:

- define concrete placeholder action and target-data types;
- render a removable placeholder Install action in General settings;
- navigate through router state to a placeholder absolute route;
- provide the full-page two-step wizard shell;
- define `model-serving.runtime-image/install-target`;
- perform lightweight runtime validation of generic action props and router state;
- derive Step 1 rows from present resources, enabling only targets with active, permitted extensions;
- show disabled explanations plus explicit permission, unavailable-target, malformed-data, and no-target states;
- gate the flow with Runtime Catalog, model-serving, and administrator access;
- cover the vertical slice with unit/component and mocked Cypress tests.

**Green dependency:** none. The placeholder contract and action location are intentionally removable.

---

### 2. Install a Serving runtime template from a Runtime image

**Likely package:** `kserve`

Refactor and reuse the existing Serving runtime template form as the KServe install target:

- accept `PlaceholderServingRuntimeTemplateData`;
- validate in Step 2 using existing KServe/YAML validation;
- prefill ServingRuntime YAML, API protocol, and model types;
- retain Template assembly, dry-run, duplicate-name, and create behavior;
- own Install/Create, Back, Cancel, and success redirect behavior;
- retain existing form tracking with `source: 'install'` and no PII;
- preserve Add/Edit/Duplicate behavior;
- add unit/component and mocked Cypress coverage.

**Green dependency:** none for placeholder implementation. Story 5 replaces the adapter with Green’s final representation.

---

### 3. Install an LLM accelerator configuration from a Runtime image

**Likely package:** `llmd-serving`

Refactor and reuse the existing accelerator configuration form as the LLMD install target:

- accept `PlaceholderLlmAcceleratorConfigurationData`;
- validate in Step 2 using existing parsing/object-shape validation;
- prefill name, optional version, and YAML;
- retain existing normalization and create behavior;
- own Install/Create, Back, Cancel, and success redirect behavior;
- retain existing form tracking with `source: 'install'` and no PII;
- preserve Add/Edit/Duplicate behavior;
- add unit/component and mocked Cypress coverage.

**Green dependency:** none for placeholder implementation. Story 5 replaces the adapter with Green’s final representation.

---

### 4. Mount the Install page through Green’s finalized route-extension mechanism

**Likely package:** `model-serving`, coordinated with Green

Replace the placeholder route and page chrome with Green’s final route-extension/mounting mechanism, final location, parameters, breadcrumb, and detail-page Cancel destination without changing the wizard or platform target behavior.

**Blocked / not sprint ready:** Green must first complete and document its routing spike and final mounting contract.

---

### 5. Integrate Green’s finalized Runtime image action-data contract

**Likely package:** `model-serving`, coordinated with Green

Replace `PlaceholderRuntimeImageActionData` and the General settings action with Green’s final generic action data and Runtime image detail-page action group. Retain layered runtime validation: generic envelope validation in the action/page and target-payload validation in Step 2.

**Blocked / not sprint ready:** Green must first finalize the action group, action props, target representation, `cancelReturnRoute`, RBAC/visibility behavior, provenance expectations, and fixtures.

---

### 6. Add UX-approved analytics for the Runtime image Install flow

**Likely packages:** `model-serving`, `kserve`, and/or `llmd-serving`, depending on the approved event plan

Consult UX/PM and implement only the additional cross-target events needed beyond automatic page views and existing platform form events with `source: 'install'`. Candidate interactions include starting, changing destination, Back, Cancel, and unavailable states. Follow the Segment guide and send no PII or user-generated content.

**Dependency:** Story 1 establishes the wizard interactions; UX/PM must approve the tracking plan before implementation is finalized.

## Suggested dependency order

```text
Story 1: placeholder action + wizard foundation
   ├─ Story 2: KServe install target
   └─ Story 3: LLMD install target

Stories 1–3 ──► Story 4: final route-extension mechanism (blocked on Green routing spike)
Stories 1–3 ──► Story 5: final action-data contract (blocked on Green action contract)
Story 1 ─────► Story 6: UX-approved analytics
```

Stories 2 and 3 can run in parallel after Story 1 establishes the target-extension contract. Stories 4 and 5 are independently blocked by separate Green deliverables and may complete in either order.
