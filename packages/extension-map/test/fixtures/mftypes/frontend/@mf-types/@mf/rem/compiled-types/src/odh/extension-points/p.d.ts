import type { CodeRef, Extension, ExtensionPredicate } from '@openshift/dynamic-plugin-sdk';
import type { RemData } from './data';

export type RemP = Extension<
  'rem.p',
  {
    data: CodeRef<RemData>;
  }
>;
export declare const isRemP: ExtensionPredicate<RemP>;
