/* eslint-disable camelcase */
import {
  buildMockExperimentKF,
  mockDashboardConfig,
  mockDataSciencePipelineApplicationK8sResource,
  mockK8sResourceList,
  buildMockPipelineV2,
  buildMockPipelines,
  buildMockPipelineVersionV2,
  mockProjectK8sResource,
  mockRouteK8sResource,
  buildMockRunKF,
} from '~/__mocks__';
import { verifyRelativeURL } from '~/__tests__/cypress/cypress/utils/url';
import {
  DataSciencePipelineApplicationModel,
  ProjectModel,
  RouteModel,
} from '~/__tests__/cypress/cypress/utils/models';
import {
  compareRunsGlobal,
  compareRunsListTable,
  compareRunParamsTable,
  compareRunsMetricsContent,
} from '~/__tests__/cypress/cypress/pages/pipelines/compareRuns';
import { mockCancelledGoogleRpcStatus } from '~/__mocks__/mockGoogleRpcStatusKF';
import * as scalarUtils from '~/concepts/pipelines/content/compareRuns/metricsSection/scalar/utils';

const projectName = 'test-project-name';
const initialMockPipeline = buildMockPipelineV2({ display_name: 'Test pipeline' });
const initialMockPipelineVersion = buildMockPipelineVersionV2({
  pipeline_id: initialMockPipeline.pipeline_id,
});
const mockExperiment = buildMockExperimentKF({
  display_name: 'Test experiment 1',
  experiment_id: '1',
});

const mockRun = buildMockRunKF({
  display_name: 'Run 1',
  run_id: 'run-1',
  pipeline_version_reference: {
    pipeline_id: initialMockPipeline.pipeline_id,
    pipeline_version_id: initialMockPipelineVersion.pipeline_version_id,
  },
  experiment_id: mockExperiment.experiment_id,
  runtime_config: {
    parameters: {
      paramOne: true,
      paramTwo: false,
    },
  },
});

const mockRun2 = buildMockRunKF({
  display_name: 'Run 2',
  run_id: 'run-2',
  pipeline_version_reference: {
    pipeline_id: initialMockPipeline.pipeline_id,
    pipeline_version_id: initialMockPipelineVersion.pipeline_version_id,
  },
  experiment_id: mockExperiment.experiment_id,
  runtime_config: {
    parameters: {
      paramOne: false,
      paramTwo: false,
      paramThree: 'Threeseretops',
    },
  },
});

