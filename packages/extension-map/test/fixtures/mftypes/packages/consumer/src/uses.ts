import {
  isGoneP,
  isRemP,
  isStaleP,
  type DriftP,
  type RemData,
  type RemP,
  type ShapeP,
  type UnvP,
} from '@mf/rem/extension-points';
import { isRemP as directIsRemP } from '../../rem/frontend/src/odh/extension-points/p';
import type { DriftP as DirectDriftP } from '../../rem/frontend/src/odh/extension-points/id-drift';
import type { ShapeP as DirectShapeP } from '../../rem/frontend/src/odh/extension-points/shape-drift';

/** Consumer of the rem remote's declarations through the committed copies. */
export const remGuard = isRemP;
export const staleGuard = isStaleP;
export const goneGuard = isGoneP;
export type RemDataAlias = RemData;
export type RemPAlias = RemP;
export type DriftPAlias = DriftP;
export type UnvPAlias = UnvP;
export type ShapePAlias = ShapeP;

/** Monorepo-internal consumer of the same declarations from source. */
export const directRemGuard = directIsRemP;
export type DirectDriftPAlias = DirectDriftP;
export type DirectShapePAlias = DirectShapeP;
