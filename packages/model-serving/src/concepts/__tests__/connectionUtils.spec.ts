import {
  createSecret,
  getSecret,
  deleteSecret,
  isGeneratedSecretName,
  getGeneratedSecretName,
} from '@odh-dashboard/internal/api/index';
import { assembleConnectionSecret } from '@odh-dashboard/internal/concepts/connectionTypes/utils';
import { SecretKind } from '@odh-dashboard/internal/k8sTypes';
import { Connection } from '@odh-dashboard/internal/concepts/connectionTypes/types';
import { ModelLocationType } from '../../components/deploymentWizard/types';
import { handleConnectionCreation } from '../connectionUtils';

jest.mock('@odh-dashboard/internal/api/index');
jest.mock('@odh-dashboard/internal/concepts/connectionTypes/utils', () => ({
  ...jest.requireActual('@odh-dashboard/internal/concepts/connectionTypes/utils'),
  assembleConnectionSecret: jest.fn(),
  getConnectionProtocolType: jest.fn().mockReturnValue('oci'),
}));

const createSecretMock = jest.mocked(createSecret);
const getSecretMock = jest.mocked(getSecret);
const deleteSecretMock = jest.mocked(deleteSecret);
const isGeneratedSecretNameMock = jest.mocked(isGeneratedSecretName);
const getGeneratedSecretNameMock = jest.mocked(getGeneratedSecretName);
const assembleConnectionSecretMock = jest.mocked(assembleConnectionSecret);

const mockSecret = (name: string): SecretKind => ({
  apiVersion: 'v1',
  kind: 'Secret',
  metadata: { name, namespace: 'test-ns' },
  data: {},
});

const mockConnection = (name: string): Connection =>
  ({
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name,
      namespace: 'test-ns',
      labels: { 'opendatahub.io/dashboard': 'true' },
      annotations: { 'opendatahub.io/connection-type-ref': 'oci-v1' },
    },
    data: {},
  } as unknown as Connection);

describe('handleConnectionCreation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isGeneratedSecretNameMock.mockImplementation((name: string) => name.startsWith('secret-'));
    getGeneratedSecretNameMock.mockReturnValue('secret-new123');
    assembleConnectionSecretMock.mockReturnValue(mockSecret('placeholder'));
    createSecretMock.mockImplementation(async (secret) =>
      mockSecret((secret as SecretKind).metadata.name),
    );
    getSecretMock.mockImplementation(async (_ns, name) => mockSecret(name));
    deleteSecretMock.mockResolvedValue({ apiVersion: 'v1', kind: 'Status', status: 'Success' });
  });

  it('should return a cleanup function when the old secret name differs from the new one', async () => {
    const result = await handleConnectionCreation(
      {},
      'test-ns',
      {
        type: ModelLocationType.NEW,
        fieldValues: {},
        additionalFields: {},
      },
      'secret-old456',
      false,
      mockConnection('secret-old456'),
    );

    expect(result.secret).toBeDefined();
    expect(result.cleanup).toBeDefined();

    // Secret should be created but old secret should NOT be deleted yet
    expect(createSecretMock).toHaveBeenCalled();
    expect(deleteSecretMock).not.toHaveBeenCalled();
  });

  it('should delete the old generated secret when cleanup is called', async () => {
    const result = await handleConnectionCreation(
      {},
      'test-ns',
      {
        type: ModelLocationType.NEW,
        fieldValues: {},
        additionalFields: {},
      },
      'secret-old456',
      false,
      mockConnection('secret-old456'),
    );

    await result.cleanup?.();

    expect(getSecretMock).toHaveBeenCalledWith('test-ns', 'secret-old456');
    expect(deleteSecretMock).toHaveBeenCalledWith('test-ns', 'secret-old456');
  });

  it('should not delete a non-generated secret when cleanup is called', async () => {
    isGeneratedSecretNameMock.mockImplementation((name: string) => name.startsWith('secret-'));

    const result = await handleConnectionCreation(
      {},
      'test-ns',
      {
        type: ModelLocationType.NEW,
        fieldValues: {},
        additionalFields: {},
      },
      'my-saved-connection',
      false,
      mockConnection('my-saved-connection'),
    );

    // The old secret name is not generated, so no cleanup needed
    // (actualSecretName will be 'my-saved-connection' since it's not generated)
    expect(result.cleanup).toBeUndefined();
  });

  it('should not return a cleanup function when there is no old connection', async () => {
    const result = await handleConnectionCreation(
      {},
      'test-ns',
      {
        type: ModelLocationType.NEW,
        fieldValues: {},
        additionalFields: {},
      },
      undefined,
      false,
      undefined,
    );

    expect(result.secret).toBeDefined();
    expect(result.cleanup).toBeUndefined();
  });

  it('should not return a cleanup function for dry run when names match', async () => {
    // When the old and new names are the same, no cleanup is needed
    getGeneratedSecretNameMock.mockReturnValue('secret-old456');

    const result = await handleConnectionCreation(
      {},
      'test-ns',
      {
        type: ModelLocationType.NEW,
        fieldValues: {},
        additionalFields: {},
      },
      'secret-old456',
      true,
      mockConnection('secret-old456'),
    );

    expect(result.cleanup).toBeUndefined();
  });

  it('should return cleanup function for dry run when names differ', async () => {
    const result = await handleConnectionCreation(
      {},
      'test-ns',
      {
        type: ModelLocationType.NEW,
        fieldValues: {},
        additionalFields: {},
      },
      'secret-old456',
      true,
      mockConnection('secret-old456'),
    );

    expect(result.cleanup).toBeDefined();
    // Cleanup should not have been called automatically
    expect(deleteSecretMock).not.toHaveBeenCalled();
  });
});
