import axios from '~/utilities/axios';
import useFetchState, { FetchState } from '~/utilities/useFetchState';
import { DataScienceClusterKindStatus } from '~/k8sTypes';

/**
 * Should only return `null` when on v1 Operator.
 */
const fetchDscStatus = (): Promise<DataScienceClusterKindStatus | null> => {
  const url = '/api/dsc/status';
  return axios
    .get(url)
    .then((response) => {
      const dscStatus = response.data;
      // !!!! DO NOT MERGE - THIS IS A TEMPORARY HACK TO REPRODUCE A BUG !!!!
      if (dscStatus?.components?.modelregistry?.registriesNamespace) {
        delete dscStatus.components.modelregistry.registriesNamespace;
      }
      // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
      return dscStatus;
    })
    .catch((e) => {
      if (e.response.status === 404) {
        // DSC is not available, assume v1 Operator
        return null;
      }
      throw new Error(e.response.data.message);
    });
};

const useFetchDscStatus = (): FetchState<DataScienceClusterKindStatus | null> =>
  useFetchState(fetchDscStatus, null);

export default useFetchDscStatus;
