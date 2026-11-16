import { useExtensions } from '@openshift/dynamic-plugin-sdk';
import type { LoadedExtension } from '@openshift/dynamic-plugin-sdk';
import type { AGuard, FxA } from './points';

/** A wrapper whose guard parameter is concretely typed, so the inner argument is guard-typed. */
export const useMine = (pred: AGuard): LoadedExtension<FxA>[] => useExtensions(pred);
