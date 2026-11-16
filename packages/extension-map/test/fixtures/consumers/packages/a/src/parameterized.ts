import React from 'react';
import { useExtensions } from '@openshift/dynamic-plugin-sdk';
import type { Extension, LoadedExtension } from '@openshift/dynamic-plugin-sdk';
import { isA } from './points';
import type { FxA } from './points';

export const useParameterized = (label: string): LoadedExtension<FxA>[] => {
  const predicate = React.useCallback(
    (e: Extension): e is FxA => isA(e) && e.properties.label === label,
    [label],
  );
  return useExtensions(predicate);
};
