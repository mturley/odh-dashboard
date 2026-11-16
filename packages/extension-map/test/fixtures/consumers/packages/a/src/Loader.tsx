import React from 'react';
import { useExtensions } from '@openshift/dynamic-plugin-sdk';
import type { Extension, ExtensionPredicate } from '@openshift/dynamic-plugin-sdk';

type LoaderProps<T extends Extension> = {
  predicate: ExtensionPredicate<T>;
  label: string;
};

export function Loader<T extends Extension>({
  predicate,
  label,
}: LoaderProps<T>): React.ReactElement {
  const extensions = useExtensions(predicate);
  return (
    <span>
      {label}
      {extensions.length}
    </span>
  );
}
