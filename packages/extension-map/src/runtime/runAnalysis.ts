/**
 * Parent-side orchestration for memory-aware, process-isolated analysis
 * (memory-fix brief).
 *
 * Analysis runs in a child process (`worker.ts`, spawned via `process.execPath`
 * and the repo tsx loader) with an explicit `--max-old-space-size`, so a fatal
 * V8 out-of-memory in the analysis cannot kill the CLI and cannot be affected
 * by inherited heap flags. The child transports only a successful plain model
 * over IPC (stdout is never used as a machine protocol); the parent retains
 * only a bounded slice of the child's stderr. A cached child that fails for a
 * memory-related reason is retried exactly once, uncached, in a fresh child
 * with a re-checked budget; every other failure surfaces as an error and
 * produces no model. This bounds memory risk; it is not a guarantee — a JS
 * guard cannot intercept every allocation or an OS-level kill.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { decideBudget } from './memory';
import type { AnalyzeOptions } from '../analyze';
import type { ExtensionMapModel, WorkspacePackage } from '../model/types';

/** The request the parent sends to the analysis child over IPC. */
export type WorkerRequest = {
  repoRoot: string;
  workspace?: WorkspacePackage[];
  sourceCache: boolean;
};

/** The only things the child ever sends back. */
export type WorkerResponse = { ok: true; model: ExtensionMapModel } | { ok: false; error: string };

/** A child's terminal outcome; `model` only ever carries a successful analysis. */
export type ChildExit =
  | { kind: 'model'; model: ExtensionMapModel }
  | { kind: 'child-error'; message: string }
  | { kind: 'exit'; code: number | null; signal: NodeJS.Signals | null; stderr: string }
  | { kind: 'invalid-response' }
  | { kind: 'spawn-error'; message: string };

export type ChildSpec = {
  workerPath: string;
  /** Whole-MiB heap cap the child must run with. */
  heapMiB: number;
  request: WorkerRequest;
};

export type LaunchedChild = {
  pid: number | undefined;
  /** Forwards a termination signal to the child. */
  kill: (signal: NodeJS.Signals) => void;
  /** Resolves with the child's terminal outcome (bounded stderr retained). */
  settled: Promise<ChildExit>;
};

export type LaunchChild = (spec: ChildSpec) => LaunchedChild;

export type RunAnalysisOptions = AnalyzeOptions & {
  /** Test seam replacing `process.availableMemory()`. */
  availableMemory?: () => number | undefined;
  /** Test seam replacing the child launcher. */
  launchChild?: LaunchChild;
  /** Receives concise mode/fallback lines (default: stderr). */
  report?: (line: string) => void;
  /** Test seam replacing the bundled worker script. */
  workerPath?: string;
};

/** Surfaced when the analysis child failed and no retry applies. */
export class AnalysisChildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisChildError';
  }
}

const HEAP_FLAG_PREFIXES = ['--max-old-space-size', '--max-semi-space-size'];

const isHeapFlag = (arg: string): boolean =>
  HEAP_FLAG_PREFIXES.some((prefix) => arg.startsWith(prefix));

/**
 * Builds the child's node argv: inherited execArgv minus heap flags (so the
 * parent's `--max-old-space-size` cannot override the chosen cap), the repo
 * tsx loader when the parent carries no loader flags, the chosen cap, and the
 * worker script last.
 */
export const buildChildArgs = (
  workerPath: string,
  heapMiB: number,
  execArgv: readonly string[],
): string[] => {
  const args: string[] = [];
  let hasLoader = false;
  for (let i = 0; i < execArgv.length; i++) {
    const arg = execArgv[i];
    if (isHeapFlag(arg)) {
      if (!arg.includes('=')) {
        i++; // space-separated value belongs to the dropped flag
      }
      continue;
    }
    args.push(arg);
    if (arg === '--import' || arg === '--require') {
      hasLoader = true;
      const valueIndex = i + 1;
      if (valueIndex < execArgv.length) {
        args.push(execArgv[valueIndex]);
        i = valueIndex;
      }
    }
  }
  if (!hasLoader) {
    // The repo's own tsx loader, resolved from this module's context.
    args.push('--import', require.resolve('tsx'));
  }
  args.push(`--max-old-space-size=${heapMiB}`, workerPath);
  return args;
};

