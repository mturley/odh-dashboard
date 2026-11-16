import React from 'react';
import { useExtensions } from '@openshift/dynamic-plugin-sdk';
import { Row } from './Row';
import { isA } from './points';

/** Queries the extensions and hands each one to a component in another file. */
export const List = (): React.ReactElement => {
  const extensions = useExtensions(isA);
  return (
    <>
      {extensions.map((extension) => (
        <Row key={extension.uid} extension={extension} />
      ))}
    </>
  );
};
