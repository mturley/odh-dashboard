import type { CodeRef, Extension } from '@openshift/dynamic-plugin-sdk';
import type { RemOld } from '@mf/rem/extension-points';

/** A second program reaching the same stale copy: the diagnostic is reported once. */
export type C2Q = Extension<'c2.q', { data: CodeRef<RemOld> }>;

export const isC2Q = (e: Extension): e is C2Q => e.type === 'c2.q';
