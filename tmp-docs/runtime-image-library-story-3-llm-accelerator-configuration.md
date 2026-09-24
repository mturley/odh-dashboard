# Install an LLM accelerator configuration from a Runtime image

**Jira:** [RHOAIENG-96640](https://redhat.atlassian.net/browse/RHOAIENG-96640)

## Description of the enhancement

Allow an administrator to install an LLM accelerator configuration deployment resource selected from a Runtime image through the Runtime image Install wizard.

Refactor the existing LLMD Serving LLM accelerator configuration Add/Edit/Duplicate implementation so its reusable, platform-owned form body can be rendered by a `model-serving.runtime-image/install-target` extension. Preserve the existing Model deployment settings flows while allowing the Install wizard to prefill the form from `PlaceholderLlmAcceleratorConfigurationData`.

The target extension owns Step 2, including target-data validation, the form, its action bar, resource creation, and success navigation. It retains the existing YAML parsing, object-shape checks, normalization, and LLMInferenceServiceConfig creation behavior rather than introducing a separate validation implementation in model-serving.

## Acceptance Criteria

- LLMD Serving contributes an LLM accelerator configuration implementation of `model-serving.runtime-image/install-target`.
- The extension is gated consistently with the existing LLM accelerator configurations settings experience, including administrator and applicable LLMD/VLLM feature requirements.
- The existing LLM accelerator configuration form is refactored so its form body can be reused independently of its full-page Add/Edit/Duplicate route shell and source-config context.
- Existing Add, Edit, and Duplicate flows retain their current behavior after the refactor.
- The install target accepts explicit `PlaceholderLlmAcceleratorConfigurationData` from the selected Runtime image target.
- On entry to Step 2, the target reuses existing platform validation and initializes:
  - configuration display/Kubernetes name source;
  - optional runtime version;
  - LLMInferenceServiceConfig YAML.
- Invalid YAML or data that fails the form’s existing object-shape requirements produces an actionable form-level error/unavailable state and does not submit a create request.
- The target retains current API-version/kind/namespace and dashboard/accelerator metadata normalization plus existing LLMInferenceServiceConfig creation behavior.
- The Step 2 target component owns its action bar:
  - **Install/Create** creates the LLMInferenceServiceConfig.
  - **Back** invokes the shell-provided `onBack` callback without creating a resource.
  - **Cancel** navigates to `cancelReturnRoute` without creating a resource or navigating to the LLM accelerator configurations list.
- On successful creation, the target redirects to the existing **LLM accelerator configurations** list.
- Existing LLM accelerator configuration form tracking is retained and includes `source: 'install'` for submit success, submit failure, and cancel outcomes initiated through this install target. No Runtime image name, resource name, YAML, or other user-generated content is sent.
- Unit/component tests cover placeholder prefill mapping, target validation, Back, Cancel, create failure, successful creation, tracking properties, and regression coverage for Add/Edit/Duplicate behavior.
- A mocked Cypress test installs a prefilled LLM accelerator configuration and verifies creation and redirect to the existing list.

## Additional info

- UX mockup: [Runtime image Install wizard](https://rhoai-3-6-c2d6f6.pages.redhat.com/settings/model-resources/serving-runtime-templates/catalog/catalog-vllm-0-6-0/install)
- The final Green action-data shape is not a dependency for this ticket. [RHOAIENG-96642](https://redhat.atlassian.net/browse/RHOAIENG-96642) replaces the placeholder adapter with the agreed representation.
- This story does not decide whether the final cross-package handoff uses the complete `LLMInferenceServiceConfigKind` or a narrower form-ready representation.
- Validation intentionally occurs when this target renders in Step 2, allowing LLMD Serving to reuse existing parsing, validation, normalization, and creation code rather than duplicating it in model-serving.
- This story owns only the accelerator configuration target; it does not implement the Install page shell or Serving runtime template behavior.
- Any new tracking events beyond the retained form event plus `source: 'install'` are handled by the dedicated analytics story.
