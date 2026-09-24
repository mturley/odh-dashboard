# Runtime image library: Zaffre story worklist

## Purpose

This is a working breakdown for Zaffre-owned work only. It is intentionally independent of Green’s final Runtime image API shape and does not create a dependency on Green’s current catalog API proposal.

The exact Jira descriptions, acceptance criteria, estimates, and sequencing will be refined after this list is agreed.

## Temporary planning assumptions

- A Runtime image has **at most one** Serving runtime template and **at most one** LLM accelerator configuration.
- It is not yet known whether every Runtime image supplies both targets. Until confirmed otherwise, Zaffre supports a Runtime image with either target, both targets, or neither target.
- Zaffre begins with a clearly marked temporary `RuntimeImageActionData` placeholder, including a `cancelReturnRoute` and optional keyed target values. This is generic data for Runtime image detail-page actions; the Install action consumes it. Green and Zaffre will replace the target values with the agreed action-props shape after their data-contract review.
- Green owns the Runtime image library, its canonical API type/data source, and the final `core.action` group in which Zaffre’s Install action will be rendered.
- Green has already merged the `runtimeCatalog` feature flag and `SupportedArea.RUNTIME_CATALOG`; all temporary Zaffre work is gated behind that area.
- Platform forms create their resources directly and redirect to their existing list tabs after success.

## Proposed stories

### 1. Add a temporary Runtime image Install action and wizard foundation

**Likely package:** `model-serving`

Create a complete, observable model-serving foundation before Green’s Runtime image library page and extension point exist:

- define an explicitly temporary empty `RuntimeImageActionData` object type, then evolve it into a clearly temporary optional keyed-resource shape;
- add a temporary `core.action` rendering location outside the Runtime image library, such as the Model deployment settings page header; clearly mark it for removal once Green renders the final Runtime image detail-page action group;
- register the Zaffre Install action in that temporary location;
- redirect from the temporary action to an independent top-level absolute Install route using router state, including a temporary `cancelReturnRoute`;
- render the full-page Install shell, title, temporary breadcrumb/return behavior, and two-step wizard structure;
- define the `model-serving.runtime-image/install-target` extension point and shared destination identifiers;
- render Step 1 destination options only for target resources present in the temporary action data, then route the selected destination to the corresponding target extension for Step 2; Step 2 provides Back to return to Step 1 and Cancel to leave the flow through the supplied `cancelReturnRoute`; 
- render explicit unavailable/empty states for missing or malformed router/action data and for a Runtime image with no supported target;
- gate every temporary action, route, and page registration behind `SupportedArea.RUNTIME_CATALOG`;
- test the temporary action-to-route handoff, destination selection, and invalid/no-target states.

**Does not include:** target-form reuse or implementation, final action props, Green’s final action group, or Green’s final route-extension mechanism.

**Green dependency:** none. This story deliberately creates temporary, removable Zaffre-only scaffolding; its target-resource values remain placeholders until Green and Zaffre agree the final data contract.

---

### 2. Reuse the Serving runtime template form as an install target

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

### 3. Reuse the LLM accelerator configuration form as an install target

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

### 4. Mount the Install page through Green’s finalized route-extension mechanism

**Likely package:** `model-serving`, coordinated with Green’s Runtime image library route work

After Green completes its routing spike, replace the temporary independent top-level route with the agreed mechanism for extending or mounting beneath the Runtime image library routes:

- implement the route-extension mechanism chosen by Green’s spike, rather than assuming that a common URL prefix is sufficient;
- mount the Install page at the final library/detail route location;
- replace temporary page chrome with the agreed breadcrumb, route parameters, and cancel behavior that returns to the Runtime image detail page through the action-supplied `cancelReturnRoute`; 
- remove the temporary route registration without changing the Install shell, destination selection, or platform target forms;
- test that the final route mechanism renders the Install page at the expected library navigation location.

**Does not include:** final action data/action-props mapping or replacing the temporary action rendering location.

**Green dependency:** Green must complete and document the routing spike, including the route-extension mechanism and final mounting contract.

---

### 5. Integrate the finalized Green Runtime image action-data contract

**Likely package:** `model-serving`, coordinated with Green’s Runtime image action work

Replace temporary action scaffolding with the final Green-to-Zaffre action handoff:

- map Green’s final `core.action` props into the final model-serving `RuntimeImageActionData` contract, including a `cancelReturnRoute` to the Runtime image detail page;
- replace temporary target-resource placeholder values with the agreed representation;
- register the Zaffre Install action in Green’s final Runtime image detail-page action group;
- remove the temporary Model deployment settings action-rendering location and its temporary action registration;
- validate supported-target combinations using Green-provided representative fixtures;
- add or update integration coverage for the Green-to-Zaffre action handoff and invalid data states.

**Does not include:** changing the final route mechanism already integrated in story 5.

**Green dependency:** finalized action group, action props/data contract, target-resource cardinality/provenance confirmation, and representative fixtures.

## Suggested dependency order

```text
Story 1: temporary action + wizard foundation
   ├─ Story 2: KServe install target
   └─ Story 3: LLMD install target

Stories 1–3 ──► Story 4: final route-extension mechanism
Stories 1–3 ──► Story 5: final action-data contract
```

Stories 4 and 5 are independently sequenced by Green’s routing spike and action-data-contract work; either may complete first. Story 1 produces a visible, gated Zaffre-only vertical slice. Stories 2 and 3 can run in parallel after Story 1 establishes the target-extension direction.

## Questions to resolve before final Jira descriptions

- Does this five-story split match desired story size?
- What route-extension mechanism does Green’s routing spike select, and what Zaffre API/registration does it require?
- What form of testing is expected for the temporary contract, final route mounting, and final action-data handoff?
- Which final user-facing copy should the unavailable/no-target state use?
