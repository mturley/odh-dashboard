import { useOuter } from './useOuter';
import { isA } from '../../a/src/points';
import type { FxA } from '../../a/src/points';

export const useViaOuter = (): FxA[] => useOuter(isA);
