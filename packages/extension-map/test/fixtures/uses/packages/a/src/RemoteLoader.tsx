import React from 'react';
import { HookNotify } from '../../plugin-core/src/core/helpers/HookNotify';
import { LazyCodeRefComponent } from '../../plugin-core/src/core/helpers/LazyCodeRefComponent';

const loadRemote = (): Promise<{ default: React.ComponentType }> =>
  Promise.resolve({ default: () => null });

const useLocal = (): string => 'local';

/** Lazy loading and a hook that no extension feeds: neither is a use. */
export const RemoteLoader = (): React.ReactElement => (
  <>
    <LazyCodeRefComponent component={loadRemote} />
    <HookNotify useHook={useLocal} />
  </>
);
