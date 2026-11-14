import fs from 'node:fs';
import path from 'node:path';
import { fixtureDir } from '../helpers/fixture';
import { emptyModel } from '../../src/model/sort';
import type { WorkspacePackage } from '../../src/model/types';
import { InsufficientMemoryError } from '../../src/runtime/memory';
import {
  AnalysisChildError,
  buildChildArgs,
  runAnalysis,
  sanitizeNodeOptions,
} from '../../src/runtime/runAnalysis';
import type {
  ChildExit,
  ChildSpec,
  LaunchChild,
  RunAnalysisOptions,
} from '../../src/runtime/runAnalysis';

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

const OOM_STDERR =
  '<--- Last few GCs --->\n' +
  'FATAL ERROR: Reached heap limit -- JavaScript heap out of memory\n' +
  ' 1: 0x... node::Abort()';

/** A failed child exit with the given stderr and exit code 1. */
const exit = (stderr = ''): ChildExit => ({ kind: 'exit', code: 1, signal: null, stderr });

/** A launch seam that plays back the given outcomes, recording every spec. */
const scriptedLauncher = (
  ...outcomes: ChildExit[]
): { launch: LaunchChild; specs: ChildSpec[] } => {
  const specs: ChildSpec[] = [];
  const queue = [...outcomes];
  const launch: LaunchChild = (spec) => {
    specs.push(spec);
    const outcome = queue.shift() ?? { kind: 'invalid-response' };
    return {
      pid: 4200 + specs.length,
      kill: (): void => undefined,
      settled: Promise.resolve(outcome),
    };
  };
  return { launch, specs };
};

const baseOpts = (launch: LaunchChild): RunAnalysisOptions => ({
  repoRoot: '/repo',
  launchChild: launch,
  availableMemory: (): number => 16 * GIB,
  report: (): void => undefined,
});

