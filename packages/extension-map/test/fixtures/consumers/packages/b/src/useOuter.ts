import type { AGuard, FxA } from '../../a/src/points';
import { useMine } from '../../a/src/useMine';

/** A wrapper of a wrapper, in another package. */
export const useOuter = (pred: AGuard): FxA[] => useMine(pred);
