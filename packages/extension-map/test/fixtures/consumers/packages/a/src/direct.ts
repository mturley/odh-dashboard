import { useExtensions } from '@openshift/dynamic-plugin-sdk';
import type { LoadedExtension } from '@openshift/dynamic-plugin-sdk';
import { isA, isB } from './points';
import type { FxA, FxB } from './points';
import { useResolvedExtensions } from '../../plugin-core/src/core/useResolvedExtensions';

export const useDirect = (): LoadedExtension<FxA>[] => useExtensions(isA);

export function useDirectResolved(): LoadedExtension<FxB>[] {
  const [extensions] = useResolvedExtensions(isB);
  return extensions;
}