describe('Compare runs', () => {
  beforeEach(() => {
    initIntercepts();
  });

  it('zero runs in url', () => {
    compareRunsGlobal.visit(projectName, mockExperiment.experiment_id);
    compareRunsGlobal.findInvalidRunsError().should('exist');
  });

  it('valid number of runs', () => {
    compareRunsGlobal.visit(projectName, mockExperiment.experiment_id, [
      mockRun.run_id,
      mockRun2.run_id,
    ]);
    cy.wait('@validRun');
    compareRunsGlobal.findInvalidRunsError().should('not.exist');

    compareRunsListTable.findRowByName('Run 1').should('exist');
    compareRunsListTable.findRowByName('Run 2').should('exist');
  });

  it('valid number of runs but it is invalid', () => {
    cy.interceptOdh(
      'GET /api/service/pipelines/:namespace/:serviceName/apis/v2beta1/runs/:runId',
      {
        path: { namespace: projectName, serviceName: 'dspa', runId: 'invalid_run_id' },
      },
      { statusCode: 404 },
    ).as('invalidRun');

    compareRunsGlobal.visit(projectName, mockExperiment.experiment_id, ['invalid_run_id']);
    cy.wait('@invalidRun');
    compareRunsGlobal.findInvalidRunsError().should('exist');
  });

  it('invalid runs are removed from url', () => {
    cy.interceptOdh(
      'GET /api/service/pipelines/:namespace/:serviceName/apis/v2beta1/runs/:runId',
      {
        path: { namespace: projectName, serviceName: 'dspa', runId: 'invalid_run_id' },
      },
      { statusCode: 404 },
    ).as('invalidRun');
    compareRunsGlobal.visit(projectName, mockExperiment.experiment_id, [
      'invalid_run_id',
      mockRun.run_id,
    ]);
    cy.wait('@invalidRun');
    cy.wait('@validRun');
    compareRunsGlobal.findInvalidRunsError().should('not.exist');
    verifyRelativeURL(
      `/experiments/${projectName}/${mockExperiment.experiment_id}/compareRuns?runs=${mockRun.run_id}`,
    );
  });

  it('other failed requests dont change the url ', () => {
    cy.interceptOdh(
      'GET /api/service/pipelines/:namespace/:serviceName/apis/v2beta1/runs/:runId',
      {
        path: { namespace: projectName, serviceName: 'dspa', runId: 'invalid_run_id' },
      },
      mockCancelledGoogleRpcStatus({ message: 'Run cancelled by caller' }),
    ).as('invalidRun');
    compareRunsGlobal.visit(projectName, mockExperiment.experiment_id, [
      'invalid_run_id',
      mockRun.run_id,
    ]);
    cy.wait('@invalidRun');
    cy.wait('@validRun');
    compareRunsGlobal.findInvalidRunsError().should('not.exist');
    verifyRelativeURL(
      `/experiments/${projectName}/${mockExperiment.experiment_id}/compareRuns?runs=invalid_run_id,${mockRun.run_id}`,
    );
  });

  describe('Parameters', () => {
    beforeEach(() => {
      compareRunsGlobal.visit(projectName, mockExperiment.experiment_id, [
        mockRun.run_id,
        mockRun2.run_id,
      ]);
    });

    it('shows empty state when the Runs list has no selections', () => {
      compareRunsListTable.findSelectAllCheckbox().click();
      compareRunParamsTable.findEmptyState().should('exist');
    });

    it('displays table data based on selections from Run list', () => {
      compareRunsListTable.findRowByName('Run 1').should('exist');
      compareRunsListTable.findRowByName('Run 2').should('exist');

      compareRunParamsTable.findColumnByName('Run 1').should('exist');
      compareRunParamsTable.findColumnByName('Run 2').should('exist');

      compareRunParamsTable.findParamName('paramOne').should('exist');
      compareRunParamsTable.findParamName('paramTwo').should('exist');
      compareRunParamsTable.findParamName('paramThree').should('exist');
    });

    it('removes run column from params table when run list selection is removed', () => {
      compareRunsListTable.findRowByName('Run 1').should('exist');
      compareRunsListTable.findRowByName('Run 2').should('exist');

      compareRunParamsTable.findColumnByName('Run 1').should('exist');
      compareRunParamsTable.findColumnByName('Run 2').should('exist');

      compareRunsListTable.getRowByName('Run 2').findCheckbox().click();
      compareRunParamsTable.findColumnByName('Run 1').should('exist');
      compareRunParamsTable.findColumnByName('Run 2').should('not.exist');
    });

    it('only shows parameters with differences when "Hide parameters with no differences" switch is on', () => {
      compareRunsListTable.findRowByName('Run 1').should('exist');
      compareRunsListTable.findRowByName('Run 2').should('exist');

      compareRunParamsTable.findParamName('paramOne').should('exist');
      compareRunParamsTable.findParamName('paramTwo').should('exist');
      compareRunParamsTable.findParamName('paramThree').should('exist');

      cy.pfSwitch('hide-same-params-switch').click();

      compareRunParamsTable.findParamName('paramOne').should('exist');
      compareRunParamsTable.findParamName('paramTwo').should('not.exist');
      compareRunParamsTable.findParamName('paramThree').should('exist');
    });
  });

  describe.only('Metrics', () => {
    beforeEach(() => {
      cy.stub(scalarUtils, 'generateTableStructure').returns({
        columns: [
          {
            label: 'Run name',
            field: 'run-name',
            isStickyColumn: true,
            hasRightBorder: true,
            className: 'pf-v5-u-background-color-200',
            sortable: false,
          },
          {
            label: 'Duplicate of JP matrix testing run 2',
            field: 'Duplicate of JP matrix testing run 2',
            colSpan: 1,
            sortable: false,
            modifier: 'nowrap',
            hasRightBorder: true,
          },
          {
            label: 'JP matrix testing run',
            field: 'JP matrix testing run',
            colSpan: 1,
            sortable: false,
            modifier: 'nowrap',
            hasRightBorder: false,
          },
        ],
        subColumns: [
          {
            label: 'Execution name > Artifact name',
            field: 'execution-name-artifact-name',
            isStickyColumn: true,
            hasRightBorder: true,
            className: 'pf-v5-u-background-color-200',
            sortable: false,
          },
          {
            label: 'digit-classification > metrics',
            field: 'digit-classification > metrics',
            sortable: false,
            modifier: 'nowrap',
            hasRightBorder: true,
          },
          {
            label: 'digit-classification > metrics',
            field: 'digit-classification > metrics',
            sortable: false,
            modifier: 'nowrap',
            hasRightBorder: false,
          },
        ],
        data: [
          {
            key: 'accuracy',
            values: ['92', '92'],
          },
        ],
      });

      compareRunsGlobal.visit(projectName, mockExperiment.experiment_id, [
        mockRun.run_id,
        mockRun2.run_id,
      ]);
    });

    it('shows empty state when the Runs list has no selections', () => {
      compareRunsListTable.findSelectAllCheckbox().click();
      // Stub the generateTableStructure function
      cy.stub(scalarUtils, 'generateTableStructure').returns({
        columns: [],
        subColumns: [],
        data: [],
      });

      compareRunsGlobal.visit(projectName, mockExperiment.experiment_id, [
        mockRun.run_id,
        mockRun2.run_id,
      ]);

      compareRunsMetricsContent.findScalarMetricsEmptyState().should('exist');
    });

    it.only('displays table data based on selections from Run list', () => {
      compareRunsListTable.findRowByName('Run 1').should('exist');
      compareRunsListTable.findRowByName('Run 2').should('exist');

      compareRunsMetricsContent.findScalarMetricsTable().should('exist');
      //TODO: find in scalar metrics table
    });
  });
});

