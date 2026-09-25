# RHOAIENG-96638 — Implementation plan: placeholder Runtime image Install foundation

**Status:** Personal working plan, not repository documentation or a Jira description. No production target forms in this story. Source of truth for scope: [RHOAIENG-96638](https://redhat.atlassian.net/browse/RHOAIENG-96638). The [local story draft](runtime-image-library-story-1-install-foundation.md) is a reference copy.

## Objective and boundaries

Ship a gated, inspectable flow within `@odh-dashboard/model-serving`: a placeholder Install action on **Model deployment settings → General settings** opens a standalone placeholder Install page. Step 1 chooses a supported deployment-resource destination; the model-serving shell discovers and lazy-renders the selected `model-serving.runtime-image/install-target` extension at Step 2. **Do not register or ship a fake target implementation**; KServe and LLMD Serving deliver the real implementations in RHOAIENG-96639 and RHOAIENG-96640. Test-only extension stubs are allowed in unit/component tests.

Avoid importing model-registry, KServe, or LLMD Serving into model-serving. Keep the placeholder action/route/fixture isolated and clearly marked for removal by the later action-data/route-integration stories. No work on Green’s BFF/API or the final library route here. Do not add Segment events beyond the scope assigned to the later analytics story.

## Confirmed code anchors

- `packages/model-serving/extensions/odh.ts`: Model deployment settings page and General settings tab already require `MODEL_SERVING` and `ADMIN_USER`. Add a separately gated **placeholder route** here or in a dedicated extension file aggregated by `extensions/index.ts`.
- `packages/model-serving/src/components/settings/GeneralSettingsTab.tsx`: Zaffre-owned tab body and temporary `core.action` rendering site. Existing settings loading/error handling must remain unchanged.
- `packages/model-serving/extensions/model-catalog.ts`, `modelRegistry/DeployPrefillAction.tsx` and `src/shared/types/deploy-prefill.ts`: existing `core.action` and typed-props precedent; the navigation helper passes `cancelReturnRoute` in router state.
- `packages/plugin-core/src/core/helpers/ExtensibleActions.tsx`: `componentProps` is `Record<string, unknown>`; a group filters generic actions. Action component must guard incoming props itself.
- `packages/model-serving/extension-points/index.ts`, `package.json` exports: extension-point conventions and public API for KServe/LLMD consumers.
- `packages/model-serving/src/ModelDeploymentWizardRoutes.tsx`, `frontend/src/app/AppRoutes.tsx`: existing full-page dynamic `app.route` rendering; the new placeholder path must not rely on Green’s tab JSX.
- `packages/model-serving/src/shared/types.ts`: `ServingRuntimeAPIProtocol.REST`/`.GRPC` have **values `REST`/`gRPC`**; model types are `predictive`/`generative`. Do not accidentally use uppercase `GRPC` as an enum value.
- `frontend/src/concepts/areas/const.ts`: `RUNTIME_CATALOG` already exists, is off by default, and relies on `MODEL_SERVING` and `K_SERVE`. The plan does not change this area definition; discuss any tension this creates for LLMD-only installations separately.
- `packages/model-serving/cypress/tests/mocked/modelServing/modelDeploymentSettingsTabs.cy.ts` and `src/components/settings/__tests__/GeneralSettingsTab.spec.tsx`: closest existing test patterns.

## Prerequisites / questions to settle while implementing

1. **UX confirmation:** the two supplied Step 1 screenshots (captured 2026-09-25) show specific copy, selection behavior, and layout; transcribe these as a design reference below, **not** approval for all states. Confirm with UX the Step 1 radio labels/descriptions, conditional-option presentation, default selection, contextual text, dynamic Step 2 name, and disabled-target explanation, especially for zero/one supported resource. Do not present the screenshots as evidence for states they do not show.
2. **Unavailable target signal:** inspect how `useExtensions` filters flagged-out platform contributions; a missing extension may mean disabled feature, missing CRD, or plugin not installed. Do not claim a precise reason without evidence. Until a reason is available, show a truthful generic disabled explanation. Determine whether a distinct permission signal is accessible in this shell. Avoid silently hiding a resource-backed option.
3. **Placeholder entry point:** General settings has no Runtime image object. Provide one clearly marked *placeholder demo fixture* at this temporary rendering site (not a shipped install-target extension and not a Green API mock). Choose a safe, valid return route back to General settings until the real detail-page route exists. Keep the fixture easy to remove; do not create resources or invoke a target form with it in this story.
4. **Testing boundary:** mocked Cypress can exercise the action, route, Step 1, no-target and unavailable-target states using the placeholder entry point; it cannot show a working production Step 2 form before Stories 2/3. Test Step 2 host rendering with a **test-only** stub via mocked extensions in Jest/RTL. Do not ship a fake extension merely to make Cypress pass.

## Step 1 UX reference from the supplied screenshots

These are two views of the **same** Step 1 with both options present: one with Serving runtime template selected, one with LLM accelerator configuration selected. They do **not** demonstrate a single-target, no-target, or disabled-target state. Treat wording as screenshot-derived/provisional until UX confirms it for implementation.

| Surface | Screenshot copy / behavior |
|---|---|
| Header | `Install vLLM 0.6.0` (derive the image name from valid action data); subtitle: `Choose how this runtime image should be installed, then review and edit the configuration before creating it on this cluster.` |
| Breadcrumbs | `Model deployment settings > Runtime image library > vLLM 0.6.0 > Install`. For Story 1’s independent route, **do not create dead links to Green pages**: link only known working destinations and use a placeholder-safe breadcrumb/return until Story 4 supplies the final library hierarchy. |
| Step sidebar | Step 1 `Install destination` (active); Step 2 `Configure template` when Serving runtime template is selected, or `Configure accelerator` when LLM accelerator configuration is selected. The Step 2 label changes with selection. |
| Main heading / hint | `Choose install destination`; `Select where this runtime image should be available after installation.` |
| First radio | `Serving runtime template`; description: `Install as a ServingRuntime for legacy deployments and predictive models.` When selected, show `Appears under **Serving runtime templates** and the legacy deployment wizard.` beneath its description (bold only the list name). |
| Second radio | `LLM accelerator configuration`; description: `Install as an LLMInferenceServiceConfig for LLM inference service deployments.` When selected, show `Appears under **LLM accelerator configurations** and the LLM inference service deployment wizard.` beneath its description (bold only the list name). |
| Step 1 footer | `Back` disabled, `Next` primary and enabled when the currently selected target can be installed, `Cancel` link-style. The screenshots show a selected option in each view, but do not establish which option, if any, should be selected by default. |

Only show the selected radio’s `Appears under …` line; changing selection swaps both this line and the Step 2 label. Preserve the two-column wizard treatment (numbered sidebar left; radio content and footer right) and accessible radio labels/hints. **Do not extrapolate** the screenshot’s two-option UI into showing absent resources. Ask UX how unavailable targets should be disabled and described, and whether a single available target is auto-selected; until decided, avoid automatically advancing or submitting on Step 1. In the placeholder flow, Cancel should return to the validated `cancelReturnRoute` (temporary General settings URL); Step 1 Back remains disabled, while Step 2 Back returns to Step 1. The screenshot’s final-library breadcrumb and detail-page return behavior belong to Stories 4/5.

## Implementation steps

### 1. Define the placeholder shared contract and destination catalog

- Add e.g. `packages/model-serving/src/shared/types/placeholder-runtime-image-action.ts`; export it by a narrow entry in `packages/model-serving/package.json`, following `./shared/types/deploy-prefill`. Keep all imports toward existing model-serving and infrastructure types.
- Define:

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

- Define stable destination IDs keyed to `servingRuntimeTemplate` and `llmAcceleratorConfiguration`, plus model-serving-owned Step 1 text from the screenshot-derived reference above (subject to UX review). Include each radio’s base description, selected-only `Appears under …` detail, and the selection-dependent Step 2 title. Do not delegate radio text to a platform extension, since it may be absent. Ensure changes can be replaced by the final Green handoff without exposing Green internals.
- Validate only the **envelope** at runtime: plain object shape for props/state and `deploymentResources`, non-empty strings for identity and `cancelReturnRoute`, and presence/absence of recognized target keys. If a target property exists but its value is malformed, avoid crashing; leave detailed YAML/protocol/name validation to the target in Step 2. Decide whether `null` should count as absent/invalid and test it explicitly. Do not treat an empty string as a ready API/route parameter. Avoid overly broad assertions (`as PlaceholderRuntimeImageActionData`) before checks.
- Unit-test envelope parsing, including `undefined`, arrays, nulls, empty IDs, missing `deploymentResources`, zero/one/both resources, and malformed target payloads that must not crash the shell.

### 2. Define the target extension-point API (host only)

- Add a type guard and typed extension definition at an exported model-serving extension-point entry (either `extension-points/index.ts` or a focused sibling exported via `package.json`): `model-serving.runtime-image/install-target`.
- Require stable `destinationId` and a lazy `ComponentCodeRef` for a Step 2 component. Props must make the shared navigation contract explicit: the selected target payload, `onBack`, and `cancelReturnRoute`. Platform components own their **Install/Create**, **Back**, and **Cancel** controls, API calls, tracking, and success redirects; the host does not assemble K8s resources.
- Keep the host-side API sufficient for both target payloads without importing platform resource types. Use the placeholder union/keyed types or target-specific narrowing; document where platform validation begins. Check compatibility with `ComponentCodeRef` and `LazyCodeRefComponent` typing and with package exports so later platform stories can consume it.
- Guard duplicate contributions for one destination (avoid arbitrary `find` winner; explicit unavailable/error handling or deterministic choice with a warning) and missing code refs without crashing. Only one install target per destination should be selected.
- Unit-test type guard, lookup, missing extension and duplicate handling. Mock `useExtensions`/lazy component resolution in host tests; no product-code mock extension.

### 3. Register a clearly removable placeholder action and route

- Create a model-serving `core.action` with a unique ID and **placeholder-only group**; gate it with `RUNTIME_CATALOG`, `MODEL_SERVING`, and `ADMIN_USER` to match the parent settings access. Keep it out of Green’s future group until Story 5. Lazy-load the action component.
- In `GeneralSettingsTab`, render `ExtensibleActions` filtered by that placeholder group, with `componentProps` containing the explicitly labeled demo `PlaceholderRuntimeImageActionData`. Place it separately from the Save changes action; do not alter save state or shared tab-page chrome. Render only when area gating is active (group/component availability does not by itself hide an empty container). Mark this rendering and fixture as remove-in-Story-5 scaffolding.
- Export the action component as `React.ComponentType<Record<string, unknown>>` or equivalent safe generic boundary. Check props with the lightweight envelope guard; show a disabled button with explanatory tooltip/alert when invalid rather than silently disappearing. On click, navigate with `{ state: { actionData: validatedData } }` to the independent placeholder Install path; do not fetch Green data or ask for a project.
- Register the placeholder full-page `app.route` at a new absolute path **outside** `/settings/model-resources-operations/model-deployment-settings/*` and outside Green’s future tab prefix. Gate it with the same three flags and render a lazy model-serving page component. Put both placeholder URL and group in obvious constants to simplify removal. Check how the host treats a direct URL after gating: a missing route may render NotFound for non-admin users; within a visible gated page show an explicit permission explanation if it can be reached without authorization. Never rely on a hidden button as authorization.
- Unit-test extension registrations, gate flags, action validation, click-to-router-state handoff, and General settings rendering without affecting existing save/load behavior.

### 4. Build Step 1 and full-page wizard shell

- Implement an Install page in `packages/model-serving/src/components/` (suggested `runtimeImageInstall/` directory) using existing page and PatternFly wizard patterns. Read router state defensively via `useLocation`; validate it independently of action validation (deep links and altered state). Derive a safe placeholder breadcrumb and return destination. If state is absent or invalid, show an actionable unavailable/empty state with a known safe link to General settings; **never** navigate to an unvalidated `cancelReturnRoute`.
- For valid data, derive radio options by presence of each keyed resource. **Do not** require both. If neither is present, show a clear no-supported-target state and a return link. If one or both are present but their install-target extensions are absent/gated, show corresponding disabled options with a truthful explanation. Continue to Step 2 only with a selected, available extension; prevent selection if not available. Check access and platform availability before rendering; absence alone is not proof of a specific permission failure.
- Implement Step 2 host rendering with lazy loading (`LazyCodeRefComponent`) and loading/error UX consistent with the plugin pattern. Pass the selected payload, an `onBack` callback to return to Step 1, and validated `cancelReturnRoute` to the platform component. Re-check selection if action data changes or extensions become unavailable; do not render stale data or call creation from the host.
- Preserve the prior radio selection on Step 2 Back. Keep Step 1 Back disabled and Next disabled until a selectable destination is chosen; do not assume a default selection based solely on the two screenshots. Step 1 Cancel navigates to the validated return route; Step 2 Cancel belongs to the target extension. Make radio/step navigation keyboard accessible. Shell title/breadcrumb use runtime image name only for display, not analytics or URL interpolation. Use the screenshot-derived Step 1 text as provisional copy pending UX confirmation.
- Component-test identity/state validation, 0/1/2 resources, available/unavailable extensions, Step 1 selection and Back, cancel navigation with a test-only target stub, empty states, and lazy-loading errors. Keep test stubs inside `__tests__/`.

### 5. Mocked Cypress coverage without a shipped target

- Add e.g. `packages/model-serving/cypress/tests/mocked/modelServing/runtimeImageInstallFoundation.cy.ts` following the settings-tabs spec’s product-admin and `/api/config` intercept setup; enable `runtimeCatalog` explicitly and required serving/KServe DSC areas. Mock `/api/cluster-settings` for the General settings tab.
- Verify the placeholder action is visible to an admin when enabled, launches the standalone page with router state, and shows Step 1 options that correspond to the placeholder demo data. Assert the screenshot-derived page title, heading, description, radio copy, selected-only `Appears under …` text, dynamic Step 2 label, and Step 1 Back/Next/Cancel controls (subject to UX confirmation). Verify no production Step 2 extension is claimed; resources with unavailable extensions display disabled explanations. Cover feature flag off and non-admin behavior, invalid/no-target flow where it can be driven via the placeholder contract (or keep those as unit/component tests if Cypress cannot inject malformed history state without product mock code). No create request should be fired by this Story 1 flow.
- Do not add any platform form stub or fake install-target registration to production just for this test. The real Cypress success paths are owned by Stories 2/3.

### 6. Verify and hand off

- Check root/package scripts before invoking tests. Candidate commands: `pnpm --filter @odh-dashboard/model-serving run test-unit`, `pnpm --filter @odh-dashboard/model-serving run type-check`, and `pnpm --filter @odh-dashboard/model-serving run lint`; see `package.json` and Cypress frontend scripts for the exact mocked-test runner rather than invoking Cypress directly or reinstalling it.
- If this changes extension registrations, verify the model-serving frontend/federation build path used by the repo; if full Cypress is unavailable, record which checks ran and which did not.
- Review `git diff --check`, extension exports and gating, direct-route behavior, and test-only stub containment. Confirm no model-serving → KServe/LLMD/model-registry dependency and no production target-form implementation.
- Document handoff to Stories 2/3: target IDs, extension-prop types, sample placeholder payloads, and the test-only stub example. Document removal points for Stories 4/5 (route/page chrome versus General-settings action/data/group). Do **not** commit without explicit approval.

## Explicit test matrix

| Condition | Expected result | Owner |
|---|---|---|
| Feature flag off / non-admin | Placeholder entry absent; direct route does not expose install flow | Story 1 |
| Invalid action props | Non-crashing disabled action with explanation | Story 1 |
| Missing/invalid router state | Unavailable state with safe General settings return | Story 1 |
| No supported resource | No radio options or create path; actionable empty state | Story 1 |
| Only one/both resources, extension active | Exactly present targets visible; active target selectable | Host unit tests with test-only stubs |
| Resource present, extension gated/missing | Visible disabled radio option with honest explanation | Story 1 |
| Select target → Back / Cancel | Back returns to Step 1; Cancel follows validated return route | Host unit tests with test-only stub |
| Invalid YAML, create success/failure, target tracking | Deferred to production platform targets | Stories 2/3 |
| Green final route and props | Not needed to complete Story 1 | Stories 4/5 |

## Notes / risks to revisit

- Current `RUNTIME_CATALOG` reliance on `K_SERVE` may affect an LLMD-only cluster; avoid changing shared area semantics in this story without Green/UX alignment.
- Flags on `app.route` are not an authorization boundary for backend creates. Future platform target implementations must retain appropriate API permission handling and explicit errors.
- React Router history state can survive reload in the established model-catalog flow, but direct visits/malformed state still require error UI. Do not embed a callback in router state; `cancelReturnRoute` is a validated string.
- The story’s UX-approved radio copy and disabled-target requirements are unresolved. Avoid prematurely declaring a specific disabled reason based solely on extension absence.
