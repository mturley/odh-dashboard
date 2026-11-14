import type { Extension } from '@openshift/dynamic-plugin-sdk';
import { ROUTE_BASE } from './consts';
import type { FxFieldExtension, FxRouteExtension } from './points';
import shared from './shared';

const makeExt = (): Extension => ({ type: 'fx.extra', properties: {} });

const fieldExtension: FxFieldExtension = {
  type: 'fx.field',
  properties: {
    field: () => import('./field').then((m) => m.myField),
  },
};

const extensions = [
  ...shared,
  ...(
    [`${ROUTE_BASE}/a`, `${ROUTE_BASE}/b`, `${ROUTE_BASE}/c`] as const
  ).map((path): FxRouteExtension => ({
    type: 'app.route',
    properties: { path, component: () => import('./m') },
  })),
  makeExt(),
  { type: 'fx.nowhere', properties: {} },
  fieldExtension,
] satisfies Extension[];

export default extensions;
