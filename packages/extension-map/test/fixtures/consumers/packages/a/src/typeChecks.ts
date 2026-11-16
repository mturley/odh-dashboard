import type { Extension } from '@openshift/dynamic-plugin-sdk';
import { FX_A_TYPE, FxKind } from './points';

export const isConstA = (e: Extension): boolean => e.type === FX_A_TYPE;

export const isEnumB = (e: Extension): boolean => FxKind.B !== e.type;

export const describeExtension = (e: Extension): string => {
  switch (e.type) {
    case 'fx.b':
      return 'b';
    default:
      return 'other';
  }
};

type Shape = { type: string; size: number };

/** Not extension-shaped: the comparison is no use, and its literal is still reported. */
export const isShapeA = (s: Shape): boolean => s.type === 'fx.a';