describe('runAnalysis orchestration', () => {
  it('resolves the model from a successful cached child and reports the mode', async () => {
    const { launch, specs } = scriptedLauncher({ kind: 'model', model: emptyModel() });
    const reports: string[] = [];
    const model = await runAnalysis({
      ...baseOpts(launch),
      report: (line): void => {
        reports.push(line);
      },
    });
    expect(model).toEqual(emptyModel());
    expect(specs).toHaveLength(1);
    expect(specs[0].heapMiB).toBe(6144);
    expect(specs[0].request).toEqual({ repoRoot: '/repo', sourceCache: true });
    expect(reports.join('\n')).toContain('cached analysis');
  });

  it('selects uncached below the 8 GiB threshold', async () => {
    const { launch, specs } = scriptedLauncher({ kind: 'model', model: emptyModel() });
    await runAnalysis({ ...baseOpts(launch), availableMemory: (): number => 6 * GIB });
    expect(specs[0].request.sourceCache).toBe(false);
    // 6144 MiB available minus 1024 MiB headroom, clamped to 4096 MiB.
    expect(specs[0].heapMiB).toBe(4096);
  });

  it('uses the conservative 2048 MiB cap when availability is unknown', async () => {
    const { launch, specs } = scriptedLauncher({ kind: 'model', model: emptyModel() });
    await runAnalysis({
      ...baseOpts(launch),
      availableMemory: (): number | undefined => undefined,
    });
    expect(specs[0].request.sourceCache).toBe(false);
    expect(specs[0].heapMiB).toBe(2048);
  });

  it('keeps an explicit sourceCache:false uncached even with ample memory', async () => {
    const { launch, specs } = scriptedLauncher({ kind: 'model', model: emptyModel() });
    await runAnalysis({ ...baseOpts(launch), sourceCache: false });
    expect(specs[0].request.sourceCache).toBe(false);
    expect(specs[0].heapMiB).toBe(4096);
  });

  it('retries a cached heap OOM exactly once as uncached in a fresh child', async () => {
    const { launch, specs } = scriptedLauncher(exit(OOM_STDERR), {
      kind: 'model',
      model: emptyModel(),
    });
    const reports: string[] = [];
    const readings = [16 * GIB, 4 * GIB];
    const model = await runAnalysis({
      ...baseOpts(launch),
      availableMemory: (): number => readings.shift() ?? 0,
      report: (line): void => {
        reports.push(line);
      },
    });
    expect(model).toEqual(emptyModel());
    expect(specs).toHaveLength(2);
    expect(specs[0].request.sourceCache).toBe(true);
    expect(specs[1].request.sourceCache).toBe(false);
    // The retry rechecks availability: 4 GiB minus 1024 MiB headroom.
    expect(specs[1].heapMiB).toBe(3072);
    expect(reports.join('\n')).toContain('retrying uncached');
  });

  it('retries a SIGKILL-terminated cached child, reported as possibly out of memory', async () => {
    const { launch } = scriptedLauncher(
      { kind: 'exit', code: null, signal: 'SIGKILL', stderr: '' },
      { kind: 'model', model: emptyModel() },
    );
    const reports: string[] = [];
    await runAnalysis({
      ...baseOpts(launch),
      report: (line): void => {
        reports.push(line);
      },
    });
    const retryLine = reports.find((line) => line.includes('retrying')) ?? '';
    expect(retryLine).toContain('SIGKILL');
    expect(retryLine).toContain('possibly out of memory');
    // Must not claim a proven V8 heap OOM.
    expect(retryLine).not.toContain('heap out of memory');
  });

  it('does not retry an arbitrary child error and surfaces its output', async () => {
    const { launch, specs } = scriptedLauncher(
      exit('TypeError: cannot read properties of undefined'),
    );
    const promise = runAnalysis(baseOpts(launch));
    await expect(promise).rejects.toThrow(AnalysisChildError);
    await expect(promise).rejects.toThrow('TypeError: cannot read properties of undefined');
    expect(specs).toHaveLength(1);
  });

  it('does not retry explicit cancellation signals', async () => {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      const { launch, specs } = scriptedLauncher({
        kind: 'exit',
        code: null,
        signal,
        stderr: '',
      });
      await expect(runAnalysis(baseOpts(launch))).rejects.toThrow(signal);
      expect(specs).toHaveLength(1);
    }
  });

  it('does not retry spawn failures', async () => {
    const { launch, specs } = scriptedLauncher({ kind: 'spawn-error', message: 'spawn ENOENT' });
    await expect(runAnalysis(baseOpts(launch))).rejects.toThrow('spawn ENOENT');
    expect(specs).toHaveLength(1);
  });

  it('does not retry invalid child responses', async () => {
    const { launch, specs } = scriptedLauncher({ kind: 'invalid-response' });
    await expect(runAnalysis(baseOpts(launch))).rejects.toThrow(AnalysisChildError);
    expect(specs).toHaveLength(1);
  });

  it('does not retry a child-reported analysis error', async () => {
    const { launch, specs } = scriptedLauncher({
      kind: 'child-error',
      message: 'collector blew up',
    });
    await expect(runAnalysis(baseOpts(launch))).rejects.toThrow('collector blew up');
    expect(specs).toHaveLength(1);
  });

  it('does not retry an uncached heap OOM', async () => {
    const { launch, specs } = scriptedLauncher(exit(OOM_STDERR));
    await expect(
      runAnalysis({ ...baseOpts(launch), availableMemory: (): number => 6 * GIB }),
    ).rejects.toThrow(AnalysisChildError);
    expect(specs).toHaveLength(1);
  });

  it('does not retry an OOM when the cache was explicitly disabled', async () => {
    const { launch, specs } = scriptedLauncher(exit(OOM_STDERR));
    await expect(runAnalysis({ ...baseOpts(launch), sourceCache: false })).rejects.toThrow(
      AnalysisChildError,
    );
    expect(specs).toHaveLength(1);
  });

  it('rechecks availability before the retry and fails without a second spawn when memory is now insufficient', async () => {
    const { launch, specs } = scriptedLauncher(exit(OOM_STDERR));
    const readings = [16 * GIB, 1536 * MIB];
    await expect(
      runAnalysis({
        ...baseOpts(launch),
        availableMemory: (): number => readings.shift() ?? 0,
      }),
    ).rejects.toThrow(InsufficientMemoryError);
    expect(specs).toHaveLength(1);
  });

  it('forwards SIGINT to the running child, does not retry, and removes its listeners', async () => {
    let settleRef: ((outcome: ChildExit) => void) | undefined;
    const settled = new Promise<ChildExit>((resolve) => {
      settleRef = resolve;
    });
    const kills: string[] = [];
    const specs: ChildSpec[] = [];
    const launch: LaunchChild = (spec) => {
      specs.push(spec);
      return {
        pid: 99,
        kill: (signal): void => {
          kills.push(signal);
        },
        settled,
      };
    };
    const baseline = process.listenerCount('SIGINT');
    const promise = runAnalysis(baseOpts(launch));
    process.emit('SIGINT', 'SIGINT');
    settleRef?.({ kind: 'exit', code: null, signal: 'SIGINT', stderr: '' });
    await expect(promise).rejects.toThrow('SIGINT');
    expect(kills).toEqual(['SIGINT']);
    expect(specs).toHaveLength(1);
    expect(process.listenerCount('SIGINT')).toBe(baseline);
  });
});

