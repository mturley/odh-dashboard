import type { Extension, ExtensionPredicate, LoadedExtension } from '@openshift/dynamic-plugin-sdk';
import { useExtensions } from './useExtensions';

/**
 * Like plugin-core's own hook: a query hook that forwards its predicate to `useExtensions`, which
 * must not make it a wrapper or the inner call a query site.
 */
export const useResolvedExtensions = <TExtension extends Extension>(
  predicate?: ExtensionPredicate<TExtension>,
): [LoadedExtension<TExtension>[], boolean] => [useExtensions(predicate), true];