const initIntercepts = () => {
  cy.interceptOdh('GET /api/config', mockDashboardConfig({ disablePipelineExperiments: false }));
  cy.interceptK8sList(
    DataSciencePipelineApplicationModel,
    mockK8sResourceList([
      mockDataSciencePipelineApplicationK8sResource({ namespace: projectName }),
    ]),
  );
  cy.interceptK8s(
    DataSciencePipelineApplicationModel,
    mockDataSciencePipelineApplicationK8sResource({ namespace: projectName }),
  );
  cy.interceptK8s(
    RouteModel,
    mockRouteK8sResource({
      notebookName: 'ds-pipeline-dspa',
      namespace: projectName,
    }),
  );
  cy.interceptK8sList(
    ProjectModel,
    mockK8sResourceList([
      mockProjectK8sResource({ k8sName: projectName, displayName: projectName }),
    ]),
  );
  cy.interceptOdh(
    'GET /api/service/pipelines/:namespace/:serviceName/apis/v2beta1/pipelines',
    {
      path: { namespace: projectName, serviceName: 'dspa' },
    },
    buildMockPipelines([initialMockPipeline]),
  );
  cy.interceptOdh(
    'GET /api/service/pipelines/:namespace/:serviceName/apis/v2beta1/experiments/:experimentId',
    {
      path: {
        namespace: projectName,
        serviceName: 'dspa',
        experimentId: mockExperiment.experiment_id,
      },
    },
    mockExperiment,
  );

  cy.interceptOdh(
    'GET /api/service/pipelines/:namespace/:serviceName/apis/v2beta1/runs/:runId',
    {
      path: { namespace: projectName, serviceName: 'dspa', runId: mockRun.run_id },
    },
    mockRun,
  ).as('validRun');

  cy.interceptOdh(
    'GET /api/service/pipelines/:namespace/:serviceName/apis/v2beta1/runs/:runId',
    {
      path: { namespace: projectName, serviceName: 'dspa', runId: mockRun2.run_id },
    },
    mockRun2,
  );

  // TODO look at Gage's branch again: https://github.com/opendatahub-io/odh-dashboard/compare/main...Gkrumbach07:odh-dashboard:test-mlmd#diff-9aa5e1d9f4d5bf5c6731a92f2dce95b408b3ac1c8b6a684b003c0bcda65193e2
  // - What can we keep from it? sample data?
  // TODO intercepts for these routes:
  // /api/service/mlmd/:namespace/dspa/ml_metadata.MetadataStoreService/*
  // /GetContextByTypeAndName
  // /GetArtifactTypes
  // /GetContextByTypeAndName
  // /GetArtifactsByContext
  // /GetExecutionsByContext
  // /GetEventsByExecutionIDs
  // TODO For each route --
  // - Write down sample request and response data
  // - Mock static responses without looking at request params, see if we can get the tables to populate
  //   - Try Gage's thing first or look at https://www.npmjs.com/package/@botchris/grpc-web-mock
  // - Look at conditional intercepts based on request content - how to see this when intercepting? log the request?
  // - Get the 2 main tests to pass with real intercepts
  // - Squash to 1 commit, send a branch to Dallas, have him take over Metrics
  // - Work off the same commit to write tests for Artifacts
};