describe('buildChildArgs', () => {
  it('drops inherited heap flags and appends the chosen cap and worker path', () => {
    expect(
      buildChildArgs('/w.ts', 2048, ['--max-old-space-size=6144', '--import', 'file:///l.mjs']),
    ).toEqual(['--import', 'file:///l.mjs', '--max-old-space-size=2048', '/w.ts']);
  });

  it('drops space-separated heap flags together with their values', () => {
    const args = buildChildArgs('/w.ts', 2048, ['--max-old-space-size', '6144', '--expose-gc']);
    expect(args).not.toContain('--max-old-space-size=6144');
    expect(args).not.toContain('6144');
    expect(args).toContain('--expose-gc');
    expect(args).toContain('--max-old-space-size=2048');
    expect(args[args.length - 1]).toBe('/w.ts');
  });

  it('adds the repo tsx loader when the parent has no loader flags', () => {
    const args = buildChildArgs('/w.ts', 2048, []);
    const importIndex = args.indexOf('--import');
    expect(importIndex).toBeGreaterThanOrEqual(0);
    expect(args[importIndex + 1]).toContain('tsx');
    expect(args).toContain('--max-old-space-size=2048');
    expect(args[args.length - 1]).toBe('/w.ts');
  });

  it('reuses the parent loader flags instead of adding a second loader', () => {
    const args = buildChildArgs('/w.ts', 2048, [
      '--require',
      '/p/preflight.cjs',
      '--import',
      'file:///l.mjs',
    ]);
    expect(args).toEqual([
      '--require',
      '/p/preflight.cjs',
      '--import',
      'file:///l.mjs',
      '--max-old-space-size=2048',
      '/w.ts',
    ]);
  });
});

describe('sanitizeNodeOptions', () => {
  it('removes heap flags in both forms and keeps everything else', () => {
    expect(sanitizeNodeOptions('--max-old-space-size=8192 --enable-source-maps')).toBe(
      '--enable-source-maps',
    );
    expect(sanitizeNodeOptions('--max-old-space-size 8192 --enable-source-maps')).toBe(
      '--enable-source-maps',
    );
    expect(sanitizeNodeOptions('--max-semi-space-size=64 --enable-source-maps')).toBe(
      '--enable-source-maps',
    );
  });

  it('returns undefined for undefined, empty, and fully sanitized values', () => {
    expect(sanitizeNodeOptions(undefined)).toBeUndefined();
    expect(sanitizeNodeOptions('')).toBeUndefined();
    expect(sanitizeNodeOptions('--max-old-space-size=8192')).toBeUndefined();
  });
});

describe('runAnalysis with a real analysis child', () => {
  const emptyWorkspace = (): WorkspacePackage[] =>
    JSON.parse(fs.readFileSync(path.join(fixtureDir('empty'), 'workspace.json'), 'utf8'));

  it('transfers a successful model from the real worker over IPC', async () => {
    const reports: string[] = [];
    const model = await runAnalysis({
      repoRoot: fixtureDir('empty'),
      workspace: emptyWorkspace(),
      availableMemory: (): number | undefined => undefined,
      report: (line): void => {
        reports.push(line);
      },
    });
    expect(model).toEqual(emptyModel());
    expect(reports.join('\n')).toContain('uncached analysis');
  }, 120_000);

  it('runs the child with the chosen heap cap, not inherited heap flags', async () => {
    // The stub worker under test/fixtures/runtime/ self-verifies: it fails the
    // run unless the child's execArgv carries the parent-chosen cap, its heap
    // limit matches, and NODE_OPTIONS heap flags were sanitized away.
    const originalExecArgv = process.execArgv;
    const originalNodeOptions = process.env.NODE_OPTIONS;
    process.execArgv = ['--max-old-space-size=6144'];
    process.env.NODE_OPTIONS = '--max-old-space-size=8192 --enable-source-maps';
    try {
      await runAnalysis({
        repoRoot: fixtureDir('empty'),
        workspace: emptyWorkspace(),
        workerPath: path.join(fixtureDir('runtime'), 'worker.ts'),
        availableMemory: (): number => 3 * GIB,
        report: (): void => undefined,
      });
    } finally {
      process.execArgv = originalExecArgv;
      process.env.NODE_OPTIONS = originalNodeOptions;
    }
  }, 120_000);
});
