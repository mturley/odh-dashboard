import type { NIMDeployment } from '../../../../api/nimservices/types';
import { NIM_ID } from '../../../../../extensions';
import { type NIMPVCFieldValue, NIMPVCStorageMode } from '../NIMPVCField';
import { applyNIMPVCFieldData, extractNIMPVCFieldData } from '../nimPVCApplyExtract';

const makeDeployment = (storage?: NIMDeployment['model']['spec']['storage']): NIMDeployment => ({
  modelServingPlatformId: NIM_ID,
  model: {
    apiVersion: 'apps.nvidia.com/v1alpha1',
    kind: 'NIMService',
    metadata: { name: 'test-nim', namespace: 'test-ns' },
    spec: {
      image: { repository: 'nvcr.io/nim/meta/llama-3.2-1b-instruct', tag: '1.8' },
      ...(storage && { storage }),
    },
  },
});

describe('applyNIMPVCFieldData', () => {
  it('should set new PVC storage on the deployment', () => {
    const deployment = makeDeployment();
    const fieldData: NIMPVCFieldValue = {
      storageMode: NIMPVCStorageMode.NEW,
      pvcName: 'nim-cache-pvc',
      modelPath: '/model-store',
      subPath: '/',
      storageClassName: 'gp3-csi',
      storageSizeGi: 50,
    };

    const result = applyNIMPVCFieldData(deployment, fieldData);

    expect(result.model.spec.storage?.pvc).toEqual({
      create: true,
      name: 'nim-cache-pvc',
      size: '50Gi',
      storageClassName: 'gp3-csi',
      subPath: undefined,
    });
  });

  it('should set existing PVC storage on the deployment', () => {
    const deployment = makeDeployment();
    const fieldData: NIMPVCFieldValue = {
      storageMode: NIMPVCStorageMode.EXISTING,
      pvcName: 'my-existing-pvc',
      modelPath: '/model-store',
      subPath: '/models/llama',
      storageClassName: '',
      storageSizeGi: 50,
    };

    const result = applyNIMPVCFieldData(deployment, fieldData);

    expect(result.model.spec.storage?.pvc).toEqual({
      create: false,
      name: 'my-existing-pvc',
      subPath: '/models/llama',
    });
  });

  it('should preserve other spec fields', () => {
    const deployment = makeDeployment();
    deployment.model.spec.replicas = 3;
    deployment.model.spec.authSecret = 'my-secret';

    const result = applyNIMPVCFieldData(deployment, {
      storageMode: NIMPVCStorageMode.NEW,
      pvcName: 'pvc-1',
      modelPath: '/model-store',
      subPath: '/',
      storageClassName: 'gp3-csi',
      storageSizeGi: 100,
    });

    expect(result.model.spec.replicas).toBe(3);
    expect(result.model.spec.authSecret).toBe('my-secret');
  });

  it('should not mutate the original deployment', () => {
    const deployment = makeDeployment();
    applyNIMPVCFieldData(deployment, {
      storageMode: NIMPVCStorageMode.NEW,
      pvcName: 'changed',
      modelPath: '/model-store',
      subPath: '/',
      storageClassName: 'gp3-csi',
      storageSizeGi: 50,
    });

    expect(deployment.model.spec.storage).toBeUndefined();
  });

  it('should omit storageClassName when empty string for new mode', () => {
    const deployment = makeDeployment();
    const result = applyNIMPVCFieldData(deployment, {
      storageMode: NIMPVCStorageMode.NEW,
      pvcName: 'pvc-1',
      modelPath: '/model-store',
      subPath: '/',
      storageClassName: '',
      storageSizeGi: 50,
    });

    expect(result.model.spec.storage?.pvc?.storageClassName).toBeUndefined();
  });
});

describe('extractNIMPVCFieldData', () => {
  it('should return undefined when no storage.pvc exists', () => {
    const deployment = makeDeployment();
    expect(extractNIMPVCFieldData(deployment)).toBeUndefined();
  });

  it('should extract new PVC data', () => {
    const deployment = makeDeployment({
      pvc: {
        create: true,
        name: 'nim-cache',
        size: '50Gi',
        storageClassName: 'gp3-csi',
      },
    });

    const result = extractNIMPVCFieldData(deployment);
    expect(result).toEqual({
      storageMode: NIMPVCStorageMode.NEW,
      pvcName: 'nim-cache',
      modelPath: '/model-store',
      subPath: '/',
      storageClassName: 'gp3-csi',
      storageSizeGi: 50,
    });
  });

  it('should extract existing PVC data', () => {
    const deployment = makeDeployment({
      pvc: {
        create: false,
        name: 'my-existing-pvc',
        subPath: '/models/llama',
      },
    });

    const result = extractNIMPVCFieldData(deployment);
    expect(result).toEqual({
      storageMode: NIMPVCStorageMode.EXISTING,
      pvcName: 'my-existing-pvc',
      modelPath: '/model-store',
      subPath: '/models/llama',
      storageClassName: '',
      storageSizeGi: 50,
    });
  });

  it('should default storage size to 50 when not specified', () => {
    const deployment = makeDeployment({ pvc: { create: true, name: 'test' } });
    const result = extractNIMPVCFieldData(deployment);
    expect(result?.storageSizeGi).toBe(50);
  });

  it('should parse storage size correctly', () => {
    const deployment = makeDeployment({ pvc: { create: true, name: 'test', size: '100Gi' } });
    const result = extractNIMPVCFieldData(deployment);
    expect(result?.storageSizeGi).toBe(100);
  });
});

describe('PVC apply + extract round-trip', () => {
  it('should round-trip new PVC correctly', () => {
    const original: NIMPVCFieldValue = {
      storageMode: NIMPVCStorageMode.NEW,
      pvcName: 'nim-cache-pvc',
      modelPath: '/model-store',
      subPath: '/',
      storageClassName: 'gp3-csi',
      storageSizeGi: 50,
    };

    const deployment = makeDeployment();
    const applied = applyNIMPVCFieldData(deployment, original);
    const extracted = extractNIMPVCFieldData(applied);

    expect(extracted).toEqual(original);
  });

  it('should round-trip existing PVC correctly', () => {
    const original: NIMPVCFieldValue = {
      storageMode: NIMPVCStorageMode.EXISTING,
      pvcName: 'my-pvc',
      modelPath: '/model-store',
      subPath: '/models/llama',
      storageClassName: '',
      storageSizeGi: 50,
    };

    const deployment = makeDeployment();
    const applied = applyNIMPVCFieldData(deployment, original);
    const extracted = extractNIMPVCFieldData(applied);

    expect(extracted).toEqual(original);
  });
});
