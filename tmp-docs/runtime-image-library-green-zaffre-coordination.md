# Runtime image library: remaining Green–Zaffre coordination points

The main coordination record is maintained in the [Green/Zaffre Coordination for RHAISTRAT-1988 (Runtime library)](https://docs.google.com/document/d/14rHHAyLgZrTmFcauCS2wLasZL2-6fXkm34tZTNDJPL4/edit?tab=t.0#heading=h.1ws9hwmbjjdw) Google Doc.

This document captures the remaining points that are important to cover with Green but are not yet explicit in that document.

## 1. Runtime image with no supported deployment resource

Zaffre will temporarily support a Runtime image with neither supported resource while Green confirms whether that state can occur in production. Agree the resulting detail-page and Install-page behavior.

Proposed Zaffre behavior:

- The Install page displays an explicit unavailable/empty state.
- It provides a safe return link to the Runtime image detail page.
- It does not render an empty destination choice or attempt resource creation.

Green should also decide whether the Runtime image detail page suppresses or disables the Install action when no supported target is available.

## 2. Confirmed deployment-resource cardinality

Green has confirmed that a Runtime image has at most one resource for each supported target:

- zero or one Serving runtime template;
- zero or one LLM accelerator configuration.

Zaffre will use optional keyed properties rather than an array. Whether a Runtime image always supplies both targets remains unresolved, so Zaffre will implement for either target, both targets, or neither target.

## 3. Representative install-data fixtures

Provide representative Runtime image/install-action props fixtures for all relevant states:

1. Serving runtime template only.
2. LLM accelerator configuration only.
3. Both supported resources.
4. Neither supported resource.
5. Invalid or incomplete target-resource data.

These fixtures will let Zaffre verify the existing-form prefill mappings and establish tests before implementation begins.

## 4. Source definitions versus live Kubernetes resources

Confirm whether deployment resources returned by the AI Hub API are clean source definitions or serialized live Kubernetes resources.

If they include server-assigned metadata—such as `resourceVersion`, UID, managed fields, owner references, or controller-specific annotations—agree where it is removed before creation. The installation flow must treat library resources as sources, not recreate cluster-specific metadata.

## 5. Finalize the temporary action-props placeholder

Zaffre will proceed with a clearly marked temporary `RuntimeImageInstallData` shape using optional keyed target properties. The target-resource values are placeholders, not a commitment to consume Green’s current API model.

Green and Zaffre still need to agree whether action props provide complete K8s-shaped resources or smaller form-ready values, and the precise fields required to prefill each existing form. Green should map its canonical Runtime image/API response into that final installer-facing props shape before it renders Zaffre’s `core.action` extension.

This keeps Zaffre independent of Green’s BFF/API types and allows Green to evolve library-only API fields without breaking the installation flow.

## 6. Defensive invalid-data handling

In addition to the established router-state reload behavior, agree that malformed or incomplete action props must be handled explicitly:

- no empty-value defaults that result in broken create calls;
- no silently inferred unsupported target;
- an actionable unavailable-data error state when validation fails.

Green does not need to implement Zaffre’s error UI, but the extension-props contract should make clear that the passed resource data must satisfy the agreed target-form requirements.
