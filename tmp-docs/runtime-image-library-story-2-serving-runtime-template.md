# Install a Serving runtime template from a Runtime image

## Description of the enhancement

Allow an administrator to install the Serving runtime template deployment resource selected from a Runtime image through the Runtime image Install wizard.

Refactor the existing KServe Serving runtime template Add/Edit/Duplicate implementation so its reusable, platform-owned form body can be rendered by a `model-serving.runtime-image/install-target` extension. The refactor must preserve the existing model deployment settings flows while allowing the Install wizard to prefill the form from target-specific Runtime image action data.

The Serving runtime template install target validates and maps the selected data into the existing Serving runtime form fields: ServingRuntime YAML, API protocol, and supported model types. It creates the Template with the existing creation/validation behavior and redirects to the existing **Serving runtime templates** list after success.

Zaffre does not require Green to provide a Kubernetes `TemplateKind`: the existing template assembly behavior can construct the Template from valid ServingRuntime YAML plus API protocol and model types.

## Acceptance Criteria

- KServe contributes a Serving runtime template implementation of `model-serving.runtime-image/install-target`.
- The existing Serving runtime template form is refactored so its form body can be reused independently of its current full-page Add/Edit/Duplicate route shell and source-template context.
- Existing Add, Edit, and Duplicate flows retain their current behavior after the refactor.
- The install target accepts explicit prefill input from the selected Runtime image target resource.
- The install target validates and initializes all existing required form inputs:
  - ServingRuntime YAML;
  - API protocol (`REST` or `GRPC`);
  - one or more supported model types (`predictive` and/or `generative`).
- The target uses the existing Serving runtime template validation and Template creation behavior, including existing duplicate-name and dry-run validation where applicable.
- On successful creation, the target redirects to the existing **Serving runtime templates** list.
- Before submission, the user can select **Back** to return to Install destination without creating a resource.
- A separate Cancel action leaves the Install flow and navigates to the `cancelReturnRoute` supplied by the Install action; it does not redirect to the Serving runtime templates list.
- Invalid or incomplete target data produces an actionable form-level unavailable/error state and does not submit a create request.
- Existing tests are updated as needed, and new unit tests cover prefill mapping, validation failure, successful creation, and regression coverage for Add/Edit/Duplicate behavior.

## Additional info

- The final Green action-data shape is not a dependency for this story. Use temporary fixtures and map them through a target-owned prefill adapter.
- Green and Zaffre will later agree whether the final action data contains raw YAML, a K8s-shaped resource, or another form-ready representation.
- This story owns only the Serving runtime template target; it does not implement the Install page shell or LLM accelerator configuration behavior.
