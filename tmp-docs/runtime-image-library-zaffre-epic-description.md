Dashboard Zaffre team’s portion (model serving area) of [RHAISTRAT-1988](https://redhat.atlassian.net/browse/RHAISTRAT-1988) for the 3.6 GA scope.

Enable administrators to install reusable deployment resources from the Runtime image library into Model deployment settings. The Zaffre-owned flow provides a two-step Install wizard that lets users choose an available destination and configure either a Serving runtime template or an LLM accelerator configuration by reusing the existing creation forms.

Model-serving owns the Install action, wizard shell, target-selection experience, and install-target extension point. KServe and LLMD Serving contribute their platform-specific form implementations, validation, resource creation, and success navigation. Final routing and action-data integration will replace the placeholder Zaffre scaffolding after Green finalizes the Runtime image library contracts.

## Dependency order

1. [RHOAIENG-96638](https://redhat.atlassian.net/browse/RHOAIENG-96638) establishes the placeholder action data, route, wizard host, and `model-serving.runtime-image/install-target` extension point.
2. [RHOAIENG-96639](https://redhat.atlassian.net/browse/RHOAIENG-96639) and [RHOAIENG-96640](https://redhat.atlassian.net/browse/RHOAIENG-96640) depend on RHOAIENG-96638 and can be implemented in parallel.
3. [RHOAIENG-96641](https://redhat.atlassian.net/browse/RHOAIENG-96641) depends on RHOAIENG-96638, RHOAIENG-96639, RHOAIENG-96640, and Green’s completed routing spike.
4. [RHOAIENG-96642](https://redhat.atlassian.net/browse/RHOAIENG-96642) depends on RHOAIENG-96638, RHOAIENG-96639, RHOAIENG-96640, and Green’s finalized detail-page action contract; it can proceed independently of RHOAIENG-96641.
5. [RHOAIENG-96643](https://redhat.atlassian.net/browse/RHOAIENG-96643) depends on RHOAIENG-96638 and UX/PM confirmation of the desired analytics plan.
