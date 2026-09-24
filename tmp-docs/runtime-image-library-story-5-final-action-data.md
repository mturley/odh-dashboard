# Integrate the Runtime image Install action with Green’s finalized action-data contract

## Description of the enhancement

Replace Zaffre’s temporary Runtime image action scaffolding with the final Green-owned Runtime image detail-page `core.action` integration.

Once Green finalizes the action group, action props, target-resource representation, and representative fixtures, update model-serving’s generic `RuntimeImageActionData` contract and the Zaffre Install action to consume the agreed data. Register the action in Green’s final Runtime image detail-page action group and remove the temporary Model deployment settings action-rendering location.

The final integration must preserve the existing Install wizard and platform target extension boundaries while validating the agreed target-resource data before it is used for prefill or creation.

## Acceptance Criteria

- Model-serving’s temporary `RuntimeImageActionData` target-resource placeholders are replaced with the Green–Zaffre agreed action-data representation.
- The Zaffre Install action consumes Green’s finalized `core.action` props and maps them to the final `RuntimeImageActionData` contract without importing Green/model-registry API hooks or canonical domain types.
- The final action data provides a `cancelReturnRoute` that returns a user who cancels installation to the Runtime image detail page.
- The Install action is registered in Green’s final Runtime image detail-page action group.
- The temporary Model deployment settings action-rendering location and its temporary action registration are removed.
- The implementation correctly handles all agreed target combinations using Green-provided fixtures:
  - Serving runtime template only;
  - LLM accelerator configuration only;
  - both supported targets;
  - neither supported target;
  - malformed or incomplete target data.
- Missing, malformed, or unsupported action data produces an actionable unavailable state and never causes a broken create request.
- The final integration honors the agreed feature-area and RBAC/action visibility behavior.
- Tests cover final action rendering, action-to-route data handoff, target derivation, and invalid-data behavior using the agreed fixtures.

## Additional info

- This story is blocked on Green finalizing the Runtime image detail-page action group, action props/data contract, target-resource representation, provenance expectations, and representative fixtures.
- It does not change the final route-extension/mounting mechanism; route integration is tracked separately.
- The action data remains generic for Runtime image detail-page actions. The Install action is one consumer of `RuntimeImageActionData`.
