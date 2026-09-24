# Install an LLM accelerator configuration from a Runtime image

## Description of the enhancement

Allow an administrator to install the LLM accelerator configuration deployment resource selected from a Runtime image through the Runtime image Install wizard.

Refactor the existing LLMD Serving LLM accelerator configuration Add/Edit/Duplicate implementation so its reusable, platform-owned form body can be rendered by a `model-serving.runtime-image/install-target` extension. The refactor must preserve the existing model deployment settings flows while allowing the Install wizard to prefill the form from target-specific Runtime image action data.

The target validates and maps the selected data into the existing accelerator configuration form fields, including name, runtime version, and LLMInferenceServiceConfig YAML. It retains existing resource normalization and creation behavior, then redirects to the existing **LLM accelerator configurations** list after successful creation.

## Acceptance Criteria

- LLMD Serving contributes an LLM accelerator configuration implementation of `model-serving.runtime-image/install-target`.
- The existing LLM accelerator configuration form is refactored so its form body can be reused independently of its current full-page Add/Edit/Duplicate route shell and source-config context.
- Existing Add, Edit, and Duplicate flows retain their current behavior after the refactor.
- The install target accepts explicit prefill input from the selected Runtime image target resource.
- The install target validates and initializes the existing form inputs:
  - configuration display/Kubernetes name source;
  - optional runtime version;
  - LLMInferenceServiceConfig YAML.
- The target retains current LLMInferenceServiceConfig validation and create behavior, including normalizing required API version, kind, namespace, and dashboard/accelerator metadata.
- On successful creation, the target redirects to the existing **LLM accelerator configurations** list.
- Before submission, the user can select **Back** to return to Install destination without creating a resource.
- A separate Cancel action leaves the Install flow and navigates to the `cancelReturnRoute` supplied by the Install action; it does not redirect to the LLM accelerator configurations list.
- Invalid or incomplete target data produces an actionable form-level unavailable/error state and does not submit a create request.
- Existing tests are updated as needed, and new unit tests cover prefill mapping, validation failure, successful creation, and regression coverage for Add/Edit/Duplicate behavior.

## Additional info

- The final Green action-data shape is not a dependency for this story. Use temporary fixtures and map them through a target-owned prefill adapter.
- This story does not decide whether the final cross-package handoff uses a complete `LLMInferenceServiceConfigKind` or a narrower form-ready representation.
- This story owns only the accelerator configuration target; it does not implement the Install page shell or Serving runtime template behavior.
