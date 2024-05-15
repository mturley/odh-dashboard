import React from 'react';
import useFetchState, { FetchState } from '~/utilities/useFetchState';
import { ModelRegistryKind } from '~/k8sTypes';
import { listModelRegistriesBackend } from '~/services/modelRegistryService';

const useModelRegistriesBackend = (): FetchState<ModelRegistryKind[]> => {
  const getModelRegistries = React.useCallback(() => listModelRegistriesBackend(), []);
  return useFetchState<ModelRegistryKind[]>(getModelRegistries, []);
};

export default useModelRegistriesBackend;
