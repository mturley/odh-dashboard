# Install a Serving runtime template from a Runtime image

## Description of the enhancement

Allow an administrator to install a Serving runtime template deployment resource selected from a Runtime image through the Runtime image Install wizard.

Refactor the existing KServe Serving runtime template Add/Edit/Duplicate implementation so its reusable, platform-owned form body can be rendered by a `model-serving.runtime-image/install-target` extension. Preserve the existing Model deployment settings flows while allowing the Install wizard to prefill the form from `PlaceholderServingRuntimeTemplateData`.

The target extension owns Step 2, including target-data validation, the form, its action bar, resource creation, and success navigation. It uses the existing Serving runtime validation and Template assembly/creation logic rather than duplicating that logic in model-serving.

Zaffre does not require Green to provide a Kubernetes `TemplateKind`: the existing template assembly behavior can construct the Template from valid ServingRuntime YAML, API protocol, and model types.

## Acceptance Criteria

- KServe contributes a Serving runtime template implementation of `model-serving.runtime-image/install-target`.
- The extension is gated consistently with the existing Serving runtime templates settings experience, including administrator and custom-runtime/KServe availability requirements.
- The existing Serving runtime template form is refactored so its form body can be reused independently of its full-page Add/Edit/Duplicate route shell and source-template context.
- Existing Add, Edit, and Duplicate flows retain their current behavior after the refactor.
- The install target accepts explicit `PlaceholderServingRuntimeTemplateData` from the selected Runtime image target.
- On entry to Step 2, the target reuses existing platform validation and initializes all required form inputs:
  - ServingRuntime YAML;
  - API protocol (`REST` or `GRPC`);
  - one or more supported model types (`predictive` and/or `generative`).
- Invalid YAML, an invalid ServingRuntime, a missing/unsupported protocol, or missing/unsupported model types produces an actionable form-level error/unavailable state and does not submit a create request.
- The target retains the existing YAML/kind checks, duplicate-name checks, dry-run validation, Template assembly, and Template creation behavior where applicable.
- The Step 2 target component owns its action bar:
  - **Install/Create** creates the Template.
  - **Back** invokes the shell-provided `onBack` callback without creating a resource.
  - **Cancel** navigates to `cancelReturnRoute` without creating a resource or navigating to the Serving runtime templates list.
- On successful creation, the target redirects to the existing **Serving runtime templates** list.
- Existing Serving runtime template form tracking is retained and includes `source: 'install'` for submit success, submit failure, and cancel outcomes initiated through this install target. No Runtime image name, resource name, YAML, or other user-generated content is sent.
- Unit/component tests cover placeholder prefill mapping, target validation, Back, Cancel, create failure, successful creation, tracking properties, and regression coverage for Add/Edit/Duplicate behavior.
- A mocked Cypress test installs a prefilled Serving runtime template and verifies creation and redirect to the existing list.

## Additional info

- UX mockup: [Runtime image Install wizard](https://rhoai-3-6-c2d6f6.pages.redhat.com/settings/model-resources/serving-runtime-templates/catalog/catalog-vllm-0-6-0/install)
- The final Green action-data shape is not a dependency for this story. Story 5 replaces the placeholder adapter with the agreed representation.
- Validation intentionally occurs when this target renders in Step 2, allowing KServe to reuse existing validation and creation code rather than duplicating it in model-serving.
- This story owns only the Serving runtime template target; it does not implement the Install page shell or LLM accelerator configuration behavior.
- Any new tracking events beyond the retained form event plus `source: 'install'` are handled by the dedicated analytics story.
