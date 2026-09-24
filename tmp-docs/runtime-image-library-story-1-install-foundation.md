# Add a placeholder Runtime image Install action and wizard foundation

## Description of the enhancement

Provide a visible, gated Zaffre-owned foundation for installing deployment resources from a Runtime image before Green’s Runtime image library detail page, final action group, action data, and route-mounting mechanism are available.

In `model-serving`, introduce a clearly documented `PlaceholderRuntimeImageActionData` contract for development of the Install flow. The placeholder contract is based on the known requirements of the existing target forms and supports zero or one resource for each target without assuming that every Runtime image supports both targets.

In this story, **target forms** refers to the existing **Add serving runtime template** form in the KServe package and **Add LLM accelerator configuration** form in the LLMD Serving package. Stories 2 and 3 will refactor the reusable form bodies and creation behavior out of those existing pages, then register them as pluggable `model-serving.runtime-image/install-target` extensions. Story 1 defines the extension point and wizard host but does not perform those form refactors.

Render the placeholder Install action from the Model deployment settings **General settings** tab. This location is Zaffre-owned scaffolding and must be clearly marked for removal when Green renders the final Runtime image detail-page action group.

The action passes its data through router state and navigates to a placeholder top-level Install route that is independent of Green’s Runtime image library routes. Story 4 will replace this placeholder route after Green’s routing spike determines the final mechanism for mounting the Install page within the Runtime image library route structure. The page provides the full-page two-step wizard shell:

1. **Install destination** presents only targets represented in the placeholder action data and available through active install-target extensions.
2. **Configure** renders the selected target’s implementation through the new `model-serving.runtime-image/install-target` extension point.

The placeholder action, route, and page are gated behind the Runtime image library area and the same administrator/model-serving access expected by Model deployment settings.

## Placeholder action data

The initial form-ready contract should be equivalent to:

```ts
type PlaceholderServingRuntimeTemplateData = {
  servingRuntimeYaml: string;
  apiProtocol: ServingRuntimeAPIProtocol;
  modelTypes: ServingRuntimeModelType[];
};

type PlaceholderLlmAcceleratorConfigurationData = {
  configYaml: string;
  displayName: string;
  k8sName?: string;
  version?: string;
};

type PlaceholderRuntimeImageActionData = {
  runtimeImageId: string;
  runtimeImageName: string;
  cancelReturnRoute: string;
  deploymentResources: {
    servingRuntimeTemplate?: PlaceholderServingRuntimeTemplateData;
    llmAcceleratorConfiguration?: PlaceholderLlmAcceleratorConfigurationData;
  };
};
```

The implementation may adjust field names to fit existing exported types, but it must preserve these form-prefill capabilities and remain explicitly marked as placeholder integration data.

## Acceptance Criteria

- Model-serving exports a documented `PlaceholderRuntimeImageActionData` type and its concrete placeholder target-data types.
  - It includes `runtimeImageId`, `runtimeImageName`, and `cancelReturnRoute`.
  - It has optional keyed values for the Serving runtime template and LLM accelerator configuration targets.
  - It supports zero or one resource for each target and does not assert that both exist.
  - It does not import Green/model-registry API or domain types.
- Model-serving defines the `model-serving.runtime-image/install-target` extension point and stable destination definitions for:
  - **Serving runtime template**, including the UX-approved radio label and description.
  - **LLM accelerator configuration**, including the UX-approved radio label and description.
- Model-serving owns the Step 1 destination text because it owns the wizard shell and must be able to describe a target even when action data contains that target but its platform extension is unavailable. Each install-target extension identifies which stable destination it implements and provides the Step 2 component; it does not define the Step 1 radio text.
- The common Step 2 extension props establish that the target component owns its action bar:
  - **Install/Create** performs platform-owned creation and success navigation.
  - **Back** invokes an `onBack` callback supplied by the model-serving wizard shell.
  - **Cancel** navigates to the supplied `cancelReturnRoute`.
- A placeholder Install action is rendered in the Model deployment settings General settings tab and is visibly documented in code as scaffolding to remove when Green supplies the final action group.
- The placeholder action navigates to an independent absolute Install route with `PlaceholderRuntimeImageActionData` carried through router state.
- The exported `core.action` component performs lightweight runtime validation before reading component props or navigating:
  - the props and `deploymentResources` must be objects;
  - runtime image identity and `cancelReturnRoute` must be strings;
  - malformed top-level props produce a non-crashing disabled/unavailable action state.
- Target payload validation is deliberately deferred to the selected install-target extension in Step 2 so each platform can reuse its existing validation behavior.
- The Install page independently validates router-state envelope data and renders an actionable unavailable state for missing or malformed state.
- The placeholder Install page renders a full-page wizard shell with a title, placeholder breadcrumb/return behavior, and two-step structure.
- Step 1 displays a radio option for each deployment-resource type present in the placeholder action data. For example, it displays only **Serving runtime template** when `servingRuntimeTemplate` is present, and displays both options when both target resources are present. Confirm this conditional-option behavior with UX before finalizing the implementation.
- A destination is enabled only when its install-target extension is active under the current platform feature and access gates.
- If a Runtime image contains a target that the user or cluster cannot install, Step 1 presents it as disabled with an explicit explanation rather than silently implying the resource does not exist. Further investigation is required to confirm whether this state can occur, whether disabled-target UX is necessary, and what explanation should be shown.
- Selecting an available destination causes the wizard host to resolve and render the matching registered install-target extension for Step 2. Story 1 verifies this host behavior with a minimal stub component supplied only by the unit/component test harness (for example, by mocking the extensions returned to the host). It does not register or ship a mock install-target extension in product code. The production KServe and LLMD Serving extensions are implemented in Stories 2 and 3.
- The page renders an actionable unavailable state when no supported target can be installed.
- Back from Step 2 returns to Step 1 without creating a resource.
- Cancel from Step 2 navigates to `cancelReturnRoute` without creating a resource or redirecting to a target list.
- The placeholder action, route, and page require:
  - `SupportedArea.RUNTIME_CATALOG`;
  - the model-serving area; and
  - administrator access consistent with Model deployment settings.
- Unit/component tests cover runtime action-prop validation, action-to-route handoff, target-option derivation, unavailable/disabled target behavior, selected-target rendering, Back, Cancel, and invalid/no-target states.
- A mocked Cypress test covers the placeholder action through destination selection and verifies the invalid/no-target experience.

## Additional info

- UX mockup: [Runtime image Install wizard](https://rhoai-3-6-c2d6f6.pages.redhat.com/settings/model-resources/serving-runtime-templates/catalog/catalog-vllm-0-6-0/install)
- Story 1 owns the Step 1 destination identifiers, radio labels/descriptions, extension point, and model-serving host logic that discovers, selects, and renders an install-target extension. Its tests may supply a minimal stub component through mocked extension results, but Story 1 does not register or ship an install-target extension in product code. Stories 2 and 3 extract the reusable bodies from the existing Add serving runtime template and Add LLM accelerator configuration pages and contribute the production KServe and LLMD Serving install-target extensions.
- Lightweight envelope validation belongs here because generic `core.action` component props are `Record<string, unknown>` at runtime. Deep validation of target payloads belongs to Stories 2 and 3, where existing platform validation can be reused.
- It intentionally does not depend on Green’s final `core.action` group, final Runtime image action data, or route-extension/mounting mechanism.
- The placeholder route, action location, and action-data types are removed or replaced by the final integration stories.
