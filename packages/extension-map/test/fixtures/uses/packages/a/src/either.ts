import type { FxA, FxB } from './points';

/** A helper typed with a union of two points. */
export const either = (e: FxA | FxB): string => e.properties.label;
