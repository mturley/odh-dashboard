import type { Extension, ExtensionPredicate } from '@openshift/dynamic-plugin-sdk';

export type RemStale = Extension<
  'rem.stale',
  {
    note: string;
  }
>;
export declare const isStaleP: ExtensionPredicate<RemStale>;
