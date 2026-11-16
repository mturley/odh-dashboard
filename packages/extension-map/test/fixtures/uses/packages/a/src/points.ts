import type React from 'react';
import type { CodeRef, Extension } from '@openshift/dynamic-plugin-sdk';

/** The first fixture point: something rendered lazily. */
export type FxA = Extension<
  'fx.a',
  { label: string; component: CodeRef<React.ComponentType>; items: string[] }
>;

/** The second fixture point: resolved values of every kind. */
export type FxB = Extension<
  'fx.b',
  {
    label: string;
    icon: CodeRef<React.ComponentType>;
    useValue: CodeRef<() => string>;
    run: CodeRef<() => void>;
  }
>;

export const isA = (e: Extension): e is FxA => e.type === 'fx.a';

export const isB = (e: Extension): e is FxB => e.type === 'fx.b';
