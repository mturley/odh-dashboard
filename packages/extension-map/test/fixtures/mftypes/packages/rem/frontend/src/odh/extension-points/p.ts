import type { CodeRef, Extension } from '@openshift/dynamic-plugin-sdk';
import type { RemData } from './data';

/** Point `rem.p` summary. */
export type RemP = Extension<'rem.p', { data: CodeRef<RemData> }>;

/** Guard for the `rem.p` point. */
export const isRemP = (e: Extension): e is RemP => e.type === 'rem.p';
