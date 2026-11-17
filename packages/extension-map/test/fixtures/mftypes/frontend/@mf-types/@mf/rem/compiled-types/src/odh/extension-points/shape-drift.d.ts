import type { Extension } from '@openshift/dynamic-plugin-sdk';

export type ShapeP = Extension<
  'rem.shape',
  {
    note: string;
  }
>;
