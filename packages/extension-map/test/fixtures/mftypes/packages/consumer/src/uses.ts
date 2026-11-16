import { isGoneP, isRemP, isStaleP, type RemData, type RemP } from '@mf/rem/extension-points';
import { isRemP as directIsRemP } from '../../rem/frontend/src/odh/extension-points/p';

/** Consumer of the rem remote's declarations through the committed copies. */
export const remGuard = isRemP;
export const staleGuard = isStaleP;
export const goneGuard = isGoneP;
export type RemDataAlias = RemData;
export type RemPAlias = RemP;

/** Monorepo-internal consumer of the same declarations from source. */
export const directRemGuard = directIsRemP;
