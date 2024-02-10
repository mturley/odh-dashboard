import {
  k8sCreateResource,
  k8sDeleteResource,
  k8sGetResource,
  k8sListResource,
  K8sStatus,
} from '@openshift/dynamic-plugin-sdk-utils';
import { DataSciencePipelineApplicationModel } from '~/api/models';
import { DSPipelineKind, K8sAPIOptions, RouteKind, SecretKind } from '~/k8sTypes';
import { getRoute } from '~/api/k8s/routes';
import { getSecret } from '~/api/k8s/secrets';
import { applyK8sAPIOptions } from '~/api/apiMergeUtils';
import { DEFAULT_PIPELINE_DEFINITION_NAME } from '~/concepts/pipelines/const';
import { ELYRA_SECRET_NAME } from '~/concepts/pipelines/elyra/const';

export const getElyraSecret = async (namespace: string, opts: K8sAPIOptions): Promise<SecretKind> =>
  getSecret(namespace, ELYRA_SECRET_NAME, opts);

export const getPipelineAPIRoute = async (
  namespace: string,
  name: string,
  opts?: K8sAPIOptions,
): Promise<RouteKind> => getRoute(name, namespace, opts);

export const createPipelinesCR = async (
  namespace: string,
  spec: DSPipelineKind['spec'],
  opts?: K8sAPIOptions,
): Promise<DSPipelineKind> => {
  // Debug note for investigating issues on production
  // Add mlpipelineUI.image: 'quay.io/opendatahub/odh-ml-pipelines-frontend-container:beta-ui'
  const resource: DSPipelineKind = {
    apiVersion: `${DataSciencePipelineApplicationModel.apiGroup}/${DataSciencePipelineApplicationModel.apiVersion}`,
    kind: DataSciencePipelineApplicationModel.kind,
    metadata: {
      name: DEFAULT_PIPELINE_DEFINITION_NAME,
      namespace,
    },
    spec: {
      apiServer: {
        enableSamplePipeline: false,
      },
      ...spec,
    },
  };

  return k8sCreateResource<DSPipelineKind>(
    applyK8sAPIOptions(
      {
        model: DataSciencePipelineApplicationModel,
        resource,
      },
      opts,
    ),
  );
};

export const getPipelinesCR = async (
  namespace: string,
  name: string,
  opts?: K8sAPIOptions,
): Promise<DSPipelineKind> =>
  k8sGetResource<DSPipelineKind>(
    applyK8sAPIOptions(
      {
        model: DataSciencePipelineApplicationModel,
        queryOptions: { name, ns: namespace },
      },
      opts,
    ),
  );

export const listPipelinesCR = async (
  namespace: string,
  opts?: K8sAPIOptions,
): Promise<DSPipelineKind[]> =>
  k8sListResource<DSPipelineKind>(
    applyK8sAPIOptions(
      {
        model: DataSciencePipelineApplicationModel,
        queryOptions: { ns: namespace },
      },
      opts,
    ),
  ).then((r) => r.items);

export const deletePipelineCR = async (
  namespace: string,
  name: string,
  opts?: K8sAPIOptions,
): Promise<K8sStatus> =>
  k8sDeleteResource<DSPipelineKind, K8sStatus>(
    applyK8sAPIOptions(
      {
        model: DataSciencePipelineApplicationModel,
        queryOptions: { name, ns: namespace },
      },
      opts,
    ),
  );
