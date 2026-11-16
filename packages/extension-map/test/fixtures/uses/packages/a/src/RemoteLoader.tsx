import React from 'react';
import { HookNotify } from '../../plugin-core/src/core/helpers/HookNotify';
import { LazyCodeRefComponent } from '../../plugin-core/src/core/helpers/LazyCodeRefComponent';

const loadRemote = (): Promise<{ default: React.ComponentType }> =>
  Promise.resolve({ default: () => null });

const useLocal = (): string => 'local';

/**
 * Extension-shaped, but its `type` names no extension point: reading `properties` from it is no
 * use of any point.
 */
const remote: { type: 'fx.remote'; properties: { component: typeof loadRemote } } = {
  type: 'fx.remote',
  properties: { component: loadRemote },
};

/** Not extension-shaped at all: it has `properties` but no `type`. */
const settings = { properties: { useValue: useLocal } };

/** Lazy loading and a hook that no extension feeds: neither is a use. */
export const RemoteLoader = (): React.ReactElement => (
  <>
    <LazyCodeRefComponent component={remote.properties.component} />
    <HookNotify useHook={settings.properties.useValue} />
  </>
);
