import type { Extension } from '@openshift/dynamic-plugin-sdk';

/** The first fixture point. */
export type FxA = Extension<'fx.a', { label: string }>;

/** The second fixture point. */
export type FxB = Extension<'fx.b', { name: string }>;

export const isA = (e: Extension): e is FxA => e.type === 'fx.a';

export const isB = (e: Extension): e is FxB => e.type === 'fx.b';

export type AGuard = (e: Extension) => e is FxA;

export const FX_A_TYPE = 'fx.a';

export enum FxKind {
  B = 'fx.b',
}
