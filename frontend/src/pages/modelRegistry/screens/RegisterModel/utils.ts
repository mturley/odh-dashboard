import {
  ModelArtifact,
  ModelArtifactState,
  ModelState,
  ModelVersion,
  RegisteredModel,
} from '~/concepts/modelRegistry/types';
import { ModelRegistryAPIState } from '~/concepts/modelRegistry/context/useModelRegistryAPIState';
import { objectStorageFieldsToUri } from '~/concepts/modelRegistry/utils';
import {
  ModelLocationType,
  RegisterModelFormData,
  RegisterVersionFormData,
} from './useRegisterModelData';

export type RegisterModelCreatedResources = RegisterVersionCreatedResources & {
  registeredModel: RegisteredModel;
};

export type RegisterVersionCreatedResources = {
  modelVersion: ModelVersion;
  modelArtifact: ModelArtifact;
};

export const registerModel = async (
  apiState: ModelRegistryAPIState,
  formData: RegisterModelFormData,
  author: string,
): Promise<RegisterModelCreatedResources> => {
  const registeredModel = await apiState.api.createRegisteredModel(
    {},
    {
      name: formData.modelName,
      description: formData.modelDescription,
      customProperties: {},
      owner: author,
      state: ModelState.LIVE,
    },
  );
  const { modelVersion, modelArtifact } = await registerVersion(
    apiState,
    registeredModel,
    formData,
    author,
  );
  return { registeredModel, modelVersion, modelArtifact };
};

export const registerVersion = async (
  apiState: ModelRegistryAPIState,
  registeredModel: RegisteredModel,
  formData: RegisterVersionFormData,
  author: string,
): Promise<RegisterVersionCreatedResources> => {
  const modelVersion = await apiState.api.createModelVersionForRegisteredModel(
    {},
    registeredModel.id,
    {
      name: formData.versionName,
      description: formData.versionDescription,
      customProperties: {},
      state: ModelState.LIVE,
      author,
      registeredModelId: registeredModel.id,
    },
  );
  const modelArtifact = await apiState.api.createModelArtifactForModelVersion({}, modelVersion.id, {
    name: `${registeredModel.name}-${formData.versionName}-artifact`,
    description: formData.versionDescription,
    customProperties: {},
    state: ModelArtifactState.LIVE,
    author,
    modelFormatName: formData.sourceModelFormat,
    modelFormatVersion: formData.sourceModelFormatVersion,
    // TODO fill in the name of the data connection we used to prefill if we used one
    // TODO this should be done as part of https://issues.redhat.com/browse/RHOAIENG-9914
    // storageKey: 'TODO',
    uri:
      formData.modelLocationType === ModelLocationType.ObjectStorage
        ? objectStorageFieldsToUri({
            endpoint: formData.modelLocationEndpoint,
            bucket: formData.modelLocationBucket,
            region: formData.modelLocationRegion,
            path: formData.modelLocationPath,
          }) || '' // We'll only hit this case if required fields are empty strings, so form validation should catch it.
        : formData.modelLocationURI,
    artifactType: 'model-artifact',
  });
  return { modelVersion, modelArtifact };
};
