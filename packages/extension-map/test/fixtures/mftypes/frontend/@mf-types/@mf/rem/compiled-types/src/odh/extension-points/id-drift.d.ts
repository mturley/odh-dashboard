import type { Extension } from '@openshift/dynamic-plugin-sdk';

export type DriftP = Extension<
  'rem.drift.copy',
  {
    note: string;
  }
>;
