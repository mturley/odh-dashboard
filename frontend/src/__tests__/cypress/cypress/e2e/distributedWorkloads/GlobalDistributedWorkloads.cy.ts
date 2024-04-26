import { mockDashboardConfig } from '~/__mocks__/mockDashboardConfig';
import { mockDscStatus } from '~/__mocks__/mockDscStatus';
import { mockComponents } from '~/__mocks__/mockComponents';
import { globalDistributedWorkloads } from '~/__tests__/cypress/cypress/pages/distributedWorkloads';
import { mockK8sResourceList } from '~/__mocks__/mockK8sResourceList';
import { mockProjectK8sResource } from '~/__mocks__/mockProjectK8sResource';
import { mockPrometheusQueryVectorResponse } from '~/__mocks__/mockPrometheusQueryVectorResponse';
import { mockWorkloadK8sResource } from '~/__mocks__/mockWorkloadK8sResource';
import { ClusterQueueKind, LocalQueueKind, WorkloadKind, WorkloadOwnerType } from '~/k8sTypes';
import { WorkloadStatusType } from '~/concepts/distributedWorkloads/utils';
import { mockClusterQueueK8sResource } from '~/__mocks__/mockClusterQueueK8sResource';
import { mockLocalQueueK8sResource } from '~/__mocks__/mockLocalQueueK8sResource';
import {
  ClusterQueueModel,
  LocalQueueModel,
  ProjectModel,
  WorkloadModel,
} from '~/__tests__/cypress/cypress/utils/models';

type HandlersProps = {
  isKueueInstalled?: boolean;
  disableDistributedWorkloads?: boolean;
  hasProjects?: boolean;
  clusterQueues?: ClusterQueueKind[];
  localQueues?: LocalQueueKind[];
  workloads?: WorkloadKind[];
};

const initIntercepts = ({
  isKueueInstalled = true,
  disableDistributedWorkloads = false,
  hasProjects = true,
  clusterQueues = [mockClusterQueueK8sResource({ name: 'test-cluster-queue' })],
  localQueues = [
    mockLocalQueueK8sResource({ name: 'test-local-queue', namespace: 'test-project' }),
  ],
  workloads = [
    mockWorkloadK8sResource({
      k8sName: 'test-workload',
      ownerKind: WorkloadOwnerType.Job,
      ownerName: 'test-workload-job',
      mockStatus: WorkloadStatusType.Succeeded,
    }),
    mockWorkloadK8sResource({
      k8sName: 'test-workload-2',
      ownerKind: WorkloadOwnerType.RayCluster,
      ownerName: 'test-workload-2-rc',
      mockStatus: WorkloadStatusType.Succeeded,
    }),
  ],
}: HandlersProps) => {
  cy.interceptOdh(
    'GET /api/dsc/status',
    mockDscStatus({
      installedComponents: { kueue: isKueueInstalled },
    }),
  );
  cy.interceptOdh(
    'GET /api/config',
    mockDashboardConfig({
      disableDistributedWorkloads,
    }),
  );
  cy.interceptOdh('GET /api/components', null, mockComponents());
  cy.interceptK8sList(
    ProjectModel,
    mockK8sResourceList(
      hasProjects
        ? [
            mockProjectK8sResource({ k8sName: 'test-project', displayName: 'Test Project' }),
            mockProjectK8sResource({ k8sName: 'test-project-2', displayName: 'Test Project 2' }),
          ]
        : [],
    ),
  );
  cy.interceptK8sList(ClusterQueueModel, mockK8sResourceList(clusterQueues));
  cy.interceptK8sList(
    {
      model: LocalQueueModel,
      ns: '*',
    },
    mockK8sResourceList(localQueues),
  );
  cy.interceptK8sList(
    {
      model: WorkloadModel,
      ns: '*',
    },
    mockK8sResourceList(workloads),
  );
  cy.interceptOdh('POST /api/prometheus/query', {
    code: 200,
    response: mockPrometheusQueryVectorResponse({ result: [] }),
  });
};

