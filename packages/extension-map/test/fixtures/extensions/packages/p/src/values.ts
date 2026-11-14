import type { D } from './m';

export enum Area {
  K_SERVE = 'kserve',
}

export const KS_ID = 'kserve';

const compute = (): string => 'computed';

export const satisfiesObj = { a: 1 } satisfies Record<string, number>;

export const asConstStr = 'x' as const;

export const areaFlag = Area.K_SERVE;

export const platformId = KS_ID;

export const ref1 = () => import('./m');

export const ref2 = () => import('./m').then((m) => m.useThing);

export const ref3 = () => import('./m').then((m) => ({ default: m.Modal }));

export const ref4 = () => import('./m').then((m) => (d: D) => m.f(d));

export const refMissing = () => import('./nowhere');

export const computed = compute();

export const inlineFn = () => 1;

export const fnRef = compute;

const base = { label: 'Base', count: 1 };

export const spreadObj = { ...base, count: 2 };

export const spreadBad = { ...compute(), count: 2 };
