import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  EmptyStateHeader,
  EmptyStateIcon,
  EmptyStateVariant,
} from '@patternfly/react-core';
import { PlusCircleIcon } from '@patternfly/react-icons';
import ApplicationsPage from '~/pages/ApplicationsPage';
import useModelRegistriesBackend from '~/concepts/modelRegistrySettings/useModelRegistriesBackend';
import ModelRegistriesTable from './ModelRegistriesTable';

const ModelRegistrySettings: React.FC = () => {
  const navigate = useNavigate();
  const [modelRegistries, loaded, loadError, refresh] = useModelRegistriesBackend();
  const onCreateModelRegistryClick = () => navigate('/modelRegistry'); // TODO
  return (
    <ApplicationsPage
      title="Model Registry Settings"
      description="Manage model registry settings for all users in your organization."
      loaded={loaded}
      loadError={loadError}
      errorMessage="Unable to load model registries."
      empty={modelRegistries.length === 0}
      emptyStatePage={
        <EmptyState variant={EmptyStateVariant.lg}>
          <EmptyStateHeader
            titleText="No model registries"
            icon={<EmptyStateIcon icon={PlusCircleIcon} />}
            headingLevel="h5"
          />
          <EmptyStateBody>
            To get started, create a model registry. You can manage permissions after creation.
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" onClick={onCreateModelRegistryClick}>
                Create model registry
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      }
      provideChildrenPadding
    >
      <ModelRegistriesTable
        modelRegistries={modelRegistries}
        refresh={refresh}
        onCreateModelRegistryClick={onCreateModelRegistryClick}
      />
    </ApplicationsPage>
  );
};

export default ModelRegistrySettings;
