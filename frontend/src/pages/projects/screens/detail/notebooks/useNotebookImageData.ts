import * as React from 'react';
import { NotebookKind } from '~/k8sTypes';
import useNamespaces from '~/pages/notebookController/useNamespaces';
import useImageStreams from '~/pages/projects/screens/spawner/useImageStreams';
import { NotebookContainer } from '~/types';
import { getImageStreamDisplayName } from '~/pages/projects/screens/spawner/spawnerUtils';
import { NotebookImageAvailability } from './const';
import { NotebookImageData } from './types';

const useNotebookImageData = (notebook?: NotebookKind): NotebookImageData => {
  const { dashboardNamespace } = useNamespaces();
  const [images, loaded, loadError] = useImageStreams(dashboardNamespace, true);

  return React.useMemo(() => {
    if (!loaded || !notebook) {
      return [null, false, loadError];
    }

    const container: NotebookContainer | undefined = notebook.spec.template.spec.containers.find(
      (container) => container.name === notebook.metadata.name,
    );
    const imageTag = container?.image.split('/').at(-1)?.split(':');

    // if image could not be parsed from the container, consider it deleted because the image tag is invalid
    if (!imageTag || imageTag.length < 2 || !container) {
      return [
        {
          imageAvailability: NotebookImageAvailability.DELETED,
        },
        true,
        undefined,
      ];
    }

    const [imageName, versionName] = imageTag;
    const imageStream = images.find((image) => image.metadata.name === imageName);

    // if the image stream is not found, consider it deleted
    if (!imageStream) {
      // Get the image display name from the notebook metadata if we can't find the image stream. (this is a fallback and could still be undefined)
      const imageDisplayName = notebook.metadata.annotations?.['opendatahub.io/image-display-name'];

      return [
        {
          imageAvailability: NotebookImageAvailability.DELETED,
          imageDisplayName,
        },
        true,
        undefined,
      ];
    }

    const versions = imageStream.spec.tags || [];
    const imageVersion = versions.find((version) => version.name === versionName);

    // because the image stream was found, get its display name
    const imageDisplayName = getImageStreamDisplayName(imageStream);

    // if the image version is not found, consider the image stream deleted
    if (!imageVersion) {
      return [
        {
          imageAvailability: NotebookImageAvailability.DELETED,
          imageDisplayName,
        },
        true,
        undefined,
      ];
    }

    // if the image stream exists and the image version exists, return the image data
    return [
      {
        imageStream,
        imageVersion,
        imageAvailability:
          imageStream.metadata.labels?.['opendatahub.io/notebook-image'] === 'true'
            ? NotebookImageAvailability.ENABLED
            : NotebookImageAvailability.DISABLED,
        imageDisplayName,
      },
      true,
      undefined,
    ];
  }, [images, notebook, loaded, loadError]);
};

export default useNotebookImageData;
