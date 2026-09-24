# Mount the Runtime image Install page through the Runtime image library route extension

## Description of the enhancement

Replace the placeholder independent Runtime image Install route with the route-extension or mounting mechanism selected by Green’s Runtime image library routing spike.

The final Install page must render as part of the Runtime image library navigation structure without requiring Zaffre to own Green’s library page implementation. This work must use the mechanism documented by Green’s spike; it must not assume that independently registered routes sharing a URL prefix are sufficient.

Retain the existing Install wizard shell, destination selection, and platform-specific target extensions. This story changes route integration and page chrome only.

## Blocked status

**Blocked:** This story is not refinement/sprint ready until Green completes and documents its routing spike, including the route extension or mounting API, final path, route parameters, identifier strategy, breadcrumb ownership, and return destination.

## Acceptance Criteria

- The implementation follows the route-extension/mounting contract documented by Green’s routing spike.
- The Install page mounts at the agreed Runtime image library/detail navigation location.
- The Install page uses the agreed final route parameters and Runtime image identifier strategy.
- The page displays the agreed breadcrumb hierarchy:
  - Model deployment settings;
  - Runtime image library;
  - selected Runtime image;
  - Install.
- Back from Step 2 returns to Step 1 without leaving the Install flow.
- Cancel from Step 2 navigates to the action-supplied `cancelReturnRoute` and returns to the Runtime image detail page.
- The placeholder independent route registration and placeholder route-specific page chrome are removed.
- The migration does not change the Install wizard shell, target availability logic, platform target validation, or platform creation behavior.
- Unit/integration tests verify final route rendering, route parameters, breadcrumb links, Back behavior, and Cancel navigation.
- Mocked browser coverage verifies that the Install page renders at the final library navigation location and returns to the Runtime image detail page on Cancel.

## Additional info

- UX mockup: [Runtime image Install wizard](https://rhoai-3-6-c2d6f6.pages.redhat.com/settings/model-resources/serving-runtime-templates/catalog/catalog-vllm-0-6-0/install)
- Do not estimate or schedule this story until Green’s routing-spike output makes the acceptance criteria implementable.
- It does not integrate Green’s final `core.action` group or replace the placeholder action-data contract; that is handled separately.
- The final action and route integrations are intentionally separate because Green’s route mechanism and action-data contract may become available at different times.
