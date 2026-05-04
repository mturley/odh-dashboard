import type { AreaExtension } from '@odh-dashboard/plugin-core/extension-points';
import type { WizardField2Extension } from '@odh-dashboard/model-serving/extension-points';
// Allow this import as it consists of types and enums only.
// eslint-disable-next-line no-restricted-syntax
import { SupportedArea } from '@odh-dashboard/internal/concepts/areas/types';
import type { NIMImageFieldType } from './src/wizardFields/NIMImageField';

const NIM_WIZARD_AREA = 'nim-wizard';

const extensions: (AreaExtension | WizardField2Extension<NIMImageFieldType>)[] = [
  {
    type: 'app.area',
    properties: {
      id: NIM_WIZARD_AREA,
      featureFlags: ['nimWizard'],
      reliantAreas: [SupportedArea.NIM_MODEL],
    },
  },
  {
    type: 'model-serving.deployment/wizard-field2',
    properties: {
      field: () =>
        import('./src/wizardFields/NIMImageField').then((m) => m.NIMImageFieldWizardField),
    },
    flags: {
      required: [NIM_WIZARD_AREA],
    },
  },
];

export default extensions;
