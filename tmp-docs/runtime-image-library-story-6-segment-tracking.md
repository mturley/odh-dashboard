# Add UX-approved analytics for the Runtime image Install flow

## Description of the enhancement

Define and implement the additional Segment analytics needed to understand use of the Runtime image Install flow beyond the existing platform form events retained by the Serving runtime template and LLM accelerator configuration stories.

Consult UX/PM before implementation to determine which user interactions provide meaningful product insight. Candidate interactions include starting installation from a Runtime image, selecting or changing the install destination, returning from Configure to Install destination, cancelling the overall wizard, and encountering an unavailable/invalid state. Do not add events merely because an interaction exists; instrument only the events and non-sensitive properties agreed with UX/PM.

Stories 2 and 3 retain their existing form create events and add `source: 'install'` for submit success, submit failure, and form cancellation. This story owns any additional cross-target wizard events and ensures the combined tracking design is consistent and non-duplicative.

## Acceptance Criteria

- UX/PM reviews the Runtime image Install flow and documents which additional interactions, if any, require Segment events.
- The tracking plan distinguishes automatic page-view tracking, existing platform form events, and any new explicit wizard events so the same interaction is not double counted.
- Any approved new event names follow the `What-noun Past-Tensed-verb` convention and use the appropriate feature-area prefix.
- The appropriate tracking API is used:
  - `fireFormTrackingEvent` for form/wizard submit or cancel outcomes;
  - `fireLinkTrackingEvent` for navigation interactions when explicit tracking is needed;
  - `fireSimpleTrackingEvent` only for property-free actions;
  - no new `fireMiscTrackingEvent` usage unless none of the preferred APIs apply.
- New tracking may include non-sensitive properties such as install target, source surface, outcome, and success/failure.
- Tracking does not include Runtime image names, Kubernetes resource names, YAML, descriptions, routes containing user-generated identifiers, secrets, or other PII/user-generated content.
- Cancel tracking, if approved, distinguishes cancelling the overall Install flow from selecting Back to return to Install destination.
- Existing Serving runtime template and LLM accelerator configuration tracking with `source: 'install'` remains intact and is not duplicated by new events.
- Unit tests verify event names, approved properties, submit/cancel semantics, and that events are fired only at the intended interactions.
- Development verification confirms the expected events and properties in the browser console.

## Additional info

- UX mockup: [Runtime image Install wizard](https://rhoai-3-6-c2d6f6.pages.redhat.com/settings/model-resources/serving-runtime-templates/catalog/catalog-vllm-0-6-0/install)
- This story depends on the Install wizard interactions from Story 1 and should be completed after UX/PM confirms the desired event plan.
- Follow the Segment Tracking — Developer Guide. Use form outcomes with `outcome`, `success`, and a short error value where applicable.
- If UX/PM determines that automatic page views plus the existing form events with `source: 'install'` are sufficient, document that conclusion and limit implementation to any test or consistency updates needed to enforce it.
