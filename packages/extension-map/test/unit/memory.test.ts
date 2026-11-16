import {
  CACHED_HEAP_MIB,
  CACHED_MODE_THRESHOLD_BYTES,
  InsufficientMemoryError,
  UNCACHED_MAX_HEAP_MIB,
  UNKNOWN_AVAILABILITY_HEAP_MIB,
  cacheModeFor,
  decideBudget,
} from '../../src/runtime/memory';

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

describe('cacheModeFor', () => {
  it('is always uncached when availability is unknown, even for an explicit request', () => {
    for (const preference of [undefined, true]) {
      expect(cacheModeFor(undefined, preference)).toBe('uncached');
      expect(cacheModeFor(0, preference)).toBe('uncached');
    }
  });

  it('is cached only at or above the threshold and never for an explicit false', () => {
    expect(cacheModeFor(CACHED_MODE_THRESHOLD_BYTES, undefined)).toBe('cached');
    expect(cacheModeFor(CACHED_MODE_THRESHOLD_BYTES, true)).toBe('cached');
    expect(cacheModeFor(CACHED_MODE_THRESHOLD_BYTES - 1, true)).toBe('uncached');
    expect(cacheModeFor(16 * GIB, false)).toBe('uncached');
  });
});

describe('decideBudget', () => {
  it('selects cached analysis at or above the 8 GiB threshold with the 6144 MiB heap cap', () => {
    for (const available of [CACHED_MODE_THRESHOLD_BYTES, 16 * GIB]) {
      const budget = decideBudget(available, undefined);
      expect(budget.mode).toBe('cached');
      expect(budget.heapMiB).toBe(CACHED_HEAP_MIB);
      expect(budget.availableBytes).toBe(available);
      expect(budget.unknownAvailability).toBe(false);
    }
  });

  it('selects uncached one byte below the threshold with the 4096 MiB cap', () => {
    const budget = decideBudget(CACHED_MODE_THRESHOLD_BYTES - 1, undefined);
    expect(budget.mode).toBe('uncached');
    // 8192 MiB available minus 1024 MiB headroom, clamped to the 4096 MiB cap.
    expect(budget.heapMiB).toBe(UNCACHED_MAX_HEAP_MIB);
  });

  it('treats an explicit true cache preference as subject to the safe budget', () => {
    expect(decideBudget(16 * GIB, true).mode).toBe('cached');
    expect(decideBudget(4 * GIB, true).mode).toBe('uncached');
    // 4096 MiB available minus 1024 MiB headroom.
    expect(decideBudget(4 * GIB, true).heapMiB).toBe(3072);
  });

  it('always disables the cache for an explicit false, even with ample memory', () => {
    const budget = decideBudget(16 * GIB, false);
    expect(budget.mode).toBe('uncached');
    expect(budget.heapMiB).toBe(UNCACHED_MAX_HEAP_MIB);
  });

  it('uses the conservative 2048 MiB uncached cap when availability is unknown', () => {
    for (const available of [undefined, 0]) {
      const budget = decideBudget(available, undefined);
      expect(budget.mode).toBe('uncached');
      expect(budget.heapMiB).toBe(UNKNOWN_AVAILABILITY_HEAP_MIB);
      expect(budget.unknownAvailability).toBe(true);
      expect(budget.availableBytes).toBeUndefined();
    }
  });

  it('leaves at least 1024 MiB of the known budget and rounds down to whole MiB', () => {
    // 3 GiB + 0.5 MiB floors to 3072 MiB; minus 1024 MiB headroom is 2048 MiB.
    expect(decideBudget(3 * GIB + MIB / 2, undefined).heapMiB).toBe(2048);
    // Exactly 2048 MiB available still allows the minimum 1024 MiB child heap.
    expect(decideBudget(2048 * MIB, undefined).heapMiB).toBe(1024);
  });

  it('fails before spawn with an actionable error when less than 1024 MiB of child heap is possible', () => {
    const available = 1536 * MIB;
    expect(() => decideBudget(available, undefined)).toThrow(InsufficientMemoryError);
    expect(() => decideBudget(available, false)).toThrow(InsufficientMemoryError);
    // One byte below the 2048 MiB boundary (1024 heap + 1024 headroom) fails too.
    expect(() => decideBudget(2048 * MIB - 1, undefined)).toThrow(InsufficientMemoryError);
    try {
      decideBudget(available, undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain('1536 MiB');
      expect(message).toContain('2048 MiB');
    }
  });

  it('describes the selected mode for stderr reporting', () => {
    expect(decideBudget(16 * GIB, undefined).description).toContain('cached analysis');
    expect(decideBudget(3 * GIB, undefined).description).toContain('uncached analysis');
    expect(decideBudget(undefined, undefined).description).toContain('unknown');
  });
});
