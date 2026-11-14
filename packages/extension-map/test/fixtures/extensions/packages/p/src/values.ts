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

export function helper(): number {
  return 1;
}

export const helperRef = helper;

let reassignedLiteral = 'first';
reassignedLiteral = 'second';
export const letLiteral = reassignedLiteral;

let reassignedArray = [Area.K_SERVE];
reassignedArray = [];
export const letArray = reassignedArray;

let reassignedObject = { label: 'first' };
reassignedObject = { label: 'second' };
export const letObject = reassignedObject;

const pushedArray = ['a'];
pushedArray.push('b');
export const mutatedArray = pushedArray;

const patchedObject = { label: 'a' };
patchedObject.label = 'b';
export const mutatedObject = patchedObject;

const frozenArray = ['a', 'b'] as const;
frozenArray.push('c');
export const asConstArray = frozenArray;

const plainArray = ['a'];
export const plainArrayRef = plainArray;

const plainObject = { label: 'a' };
export const plainObjectRef = plainObject;
