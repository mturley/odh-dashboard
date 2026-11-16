import type { Extension } from '@openshift/dynamic-plugin-sdk';
import type { FxField, FxRoute, FxValue } from './points';
import { sharedExtensions } from './shared';

const unsupported = (): Extension<'fx.route', { path: string }> => ({
  type: 'fx.route',
  properties: { path: '/unsupported' },
});
const unknownPoint: Extension<'fx.nowhere', Record<string, unknown>> = {
  type: 'fx.nowhere',
  properties: {},
};

const extensions = [
  ...sharedExtensions,
  ...['/one', '/two', '/three'].map(
    (path) =>
      ({
        type: 'fx.route',
        properties: { path },
      } satisfies FxRoute),
  ),
  {
    type: 'fx.field',
    properties: { field: () => import('./m.js').then((m) => m.WizardField) },
  } satisfies FxField,
  {
    type: 'fx.value',
    properties: {
      values: {
        unsupportedRef: () => import('./m.js').then((m) => (d: { id: string }) => m.f(d)),
      },
    },
  } satisfies FxValue,
  unsupported(),
  unknownPoint,
] satisfies Extension[];

export default extensions;
