import { useExtensions } from '@openshift/dynamic-plugin-sdk';
import type { Extension, LoadedExtension } from '@openshift/dynamic-plugin-sdk';
import type { FxA } from './points';

/** Not exported, so not a point: a guard narrowing to it selects no known point. */
type FxNope = Extension<'fx.nope', { never: boolean }>;

export const useInline = (): LoadedExtension<FxA>[] =>
  useExtensions((e: Extension): e is FxA => e.type === 'fx.a');

export const useNope = (): LoadedExtension<FxNope>[] =>
  useExtensions((e: Extension): e is FxNope => e.type === 'fx.nope');
