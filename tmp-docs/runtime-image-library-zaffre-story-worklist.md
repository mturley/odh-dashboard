# Runtime image library: Zaffre story worklist

## Purpose

This is a working breakdown for Zaffre-owned work only. It is intentionally independent of Green’s final Runtime image API shape and does not create a dependency on Green’s current catalog API proposal.

The exact Jira descriptions, acceptance criteria, estimates, and sequencing will be refined after this list is agreed.

## Temporary planning assumptions

- A Runtime image has **at most one** Serving runtime template and **at most one** LLM accelerator configuration.
- It is not yet known whether every Runtime image supplies both targets. Until confirmed otherwise, Zaffre supports a Runtime image with either target, both targets, or neither target.
- Zaffre begins with a clearly marked temporary `RuntimeImageInstallData` placeholder, with optional keyed target values. Green and Zaffre will replace those values with the agreed action-props shape after their data-contract review.
- Green owns the Runtime image library, its canonical API type/data source, feature-area details, and the `core.action` group in which Zaffre’s Install action is rendered.
- Platform forms create their resources directly and redirect to their existing list tabs after success.

## Proposed stories

### 1. Establish Runtime image installation extension foundations

**Likely package:** `model-serving`

Define the model-serving-owned integration foundation needed by the rest of Zaffre’s work:

- temporary, explicitly documented `RuntimeImageInstallData` and action props types, exported similarly to `DeployPrefillData`;
- `model-serving.runtime-image/install-target` extension-point type and target-selection responsibilities;
- shared destination identifiers for Serving runtime template and LLM accelerator configuration;
- type guards/validation boundary for missing, malformed, or unsupported install data;
- unit coverage for extension/type validation behavior.

**Does not include:** choosing Green’s final action-props data shape, importing Green’s API/domain types, or implementing either target form.

**Green dependency:** none to start. The temporary contract is deliberately designed to be replaced once Green finalizes action props.

---

### 2. Add the Runtime image Install action and wizard shell

**Likely package:** `model-serving`

Implement the Zaffre-owned Install action and the model-serving-owned full-page wizard shell:

- register the existing `core.action` extension in Green’s agreed Runtime image action group;
- redirect from the Runtime image detail page to the Install route while carrying temporary install data through router state;
- add a temporary independent absolute Install route, structured so it can move to Green’s final library-prefixed URL later;
- render the page shell, breadcrumb/return behavior, and two-step flow;
- implement Step 1 destination options from the defined optional keyed resources;
- render explicit unavailable/empty states for invalid router/action data and for a Runtime image with no supported target.

**Does not include:** final library route hierarchy, final data mapping, or target-specific form implementation.

**Green dependency:** the final `core.action` group, action props, feature flag/RBAC gates, and final route will require integration follow-up. The story can use temporary placeholders to begin the model-serving implementation.

---

### 3. Reuse the Serving runtime template form as an install target

**Likely package:** `kserve`, contributing to the model-serving install-target extension point

Refactor the existing Serving runtime template Add/Edit/Duplicate implementation so an install-target extension can reuse its form body:

- separate the platform form body from its current route/page shell and existing-template context;
- accept explicit install-prefill input through the target extension;
- initialize ServingRuntime YAML, API protocol, and model-type fields from the selected runtime-image resource;
- retain the existing validation and Template creation behavior;
- have the form create the resource and redirect directly to **Serving runtime templates** on success;
- handle invalid/incomplete resource data with an explicit form-level unavailable/error state;
- preserve existing Add/Edit/Duplicate behavior and tests.

**Does not include:** requiring Green to supply a `TemplateKind`. Zaffre can construct the Template with the existing assembly logic when it receives the required ServingRuntime YAML, API protocol, and model types.

**Green dependency:** final form-prefill payload fields only. The extraction/refactor can begin against temporary fixtures.

---

### 4. Reuse the LLM accelerator configuration form as an install target

**Likely package:** `llmd-serving`, contributing to the model-serving install-target extension point

Refactor the existing LLM accelerator configuration Add/Edit/Duplicate implementation so an install-target extension can reuse its form body:

- separate the platform form body from its current route/page shell and source-config context;
- accept explicit install-prefill input through the target extension;
- initialize the existing name, version, and YAML form fields from the selected runtime-image resource;
- retain current normalization, validation, and LLMInferenceServiceConfig creation behavior;
- have the form create the resource and redirect directly to **LLM accelerator configurations** on success;
- handle invalid/incomplete resource data explicitly;
- preserve existing Add/Edit/Duplicate behavior and tests.

**Does not include:** deciding whether the final inter-package handoff uses the complete `LLMInferenceServiceConfigKind` or a narrower form-ready representation.

**Green dependency:** final accelerator prefill payload fields only. The extraction/refactor can begin against temporary fixtures.

---

### 5. Integrate the finalized Green action contract and route

**Likely packages:** `model-serving`, with Green-owned library changes landing separately

After Green finalizes its action props and library routes, replace the temporary integration assumptions:

- map Green’s action props into the final model-serving install-data contract;
- replace temporary target-resource placeholder values with the agreed representation;
- register/migrate to the final library-prefixed Install URL and agreed breadcrumb/return behavior;
- align feature-area, RBAC, and action-group gating;
- validate the supported-target combinations with Green-provided representative fixtures;
- add or update integration coverage for the Green-to-Zaffre handoff.

**Why this is separate:** it isolates known cross-team dependencies from the reusable Zaffre platform-form work. It should not block stories 1, 3, and 4 from progressing with local temporary fixtures.

## Suggested dependency order

```text
Story 1: extension foundations
   ├─ Story 2: action + Install shell
   ├─ Story 3: KServe install target
   └─ Story 4: LLMD install target

Stories 2–4 ──► Story 5: finalized Green integration
```

Stories 3 and 4 can run in parallel once Story 1 establishes the target-extension direction. Story 2 can also proceed in parallel after Story 1, using the temporary install-data shape.

## Questions to resolve before final Jira descriptions

- Does this five-story split match desired story size, or should stories 1 and 2 be combined?
- Should the final Green-integration work be one Zaffre follow-up story or handled by acceptance criteria/dependency notes on the first four stories?
- What form of testing is expected for the temporary contract versus the cross-team final integration?
- Which final user-facing copy should the unavailable/no-target state use?
