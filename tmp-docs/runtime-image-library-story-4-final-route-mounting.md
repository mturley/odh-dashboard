# Mount the Runtime image Install page through the Runtime image library route extension

## Description of the enhancement

Replace the temporary independent Runtime image Install route with the route-extension or mounting mechanism selected by Green’s Runtime image library routing spike.

The final Install page must render as part of the Runtime image library navigation structure without requiring Zaffre to own Green’s library page implementation. This work must use the mechanism documented by Green’s spike; it must not assume that independently registered routes sharing a URL prefix are sufficient.

Retain the existing Install wizard shell, destination selection, and platform-specific target extensions. This story changes route integration and page chrome only.

## Acceptance Criteria

- The implementation follows the route-extension/mounting contract documented by Green’s routing spike.
- The Install page mounts at the agreed Runtime image library/detail navigation location.
- The Install page uses the agreed final route parameters and identifier strategy.
- The page displays the agreed breadcrumb hierarchy, including Model deployment settings, Runtime image library, the selected Runtime image, and Install.
- Cancel navigation navigates to the `cancelReturnRoute` supplied by the Install action and returns to the agreed Runtime image detail-page destination.
- Back navigation from Step 2 returns to Step 1 without leaving the Install flow.
- The temporary independent route registration and temporary route-specific page chrome are removed.
- The migration does not change the existing Install wizard shell, target availability logic, or platform-specific target form behavior.
- Tests verify that the final route mechanism renders the Install page at the expected location and that return/cancel navigation reaches the expected library/detail location.

## Additional info

- This story is blocked on Green completing and documenting its routing spike.
- It does not integrate Green’s final `core.action` group or replace the temporary action-data contract; that is handled separately.
- The final action and route integrations are intentionally separate because Green’s route mechanism and action-data contract may become available at different times.
