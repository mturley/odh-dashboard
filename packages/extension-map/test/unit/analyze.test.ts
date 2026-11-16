import { analysisSourceCache } from '../../src/analyze';
import { analyzeFixture } from '../helpers/fixture';

const GIB = 1024 ** 3;

describe('analysis source-cache selection', () => {
  it('follows the memory policy: unknown availability is uncached even when requested', () => {
    expect(analysisSourceCache(true, (): number | undefined => undefined)).toBe(false);
    expect(analysisSourceCache(undefined, (): number | undefined => undefined)).toBe(false);
    expect(analysisSourceCache(true, (): number => 0)).toBe(false);
  });

  it('selects the shared cache only at or above the threshold', () => {
    expect(analysisSourceCache(undefined, (): number => 8 * GIB)).toBe(true);
    expect(analysisSourceCache(true, (): number => 8 * GIB)).toBe(true);
    expect(analysisSourceCache(true, (): number => 8 * GIB - 1)).toBe(false);
    expect(analysisSourceCache(false, (): number => 16 * GIB)).toBe(false);
  });

  it('runs a fixture analysis through the injected availability seam', () => {
    const m = analyzeFixture('points', {
      sourceCache: true,
      availableMemory: (): number | undefined => undefined,
    });
    expect(m.points.map((p) => p.id)).toContain('fx.a');
  });
});
