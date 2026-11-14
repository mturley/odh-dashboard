import type { Extension } from '@openshift/dynamic-plugin-sdk';
import { DISALLOWED_FLAGS, NAMES, ROUTE_BASE } from './consts';
import type { FxFieldExtension, FxRouteExtension } from './points';
import shared from './shared';
import { Area } from './values';

const makeExt = (): Extension => ({ type: 'fx.extra', properties: {} });

const fieldExtension: FxFieldExtension = {
  type: 'fx.field',
  properties: {
    field: () => import('./field').then((m) => m.myField),
  },
};

const baseExtension = {
  type: 'fx.spread',
  properties: { id: 'base', label: 'Base' },
  flags: { required: [Area.K_SERVE] },
};

const spreadExtension = {
  ...baseExtension,
  properties: { ...baseExtension.properties, label: 'Override' },
};

let looseExtensions = [{ type: 'fx.loose', properties: { id: 'loose' } }];
looseExtensions = [];

const extensions = [
  ...shared,
  ...looseExtensions,
  ...([`${ROUTE_BASE}/a`, `${ROUTE_BASE}/b`, `${ROUTE_BASE}/c`] as const).map(
    (path): FxRouteExtension => ({
      type: 'app.route',
      properties: { path, component: () => import('./m') },
    }),
  ),
  ...NAMES.map((name) => ({
    type: 'fx.generated',
    properties: { name },
  })),
  {
    type: 'fx.flagged',
    properties: { id: 'flagged' },
    flags: { required: [Area.K_SERVE], disallowed: DISALLOWED_FLAGS },
  },
  spreadExtension,
  { ...makeExt(), properties: {} },
  makeExt(),
  { type: 'fx.nowhere', properties: {} },
  fieldExtension,
] satisfies Extension[];

export default extensions;
