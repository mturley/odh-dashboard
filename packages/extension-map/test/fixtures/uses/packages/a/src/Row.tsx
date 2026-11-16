import React from 'react';
import type { LoadedExtension } from '@openshift/dynamic-plugin-sdk';
import type { FxA } from './points';
import { LazyCodeRefComponent } from '../../plugin-core/src/core/helpers/LazyCodeRefComponent';

/** Receives one extension through a prop and renders its code reference. */
export const Row = ({ extension }: { extension: LoadedExtension<FxA> }): React.ReactElement => (
  <div title={extension.properties.label}>
    {extension.properties.items.length}
    <LazyCodeRefComponent component={extension.properties.component} />
  </div>
);
