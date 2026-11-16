import type { CodeRef } from '@openshift/dynamic-plugin-sdk';
import type { ComponentType } from 'react';

export enum Area {
  K_SERVE = 'kserve',
}

export const satisfiesObj = { label: 'value' } satisfies Record<string, string>;
export const asConstStr = 'x';
export const numeric = 7;
export const bool = true;
export const nullValue = null;
export const nested = ['x', { id: 1 }];
export const object = { label: 'object', count: 2 };
export const template = `route-${'home'}`;
export const areaFlag = Area.K_SERVE;
export const KS_ID = 'kserve' as const;
export const platformId = KS_ID;

export const ref1: CodeRef<unknown> = () => import('./m.js');
export const ref2: CodeRef<() => string> = () => import('./m.js').then((m) => m.useThing);
export const ref3: CodeRef<{ default: ComponentType }> = () =>
  import('./m.js').then((m) => ({ default: m.Modal }));
type D = { id: string };
export const ref4: CodeRef<unknown> = () => import('./m.js').then((m) => (d: D) => m.f(d));
export const fieldRef: CodeRef<unknown> = () => import('./m.js').then((m) => m.WizardField);

const computedValue = (): string => 'not statically read';
export const computed = computedValue();
