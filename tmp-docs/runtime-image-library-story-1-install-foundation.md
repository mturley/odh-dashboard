# Add a placeholder Runtime image Install action and wizard foundation

## Description of the enhancement

Provide a visible, gated Zaffre-owned foundation for installing deployment resources from a Runtime image before Green’s Runtime image library detail page, final action group, action data, and route-mounting mechanism are available.

In `model-serving`, introduce a clearly documented `PlaceholderRuntimeImageActionData` contract for development of the Install flow. The placeholder contract is based on the known requirements of the existing target forms and supports zero or one resource for each target without assuming that every Runtime image supports both targets.

Render the placeholder Install action from the Model deployment settings **General settings** tab. This location is Zaffre-owned scaffolding and must be clearly marked for removal when Green renders the final Runtime image detail-page action group. Do not modify the shared `TabRoutePage` header to host the placeholder action.

The action navigates with router state to an independent placeholder absolute Install route. The page provides the full-page two-step wizard shell:

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
- Model-serving defines the `model-serving.runtime-image/install-target` extension point and stable destination identifiers for:
  - Serving runtime template.
  - LLM accelerator configuration.
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
- Step 1 derives destination rows from resources present in the placeholder action data.
- A destination is enabled only when its install-target extension is active under the current platform feature and access gates.
- If a Runtime image contains a target that the user or cluster cannot install, Step 1 presents it as disabled with an explicit explanation rather than silently implying the resource does not exist.
- Selecting an available destination renders the matching install-target extension for Step 2.
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

- This story intentionally does not implement either platform-specific target form.
- Lightweight envelope validation belongs here because generic `core.action` component props are `Record<string, unknown>` at runtime. Deep validation of target payloads belongs to Stories 2 and 3, where existing platform validation can be reused.
- It intentionally does not depend on Green’s final `core.action` group, final Runtime image action data, or route-extension/mounting mechanism.
- The placeholder route, action location, and action-data types are removed or replaced by the final integration stories.
