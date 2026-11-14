import type { CodeRef, Extension } from '@openshift/dynamic-plugin-sdk';
import type { RemData, RemGone, RemOld } from '@mf/rem/extension-points';

/** Carries a type whose committed copy maps back to source. */
export type CP = Extension<'c.p', { data: CodeRef<RemData> }>;

/** Carries a type the copy declares but source has since renamed. */
export type CQ = Extension<'c.q', { data: CodeRef<RemOld> }>;

/** Carries a type whose source file no longer exists. */
export type CR = Extension<'c.r', { data: CodeRef<RemGone> }>;

export const isCP = (e: Extension): e is CP => e.type === 'c.p';

export const isCQ = (e: Extension): e is CQ => e.type === 'c.q';

export const isCR = (e: Extension): e is CR => e.type === 'c.r';
