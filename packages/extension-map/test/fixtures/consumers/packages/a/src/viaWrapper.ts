import { isA } from './points';
import type { FxA } from './points';
import { useMine } from './useMine';

export const useViaWrapper = (): FxA[] => useMine(isA);
