import type { Extension } from '@openshift/dynamic-plugin-sdk';
import type { FxB } from './ext';

export const createGuard =
  <T extends Extension>(type: string) =>
  (e: Extension): e is T =>
    e.type === type;

export const isFxB = createGuard<FxB>('fx.b');

export type FxZ = { type: 'fx.z'; properties: { z: number } };

export const isFxZ = (e: Extension): e is FxZ => e.type === 'fx.z';
