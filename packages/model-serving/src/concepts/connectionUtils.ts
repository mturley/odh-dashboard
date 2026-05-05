import {
  createSecret,
  replaceSecret,
  getSecret,
  patchSecretWithOwnerReference,
  patchSecretWithProtocolAnnotation,
  hasProtocolAnnotation,
  deleteSecret,
  isGeneratedSecretName,
  getGeneratedSecretName,
} from '@odh-dashboard/internal/api/index';
import { SecretKind } from '@odh-dashboard/internal/k8sTypes';
import { translateDisplayNameForK8s } from '@odh-dashboard/internal/concepts/k8s/utils';
import {
  assembleConnectionSecret,
  getConnectionProtocolType,
} from '@odh-dashboard/internal/concepts/connectionTypes/utils';
import { K8sResourceCommon } from '@openshift/dynamic-plugin-sdk-utils';
import { Connection } from '@odh-dashboard/internal/concepts/connectionTypes/types';
import { K8sNameDescriptionType } from '@odh-dashboard/internal/concepts/k8s/K8sNameDescriptionField/types';
import { CreateConnectionData } from '../components/deploymentWizard/fields/CreateConnectionInputFields';
import { ModelLocationData, ModelLocationType } from '../components/deploymentWizard/types';

export const handleConnectionCreation = async (
  createConnectionData: CreateConnectionData,
  project: string,
  modelLocationData?: ModelLocationData,
  secretName?: string,
  dryRun?: boolean,
  selectedConnection?: Connection,
): Promise<SecretKind | undefined> => {
  if (!modelLocationData) {
    return Promise.resolve(undefined);
  }
  const protocolType =
    (modelLocationData.connectionTypeObject
      ? getConnectionProtocolType(modelLocationData.connectionTypeObject)
      : undefined) ?? 'uri';

  // If the connection already exists, patch the protocol annotation if it needs it, but don't wait for it
  if (modelLocationData.type === ModelLocationType.EXISTING) {
    if (!dryRun) {
      getSecret(project, modelLocationData.connection ?? '')
        .then((secret) => {
          if (!hasProtocolAnnotation(secret)) {
            patchSecretWithProtocolAnnotation(secret, protocolType).catch((err) => {
              console.warn('Failed to patch protocol annotation:', err);
            });
          }
        })
        .catch((err) => {
          console.warn('Failed to get secret for protocol annotation:', err);
        });
    }
    return Promise.resolve(undefined);
  }

  const connectionTypeName = modelLocationData.connectionTypeObject?.metadata.name ?? 'uri-v1';
  const formSecretName = createConnectionData.nameDesc?.k8sName.value;
  const oldSecretName = selectedConnection?.metadata.name;
  const actualSecretName = (() => {
    if (createConnectionData.saveConnection && formSecretName) {
      return formSecretName;
    }
    const candidate = secretName ?? formSecretName;
    // Reuse an existing generated secret name to avoid changing the IS's
    // imagePullSecrets reference, which triggers the KServe webhook to strip storageUri.
    if (candidate && isGeneratedSecretName(candidate)) {
      return candidate;
    }
    if (!candidate) {
      return getGeneratedSecretName();
    }
    return candidate;
  })();
  const description = createConnectionData.nameDesc?.description ?? '';

  const nameDescForAssembly = ((): K8sNameDescriptionType => {
    const stored = createConnectionData.nameDesc;
    if (!stored || isGeneratedSecretName(stored.name)) {
      return {
        name: actualSecretName,
        description,
        k8sName: actualSecretName,
      };
    }
    return {
      ...stored,
      k8sName: translateDisplayNameForK8s(stored.name) || stored.k8sName.value,
    };
  })();
  const newConnection = assembleConnectionSecret(
    project,
    connectionTypeName,
    nameDescForAssembly,
    modelLocationData.fieldValues,
  );

  // Apply annotations. When saveConnection is unchecked, mark the connection
  // hidden from the UI while keeping the dashboard label 'true' so the
  // model-serving controller still includes the secret in storage-config.
  const annotatedConnection = {
    ...newConnection,
    metadata: {
      ...newConnection.metadata,
      name: actualSecretName,
      annotations: {
        ...newConnection.metadata.annotations,
        'opendatahub.io/connection-type-protocol': protocolType,
        ...(!createConnectionData.saveConnection && {
          'opendatahub.io/connection-hidden': 'true',
        }),
      },
    },
  };
  if (!description || description === '') {
    delete annotatedConnection.metadata.annotations['openshift.io/description'];
  }

  const newSecretName = actualSecretName;
  const isReusing = oldSecretName && oldSecretName === newSecretName;

  if (isReusing) {
    // Reusing the same secret name — replace it to avoid changing imagePullSecrets
    // on the InferenceService, which triggers a KServe webhook that strips storageUri.
    const existingSecret = await getSecret(project, oldSecretName);
    const replacedSecret = await replaceSecret(
      {
        ...annotatedConnection,
        metadata: {
          ...annotatedConnection.metadata,
          resourceVersion: existingSecret.metadata.resourceVersion,
        },
      },
      dryRun ? { dryRun: true } : undefined,
    );
    if (dryRun) {
      return replacedSecret;
    }
    return getSecret(project, replacedSecret.metadata.name);
  }

  if (dryRun) {
    return createSecret(annotatedConnection, { dryRun: true });
  }

  if (oldSecretName && oldSecretName !== newSecretName) {
    try {
      const existingSecret = await getSecret(project, oldSecretName);
      if (isGeneratedSecretName(existingSecret.metadata.name)) {
        await deleteSecret(project, existingSecret.metadata.name);
      }
    } catch {
      console.error('Old secret not found, skipping delete');
    }
  }

  const createdSecret = await createSecret(annotatedConnection);
  return getSecret(project, createdSecret.metadata.name);
};

export const handleSecretOwnerReferencePatch = async (
  createConnectionData: CreateConnectionData,
  resource: K8sResourceCommon & { metadata: { name: string } },
  modelLocationData: ModelLocationData,
  secretName: string,
  uid: string,
  dryRun?: boolean,
): Promise<void> => {
  if (
    !createConnectionData.saveConnection &&
    !dryRun &&
    modelLocationData.type !== ModelLocationType.EXISTING &&
    resource.metadata.namespace
  ) {
    // Patch the secret with owner ref but don't wait for it
    try {
      const secret = await getSecret(resource.metadata.namespace ?? '', secretName);
      if (!uid) {
        console.warn('UID is not present, skipping owner reference patch', uid);
        return;
      }
      await patchSecretWithOwnerReference(secret, resource, uid);
    } catch (err) {
      console.warn('Skipping owner reference patch, secret not ready yet', err);
    }
  }
};
