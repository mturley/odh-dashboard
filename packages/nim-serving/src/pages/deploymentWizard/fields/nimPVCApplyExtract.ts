import type { NIMDeployment } from '../../../api/nimservices/types';
import { type NIMPVCFieldValue, NIMPVCStorageMode } from './NIMPVCField';

const DEFAULT_MODEL_PATH = '/model-store';
const DEFAULT_SUBPATH = '/';

const parseStorageSize = (size: string | undefined): number => {
  if (!size) {
    return 50;
  }
  const match = size.match(/^(\d+)\s*Gi$/i);
  return match ? parseInt(match[1], 10) : 50;
};

export const applyNIMPVCFieldData = (
  deployment: NIMDeployment,
  fieldData: NIMPVCFieldValue,
): NIMDeployment => {
  const pvc =
    fieldData.storageMode === NIMPVCStorageMode.NEW
      ? {
          create: true,
          name: fieldData.pvcName,
          size: `${fieldData.storageSizeGi}Gi`,
          storageClassName: fieldData.storageClassName || undefined,
          subPath: fieldData.subPath !== DEFAULT_SUBPATH ? fieldData.subPath : undefined,
        }
      : {
          create: false,
          name: fieldData.pvcName,
          subPath: fieldData.subPath !== DEFAULT_SUBPATH ? fieldData.subPath : undefined,
        };

  return {
    ...deployment,
    model: {
      ...deployment.model,
      spec: {
        ...deployment.model.spec,
        storage: {
          ...deployment.model.spec.storage,
          pvc,
        },
      },
    },
  };
};

export const extractNIMPVCFieldData = (deployment: NIMDeployment): NIMPVCFieldValue | undefined => {
  const pvc = deployment.model.spec.storage?.pvc;
  if (!pvc) {
    return undefined;
  }

  const isExisting = pvc.create === false && !!pvc.name;

  return {
    storageMode: isExisting ? NIMPVCStorageMode.EXISTING : NIMPVCStorageMode.NEW,
    pvcName: pvc.name ?? '',
    modelPath: DEFAULT_MODEL_PATH,
    subPath: pvc.subPath ?? DEFAULT_SUBPATH,
    storageClassName: pvc.storageClassName ?? '',
    storageSizeGi: parseStorageSize(pvc.size),
  };
};
