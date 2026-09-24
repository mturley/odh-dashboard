# Add a temporary Runtime image Install action and wizard foundation

## Description of the enhancement

Provide a visible, gated Zaffre-owned foundation for installing deployment resources from a Runtime image before Green’s Runtime image library detail page, final action group, action data, and route-mounting mechanism are available.

In `model-serving`, introduce a temporary `RuntimeImageActionData` contract for Runtime image detail-page actions. The contract is intentionally generic—the Install action is its first consumer—and its target-resource fields are temporary placeholders. It must support zero or one resource for each target, without assuming every Runtime image supports both targets.

Create a temporary `core.action` rendering location in the Model deployment settings page header and clearly identify it as temporary code to remove when Green renders the final Runtime image detail-page action group. Register the Zaffre Install action there.

The action must navigate with router state to an independent, temporary absolute Install route. Its action data must include a temporary `cancelReturnRoute` so the Install flow can leave the wizard and return to the Runtime image detail page when final integration is available. That page provides the full-page two-step wizard shell:

1. **Install destination** presents only targets represented in the temporary action data.
2. **Configure** renders the selected target’s implementation through the new `model-serving.runtime-image/install-target` extension point.

The temporary action, route, and page must be gated behind `SupportedArea.RUNTIME_CATALOG`.

## Acceptance Criteria

- Model-serving exports a documented, explicitly temporary `RuntimeImageActionData` type for Runtime image actions.
  - It includes a `cancelReturnRoute` used to leave the Install flow.
  - It has optional keyed values for the Serving runtime template and LLM accelerator configuration targets.
  - It supports zero or one resource for each target and does not assert that both exist.
  - It does not import Green/model-registry API or domain types.
- Model-serving defines the `model-serving.runtime-image/install-target` extension point and stable destination identifiers for:
  - Serving runtime template.
  - LLM accelerator configuration.
- A temporary `core.action` rendering location is available in the Model deployment settings page header and is visibly documented in code as scaffolding to remove when Green supplies the final action group.
- The temporary Zaffre Install action is registered in that location and receives temporary action data through component props.
- Selecting the action navigates to a temporary independent absolute Install route with the action data and a temporary `cancelReturnRoute` carried through the established router-state pattern.
- The temporary Install page renders a full-page wizard shell with a title, temporary breadcrumb/return behavior, and two-step structure.
- The Install flow provides a separate Cancel action that leaves the wizard through the supplied `cancelReturnRoute`; it does not create a resource or redirect to a target list.
- Step 1 lists only destinations for resources present in the temporary action data.
- Selecting a destination renders the matching registered install-target extension for Step 2.
- The page presents an actionable unavailable state, without issuing a create call, when:
  - router/action data is missing or malformed;
  - no supported target resource is present; or
  - a selected target extension is unavailable.
- All temporary action, route, and page registrations are gated by `SupportedArea.RUNTIME_CATALOG`.
- Unit tests cover the temporary action-to-route handoff, target-option derivation, selected-target rendering, and invalid/no-target states.

## Additional info

- This story intentionally does not implement either platform-specific target form.
- It intentionally does not depend on Green’s final `core.action` group, final Runtime image action data, or route-extension/mounting mechanism.
- The final temporary-route removal, final action-group registration, and final contract mapping are separate follow-up stories.