/** Removes heap flags from an inherited `NODE_OPTIONS` value. */
export const sanitizeNodeOptions = (value: string | undefined): string | undefined => {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  const tokens = value.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (isHeapFlag(token)) {
      if (!token.includes('=')) {
        i++;
      }
      continue;
    }
    kept.push(token);
  }
  return kept.length > 0 ? kept.join(' ') : undefined;
};

const childEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const sanitized = sanitizeNodeOptions(process.env.NODE_OPTIONS);
  if (sanitized === undefined) {
    delete env.NODE_OPTIONS;
  } else {
    env.NODE_OPTIONS = sanitized;
  }
  return env;
};

const isModel = (value: unknown): value is ExtensionMapModel => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    !('diagnostics' in value)
  ) {
    return false;
  }
  return value.version === 1 && Array.isArray(value.diagnostics);
};

const isWorkerResponse = (message: unknown): message is WorkerResponse => {
  if (typeof message !== 'object' || message === null || !('ok' in message)) {
    return false;
  }
  if (message.ok === true) {
    return 'model' in message && isModel(message.model);
  }
  return message.ok === false && 'error' in message && typeof message.error === 'string';
};

/** At most this much child stderr is retained, so fatal logs cannot grow the parent. */
const MAX_RETAINED_STDERR_BYTES = 64 * 1024;

const closeOutcome = (
  code: number | null,
  signal: NodeJS.Signals | null,
  message: unknown,
  stderr: string,
  truncated: boolean,
): ChildExit => {
  const text = truncated ? `${stderr}\n[... child stderr truncated]` : stderr;
  if (isWorkerResponse(message)) {
    if (message.ok && code === 0) {
      return { kind: 'model', model: message.model };
    }
    if (!message.ok) {
      return { kind: 'child-error', message: message.error };
    }
    return { kind: 'invalid-response' };
  }
  if (message !== undefined || code === 0) {
    return { kind: 'invalid-response' };
  }
  return { kind: 'exit', code, signal, stderr: text };
};

const defaultLaunchChild: LaunchChild = (spec) => {
  const child = spawn(
    process.execPath,
    buildChildArgs(spec.workerPath, spec.heapMiB, process.execArgv),
    {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      env: childEnv(),
    },
  );
  let stderr = '';
  let truncated = false;
  child.stderr?.on('data', (chunk: Buffer) => {
    if (truncated) {
      return;
    }
    stderr += chunk.toString('utf8');
    if (stderr.length > MAX_RETAINED_STDERR_BYTES) {
      stderr = stderr.slice(0, MAX_RETAINED_STDERR_BYTES);
      truncated = true;
    }
  });
  let message: unknown;
  child.on('message', (received: unknown) => {
    message = received;
  });
  const settled = new Promise<ChildExit>((resolve) => {
    let settledOnce = false;
    const finish = (outcome: () => ChildExit): void => {
      if (settledOnce) {
        return;
      }
      settledOnce = true;
      resolve(outcome());
    };
    child.on('error', (error: Error) =>
      finish((): ChildExit => ({ kind: 'spawn-error', message: error.message })),
    );
    child.on('close', (code, signal) =>
      finish((): ChildExit => closeOutcome(code, signal, message, stderr, truncated)),
    );
  });
  if (child.connected) {
    child.send(spec.request);
  }
  return {
    pid: child.pid ?? undefined,
    kill: (signal: NodeJS.Signals): void => {
      child.kill(signal);
    },
    settled,
  };
};

type FailureClass = 'heap-oom' | 'possibly-memory' | 'cancellation' | 'definite';

/** Explicit V8 fatal markers; anything else is not a proven heap OOM. */
const OOM_MARKERS = ['JavaScript heap out of memory', 'Reached heap limit'];

