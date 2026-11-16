import type { Extension, ExtensionPredicate } from '@openshift/dynamic-plugin-sdk';

export type RemGone = Extension<
  'rem.gone',
  {
    note: string;
  }
>;
export declare const isGoneP: ExtensionPredicate<RemGone>;