describe('Distributed Workload Metrics root page', () => {
  it('Does not exist if kueue is not installed', () => {
    initIntercepts({
      isKueueInstalled: false,
      disableDistributedWorkloads: false,
    });
    globalDistributedWorkloads.visit(false);
    globalDistributedWorkloads.findNavItem().should('not.exist');
    globalDistributedWorkloads.shouldNotFoundPage();
  });

  it('Does not exist if feature is disabled', () => {
    initIntercepts({
      isKueueInstalled: true,
      disableDistributedWorkloads: true,
    });
    globalDistributedWorkloads.visit(false);
    globalDistributedWorkloads.findNavItem().should('not.exist');
    globalDistributedWorkloads.shouldNotFoundPage();
  });

  it('Exists if kueue is installed and feature is enabled', () => {
    initIntercepts({
      isKueueInstalled: true,
      disableDistributedWorkloads: false,
    });
    globalDistributedWorkloads.visit();
    globalDistributedWorkloads.findNavItem().should('exist');
    globalDistributedWorkloads.shouldHavePageTitle();
  });

  it('Defaults to Project Metrics tab and automatically selects a project', () => {
    initIntercepts({});
    globalDistributedWorkloads.visit();

    cy.url().should('include', '/projectMetrics/test-project');
    cy.findByText('Top resource-consuming distributed workloads').should('exist');
  });

  it('Tabs navigate to corresponding routes and render their contents', () => {
    initIntercepts({});
    globalDistributedWorkloads.visit();

    cy.findByLabelText('Distributed workload status tab').click();
    cy.url().should('include', '/workloadStatus/test-project');
    globalDistributedWorkloads.findStatusOverviewCard().should('exist');

    cy.findByLabelText('Project metrics tab').click();
    cy.url().should('include', '/projectMetrics/test-project');
    cy.findByText('Top resource-consuming distributed workloads').should('exist');
  });

  it('Changing the project and navigating between tabs or to the root of the page retains the new project', () => {
    initIntercepts({});
    globalDistributedWorkloads.visit();
    cy.url().should('include', '/projectMetrics/test-project');

    globalDistributedWorkloads.selectProjectByName('Test Project 2');
    cy.url().should('include', '/projectMetrics/test-project-2');

    cy.findByLabelText('Distributed workload status tab').click();
    cy.url().should('include', '/workloadStatus/test-project-2');

    cy.findByLabelText('Project metrics tab').click();
    cy.url().should('include', '/projectMetrics/test-project-2');

    globalDistributedWorkloads.navigate();
    cy.url().should('include', '/projectMetrics/test-project-2');
  });

  it('Should show an empty state if there are no projects', () => {
    initIntercepts({ hasProjects: false });
    globalDistributedWorkloads.visit();

    cy.findByText('No data science projects').should('exist');
  });

  it('Should render with no quota state when there is no clusterqueue', () => {
    initIntercepts({ clusterQueues: [] });
    globalDistributedWorkloads.visit();
    cy.findByText('Configure the cluster queue').should('exist');
  });

  it('Should render with no quota state when the clusterqueue has no resourceGroups', () => {
    initIntercepts({
      clusterQueues: [
        mockClusterQueueK8sResource({ name: 'test-cluster-queue', hasResourceGroups: false }),
      ],
    });
    globalDistributedWorkloads.visit();
    cy.findByText('Configure the cluster queue').should('exist');
  });

  it('Should render with no quota state when there are no localqueues', () => {
    initIntercepts({ localQueues: [] });
    globalDistributedWorkloads.visit();
    cy.findByText('Configure the project queue').should('exist');
  });
});

describe('Project Metrics tab', () => {
  it('Should render with no workloads empty state', () => {
    initIntercepts({ workloads: [] });
    globalDistributedWorkloads.visit();

    cy.findByLabelText('Project metrics tab').click();

    cy.findByText('Requested resources').should('exist');

    cy.findByTestId('dw-top-consuming-workloads').within(() => {
      cy.findByText('No distributed workloads').should('exist');
    });
    cy.findByTestId('dw-workloada-resource-metrics').within(() => {
      cy.findByText('No distributed workloads').should('exist');
    });
    cy.findByTestId('dw-requested-resources').within(() => {
      // Requested resources shows chart even if empty workload
      cy.findByTestId('requested-resources-cpu-chart-container').should('exist');
    });
  });

  it('Should render the workload resource metrics table', () => {
    initIntercepts({});
    globalDistributedWorkloads.visit();

    cy.findByLabelText('Project metrics tab').click();
    cy.findByText('test-workload').should('exist');
  });

  it('Should render the requested resources charts', () => {
    initIntercepts({});
    globalDistributedWorkloads.visit();

    cy.findByLabelText('Project metrics tab').click();
    cy.findByTestId('requested-resources-cpu-chart-container').should('exist');
  });
});

describe('Workload Status tab', () => {
  it('Should render the status overview chart', () => {
    initIntercepts({});
    globalDistributedWorkloads.visit();
    cy.findByLabelText('Distributed workload status tab').click();

    const statusOverview = globalDistributedWorkloads.findStatusOverviewCard();
    statusOverview.should('exist');
    statusOverview.findByText('Succeeded: 2').should('exist');
  });

  it('Should render the status overview chart with pending fallback statuses', () => {
    initIntercepts({
      workloads: [
        mockWorkloadK8sResource({ k8sName: 'test-workload', mockStatus: null }),
        mockWorkloadK8sResource({ k8sName: 'test-workload-2', mockStatus: null }),
      ],
    });
    globalDistributedWorkloads.visit();
    cy.findByLabelText('Distributed workload status tab').click();

    const statusOverview = globalDistributedWorkloads.findStatusOverviewCard();
    statusOverview.should('exist');
    statusOverview.findByText('Pending: 2').should('exist');
  });

  it('Should render the workloads table', () => {
    initIntercepts({});
    globalDistributedWorkloads.visit();

    cy.findByLabelText('Distributed workload status tab').click();
    cy.findByText('test-workload').should('exist');
  });

  it('Should render an empty state for the dw table if no workloads', () => {
    initIntercepts({ workloads: [] });
    globalDistributedWorkloads.visit();

    cy.findByLabelText('Distributed workload status tab').click();
    cy.findByTestId('dw-workloads-table-card').within(() => {
      cy.findByText('No distributed workloads').should('exist');
    });
  });
});
