import * as React from 'react';
import { Bullseye, Alert } from '@patternfly/react-core';
import { ClusterQueueKind, WorkloadKind } from '~/k8sTypes';
import { FetchStateObject } from '~/types';
import { DEFAULT_LIST_FETCH_STATE, DEFAULT_VALUE_FETCH_STATE } from '~/utilities/const';
import { SupportedArea, conditionalArea } from '~/concepts/areas';
import useSyncPreferredProject from '~/concepts/projects/useSyncPreferredProject';
import { ProjectsContext, byName } from '~/concepts/projects/ProjectsContext';
import { useMakeFetchObject } from '~/utilities/useMakeFetchObject';
import {
  DWProjectMetrics,
  DWWorkloadTrendMetrics,
  useDWProjectMetrics,
  useDWWorkloadTrendMetrics,
} from '~/api';
import { RefreshIntervalValue } from '~/concepts/metrics/const';
import { MetricsCommonContext } from '~/concepts/metrics/MetricsCommonContext';
import useClusterQueues from './useClusterQueues';
import useWorkloads from './useWorkloads';

type DistributedWorkloadsContextType = {
  clusterQueue: FetchStateObject<ClusterQueueKind | undefined>;
  workloads: FetchStateObject<WorkloadKind[]>;
  projectMetrics: DWProjectMetrics;
  workloadTrendMetrics: DWWorkloadTrendMetrics;
  refreshAllData: () => void;
  namespace?: string;
};

type DistributedWorkloadsContextProviderProps = {
  children: React.ReactNode;
  namespace?: string;
};

export const DistributedWorkloadsContext = React.createContext<DistributedWorkloadsContextType>({
  clusterQueue: DEFAULT_VALUE_FETCH_STATE,
  workloads: DEFAULT_LIST_FETCH_STATE,
  projectMetrics: {
    ...DEFAULT_VALUE_FETCH_STATE,
    data: {
      cpuRequested: DEFAULT_VALUE_FETCH_STATE,
      cpuUtilized: DEFAULT_VALUE_FETCH_STATE,
    },
  },
  workloadTrendMetrics: {
    ...DEFAULT_VALUE_FETCH_STATE,
    data: {
      jobsActiveTrend: DEFAULT_LIST_FETCH_STATE,
      jobsInadmissibleTrend: DEFAULT_LIST_FETCH_STATE,
      jobsPendingTrend: DEFAULT_LIST_FETCH_STATE,
    },
  },
  refreshAllData: () => undefined,
});

export const DistributedWorkloadsContextProvider =
  conditionalArea<DistributedWorkloadsContextProviderProps>(
    SupportedArea.DISTRIBUTED_WORKLOADS,
    true,
  )(({ children, namespace }) => {
    const { projects } = React.useContext(ProjectsContext);
    const project = projects.find(byName(namespace)) ?? null;
    useSyncPreferredProject(project);

    const { currentTimeframe, currentRefreshInterval, lastUpdateTime, setLastUpdateTime } =
      React.useContext(MetricsCommonContext);

    const refreshRate = RefreshIntervalValue[currentRefreshInterval];

    // TODO mturley implement lazy loading, let the context consumers tell us what data they need and make the other ones throw a NotReadyError

    const clusterQueues = useMakeFetchObject<ClusterQueueKind[]>(useClusterQueues(refreshRate));
    const clusterQueue: FetchStateObject<ClusterQueueKind | undefined> = {
      ...clusterQueues,
      data: clusterQueues.data.find((cq) => cq.spec.resourceGroups?.length),
    };
    const workloads = useMakeFetchObject<WorkloadKind[]>(useWorkloads(namespace, refreshRate));
    const projectMetrics = useDWProjectMetrics(namespace, refreshRate);

    const workloadTrendMetrics = useDWWorkloadTrendMetrics(
      currentTimeframe,
      lastUpdateTime,
      setLastUpdateTime,
      namespace,
      refreshRate,
    );

    const clusterQueuesRefresh = clusterQueues.refresh;
    const workloadsRefresh = workloads.refresh;
    const projectMetricsRefresh = projectMetrics.refresh;

    const workloadTrendMetricsRefresh = workloadTrendMetrics.refresh;
    const refreshAllData = React.useCallback(() => {
      clusterQueuesRefresh();
      workloadsRefresh();
      projectMetricsRefresh();
      workloadTrendMetricsRefresh();
    }, [
      clusterQueuesRefresh,
      workloadsRefresh,
      projectMetricsRefresh,
      workloadTrendMetricsRefresh,
    ]);

    const fetchError = [clusterQueues, workloads, projectMetrics].find(
      ({ error }) => !!error,
    )?.error;

    if (fetchError) {
      return (
        <Bullseye>
          <Alert title="Workload metrics load error" variant="danger" isInline>
            {fetchError.message}
          </Alert>
        </Bullseye>
      );
    }

    return (
      <DistributedWorkloadsContext.Provider
        value={{
          clusterQueue,
          workloads,
          projectMetrics,
          workloadTrendMetrics,
          refreshAllData,
          namespace,
        }}
      >
        {children}
      </DistributedWorkloadsContext.Provider>
    );
  });
