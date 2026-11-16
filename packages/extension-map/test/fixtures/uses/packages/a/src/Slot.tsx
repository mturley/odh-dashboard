import React from 'react';
import { useExtensions } from '@openshift/dynamic-plugin-sdk';
import { isB } from './points';

/** A consumer rendered by Parent. */
export const Slot = (): React.ReactElement => {
  const [first] = useExtensions(isB);
  return <span>{first.properties.label}</span>;
};
