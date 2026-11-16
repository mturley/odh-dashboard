/**
 * Pure memory-budget policy for the analysis runner (memory-fix brief).
 *
 * `process.availableMemory()` estimates what the OS will let this process
 * allocate. It is not a V8 heap limit and not a reservation: it shrinks as the
 * run proceeds and other processes can consume it mid-run. The V8 heap cap for
 * the analysis child is therefore kept distinct from system availability and
 * is chosen here, up front, per mode.
 */

const MIB = 1024 ** 2;

/** Cached analysis is selected at or above this much process-available memory. */
export const CACHED_MODE_THRESHOLD_BYTES = 8 * 1024 ** 3;

/** Fixed child heap cap for cached analysis (spec §5.3 starting point). */
export const CACHED_HEAP_MIB = 6144;

/** Upper bound for the uncached child heap cap. */
export const UNCACHED_MAX_HEAP_MIB = 4096;

/** Smallest child heap the uncached mode will attempt. */
export const UNCACHED_MIN_CHILD_HEAP_MIB = 1024;

/** Headroom left outside the child heap when availability is known. */
export const UNCACHED_HEADROOM_MIB = 1024;

/** Conservative uncached cap when availability cannot be determined. */
export const UNKNOWN_AVAILABILITY_HEAP_MIB = 2048;

export type BudgetMode = 'cached' | 'uncached';

export type MemoryBudget = {
  mode: BudgetMode;
  /** Whole-MiB `--max-old-space-size` for the analysis child. */
  heapMiB: number;
  /** Process-available bytes the decision was based on; undefined when unknown. */
  availableBytes: number | undefined;
  unknownAvailability: boolean;
  /** Concise mode description for stderr reporting. */
  description: string;
};

/** Thrown before any child is spawned when even the minimum heap is impossible. */
export class InsufficientMemoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientMemoryError';
  }
}

const formatGiB = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(1)} GiB`;

const isKnown = (availableBytes: number | undefined): availableBytes is number =>
  typeof availableBytes === 'number' && Number.isFinite(availableBytes) && availableBytes > 0;

/**
 * Fails before spawn when the known availability cannot fund the minimum
 * uncached child heap plus headroom.
 */
const uncachedHeapMiB = (availableBytes: number): number => {
  const budgetMiB = Math.floor(availableBytes / MIB) - UNCACHED_HEADROOM_MIB;
  const heapMiB = Math.min(UNCACHED_MAX_HEAP_MIB, budgetMiB);
  if (heapMiB < UNCACHED_MIN_CHILD_HEAP_MIB) {
    throw new InsufficientMemoryError(
      `Insufficient memory for extension-map analysis: ${Math.floor(
        availableBytes / MIB,
      )} MiB available, but the uncached analysis child needs at least ${UNCACHED_MIN_CHILD_HEAP_MIB} MiB of heap plus ${UNCACHED_HEADROOM_MIB} MiB of headroom (${
        UNCACHED_MIN_CHILD_HEAP_MIB + UNCACHED_HEADROOM_MIB
      } MiB total). Free memory or rerun on a machine with more RAM.`,
    );
  }
  return heapMiB;
};

const describeBudget = (
  mode: BudgetMode,
  heapMiB: number,
  availableBytes: number | undefined,
): string => {
  const availability = isKnown(availableBytes)
    ? `${formatGiB(availableBytes)} available`
    : 'available memory unknown';
  const cache = mode === 'cached' ? 'source cache on' : 'source cache off';
  return `${availability} - ${mode} analysis (${cache}, heap cap ${heapMiB} MiB)`;
};

/**
 * The cache mode shared by the isolated runner and the in-process analyzer:
 * cached only with known availability at or above the threshold and no
 * explicit `false`. Unknown (zero, non-finite or missing) availability is
 * always the conservative uncached mode, even for an explicit cache request
 * (memory-fix brief).
 */
export const cacheModeFor = (
  availableBytes: number | undefined,
  cachePreference: boolean | undefined,
): BudgetMode =>
  isKnown(availableBytes) &&
  cachePreference !== false &&
  availableBytes >= CACHED_MODE_THRESHOLD_BYTES
    ? 'cached'
    : 'uncached';

/**
 * Selects the analysis mode and the child heap cap.
 *
 * `cachePreference === false` always disables the cache. `true` is a
 * preference subject to the safe budget. `undefined` (the CLI default)
 * auto-selects. Availability that is zero, non-finite, or not a number is
 * treated as unknown and always selects conservative uncached mode.
 */
export const decideBudget = (
  availableBytes: number | undefined,
  cachePreference: boolean | undefined,
): MemoryBudget => {
  if (cacheModeFor(availableBytes, cachePreference) === 'cached') {
    return {
      mode: 'cached',
      heapMiB: CACHED_HEAP_MIB,
      availableBytes,
      unknownAvailability: false,
      description: describeBudget('cached', CACHED_HEAP_MIB, availableBytes),
    };
  }
  if (!isKnown(availableBytes)) {
    return {
      mode: 'uncached',
      heapMiB: UNKNOWN_AVAILABILITY_HEAP_MIB,
      availableBytes: undefined,
      unknownAvailability: true,
      description: describeBudget('uncached', UNKNOWN_AVAILABILITY_HEAP_MIB, undefined),
    };
  }
  const heapMiB = uncachedHeapMiB(availableBytes);
  return {
    mode: 'uncached',
    heapMiB,
    availableBytes,
    unknownAvailability: false,
    description: describeBudget('uncached', heapMiB, availableBytes),
  };
};
