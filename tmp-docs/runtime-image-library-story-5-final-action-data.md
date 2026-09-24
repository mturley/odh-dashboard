# Integrate the Runtime image Install action with Green’s finalized action-data contract

## Description of the enhancement

Replace Zaffre’s placeholder Runtime image action scaffolding with the final Green-owned Runtime image detail-page `core.action` integration.

Once Green finalizes the action group, action props, target-resource representation, provenance expectations, permission behavior, and representative fixtures, update model-serving’s generic Runtime image action contract and the Zaffre Install action to consume the agreed data. Register the action in Green’s final Runtime image detail-page action group and remove the placeholder action from Model deployment settings General settings.

The final integration must preserve the Install wizard and platform target extension boundaries while validating the agreed action-props envelope before navigation. Deep target-resource validation remains owned by each install-target extension in Step 2.

## Blocked status

**Blocked:** This story is not refinement/sprint ready until Green finalizes the Runtime image detail-page action group, action props, target-resource representation, `cancelReturnRoute`, visibility/RBAC behavior, provenance rules, and representative fixtures.

## Acceptance Criteria

- `PlaceholderRuntimeImageActionData` and its placeholder target-data types are replaced by the Green–Zaffre agreed generic Runtime image action-data representation.
- The Zaffre Install action consumes Green’s finalized `core.action` component props without importing Green/model-registry API hooks or canonical domain types.
- The exported action component validates the final top-level props at runtime before accessing them or navigating.
- Malformed top-level props produce a non-crashing disabled/unavailable action state.
- The final action data includes a `cancelReturnRoute` to the Runtime image detail page.
- The Install action is registered in Green’s final Runtime image detail-page action group.
- The placeholder General settings action location and placeholder action registration are removed.
- The action and final Install route honor the agreed feature-area, administrator/RBAC, and target-platform visibility behavior.
- Green-provided fixtures verify:
  - Serving runtime template only;
  - LLM accelerator configuration only;
  - both supported targets;
  - neither supported target;
  - malformed top-level action data;
  - incomplete target payloads passed to the appropriate Step 2 validator.
- Missing, malformed, or unsupported action data never causes a crash or broken create request.
- Unit/component tests cover final action-prop validation, action rendering, action-to-route handoff, target derivation, and invalid-data behavior using agreed fixtures.
- Mocked integration/browser coverage verifies the final Green-to-Zaffre action handoff where supported by the cross-package test harness.

## Additional info

- Do not estimate or schedule this story until Green’s action contract makes the acceptance criteria implementable.
- It does not change the final route-extension/mounting mechanism; route integration is tracked separately.
- Runtime validation is intentionally layered: the action validates the generic envelope, while KServe and LLMD Serving validate their target payloads only when Step 2 renders.
