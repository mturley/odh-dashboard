import React from 'react';
import { z } from 'zod';
import { Form, FormSection, Spinner } from '@patternfly/react-core';
import { useZodFormValidation } from '@odh-dashboard/internal/hooks/useZodFormValidation';
import { modelTypeSelectFieldSchema, ModelTypeSelectField } from '../fields/ModelTypeSelectField';
import { UseModelDeploymentWizardState } from '../useDeploymentWizard';
import { ModelLocationSelectField } from '../fields/ModelLocationSelectField';
import { isValidModelLocationData } from '../fields/ModelLocationInputFields';
import { ModelLocationData } from '../types';
import {
  createConnectionDataSchema,
  CreateConnectionInputFields,
} from '../fields/CreateConnectionInputFields';
import type { ExternalDataMap } from '../ExternalDataLoader';
import { GenericFieldRenderer } from '../fields/GenericFieldRenderer';

// Schema
export const modelSourceStepSchema = z.object({
  modelType: modelTypeSelectFieldSchema,
  modelLocationData: z.custom<ModelLocationData>((val) => {
    if (!val) return false;
    return isValidModelLocationData(val.type, val);
  }),
  createConnectionData: createConnectionDataSchema,
});

export type ModelSourceStepData = z.infer<typeof modelSourceStepSchema>;

type ModelSourceStepProps = {
  wizardState: UseModelDeploymentWizardState;
  validation: ReturnType<typeof useZodFormValidation<ModelSourceStepData>>;
  externalData?: ExternalDataMap;
};

export const ModelSourceStepContent: React.FC<ModelSourceStepProps> = ({
  wizardState,
  validation,
  externalData,
}) => {
  const modelSourceFields = React.useMemo(
    () => wizardState.fields.filter((f) => f.step === 'modelSource'),
    [wizardState.fields],
  );

  if (!wizardState.loaded.modelSourceLoaded) {
    return <Spinner data-testid="spinner" />;
  }

  return (
    <Form>
      <FormSection title="Model details">
        <p style={{ marginTop: '-8px' }}>Provide information about the model you want to deploy.</p>
        <ModelLocationSelectField
          modelLocation={wizardState.state.modelLocationData.data?.type}
          validationProps={validation.getFieldValidationProps([
            'modelLocation',
            'modelLocationData',
          ])}
          validationIssues={validation.getFieldValidation(['modelLocation', 'modelLocationData'])}
          modelLocationData={wizardState.state.modelLocationData.data}
          setModelLocationData={wizardState.state.modelLocationData.setData}
          resetModelLocationData={() => wizardState.state.modelLocationData.setData(undefined)}
          connections={wizardState.state.modelLocationData.connections}
          setSelectedConnection={wizardState.state.modelLocationData.setSelectedConnection}
          selectedConnection={wizardState.state.modelLocationData.selectedConnection}
          pvcs={wizardState.state.modelLocationData.pvcs}
        />
        <CreateConnectionInputFields
          createConnectionData={wizardState.state.createConnectionData.data}
          setCreateConnectionData={wizardState.state.createConnectionData.setData}
          projectName={wizardState.state.project.projectName}
          modelLocationData={wizardState.state.modelLocationData.data}
          setModelLocationData={wizardState.state.modelLocationData.setData}
        />
        {modelSourceFields.map((field) => (
          <GenericFieldRenderer
            key={field.id}
            fieldId={field.id}
            wizardState={wizardState}
            externalData={externalData}
          />
        ))}
        <ModelTypeSelectField
          modelType={wizardState.state.modelType.data}
          setModelType={wizardState.state.modelType.setData}
          validationProps={validation.getFieldValidationProps(['modelType'])}
          validationIssues={validation.getFieldValidation(['modelType'])}
          isEditing={
            !wizardState.initialData?.modelTypeField ? false : wizardState.initialData.isEditing
          }
        />
      </FormSection>
    </Form>
  );
};
