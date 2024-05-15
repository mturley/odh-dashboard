import React from 'react';
import { Button, Modal } from '@patternfly/react-core';
import { ModelRegistryKind } from '~/k8sTypes';

type ViewDatabaseConfigModalProps = {
  modelRegistry: ModelRegistryKind;
  isOpen: boolean;
  onClose: () => void;
};

const ViewDatabaseConfigModal: React.FC<ViewDatabaseConfigModalProps> = ({
  modelRegistry: mr,
  isOpen,
  onClose,
}) => (
  <Modal
    title="View database configuration"
    description="This external database is where model data is stored."
    isOpen={isOpen}
    onClose={onClose}
    variant="medium"
    actions={[
      <Button key="close" variant="link" onClick={onClose}>
        Close
      </Button>,
    ]}
  >
    TODO: Show database info for registry {mr.metadata.name}
    <br />
    TODO: This feature is not yet implemented
  </Modal>
);

export default ViewDatabaseConfigModal;