const classifyFailure = (exit: ChildExit): FailureClass => {
  if (exit.kind !== 'exit') {
    return 'definite';
  }
  if (exit.signal === 'SIGKILL') {
    // Could be an OS OOM-kill; never claimed as a proven V8 heap OOM.
    return 'possibly-memory';
  }
  if (exit.signal === 'SIGINT' || exit.signal === 'SIGTERM') {
    return 'cancellation';
  }
  if (exit.code !== null && exit.code !== 0 && OOM_MARKERS.some((m) => exit.stderr.includes(m))) {
    return 'heap-oom';
  }
  return 'definite';
};

const failureReason = (exit: ChildExit): string => {
  const failure = classifyFailure(exit);
  if (failure === 'heap-oom') {
    return 'V8 heap out of memory';
  }
  if (failure === 'possibly-memory') {
    const signal = exit.kind === 'exit' && exit.signal !== null ? exit.signal : 'a signal';
    return `child terminated by ${signal} - possibly out of memory, not proven`;
  }
  return 'failed';
};

const describeExit = (exit: ChildExit): string => {
  switch (exit.kind) {
    case 'child-error':
      return `analysis failed in the child: ${exit.message}`;
    case 'invalid-response':
      return 'the analysis child exited without a valid response';
    case 'spawn-error':
      return `could not start the analysis child: ${exit.message}`;
    case 'exit': {
      const termination =
        exit.signal !== null
          ? `was terminated by ${exit.signal}`
          : `exited with code ${exit.code ?? 'unknown'}`;
      const failure = classifyFailure(exit);
      const qualifier =
        failure === 'heap-oom'
          ? ' (V8 heap out of memory)'
          : failure === 'possibly-memory'
          ? ' (possibly out of memory; not proven)'
          : '';
      return `the analysis child ${termination}${qualifier}\n${exit.stderr}`;
    }
    default:
      return 'the analysis child failed';
  }
};

/**
 * Runs the analysis in an isolated child and resolves with the successful
 * plain model only. Mode selection, the bounded cached-to-uncached retry and
 * failure reporting follow the memory-fix brief; see `src/runtime/worker.ts`
 * for the child side.
 */
export const runAnalysis = async (opts: RunAnalysisOptions): Promise<ExtensionMapModel> => {
  const availableMemory = opts.availableMemory ?? ((): number => process.availableMemory());
  const launchChild = opts.launchChild ?? defaultLaunchChild;
  const workerPath = opts.workerPath ?? path.join(__dirname, 'worker.ts');
  const report =
    opts.report ??
    ((line: string): void => {
      console.error(line);
    });

  const runChild = async (request: WorkerRequest, heapMiB: number): Promise<ChildExit> => {
    const child = launchChild({ workerPath, heapMiB, request });
    const forward = (signal: NodeJS.Signals): void => {
      child.kill(signal);
    };
    process.on('SIGINT', forward);
    process.on('SIGTERM', forward);
    try {
      return await child.settled;
    } finally {
      process.off('SIGINT', forward);
      process.off('SIGTERM', forward);
    }
  };

  const budget = decideBudget(availableMemory(), opts.sourceCache);
  report(`extension-map: ${budget.description}`);
  let exit = await runChild(
    { repoRoot: opts.repoRoot, workspace: opts.workspace, sourceCache: budget.mode === 'cached' },
    budget.heapMiB,
  );
  if (exit.kind === 'model') {
    return exit.model;
  }

  const failure = classifyFailure(exit);
  if (budget.mode === 'cached' && (failure === 'heap-oom' || failure === 'possibly-memory')) {
    report(
      `extension-map: cached analysis failed (${failureReason(
        exit,
      )}); retrying uncached in a fresh child`,
    );
    const retryBudget = decideBudget(availableMemory(), false);
    exit = await runChild(
      { repoRoot: opts.repoRoot, workspace: opts.workspace, sourceCache: false },
      retryBudget.heapMiB,
    );
    if (exit.kind === 'model') {
      return exit.model;
    }
  }
  throw new AnalysisChildError(describeExit(exit));
};
