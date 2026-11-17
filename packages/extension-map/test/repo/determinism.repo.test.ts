import { spawn } from 'node:child_process';
import path from 'node:path';
import { getRepoModel } from './model';
import { findRepoRoot } from '../../src/repoRoot';
import { renderAll } from '../../src/render/renderAll';
import { buildChildArgs, runAnalysis } from '../../src/runtime/runAnalysis';
import type {
  ChildExit,
  ChildSpec,
  LaunchChild,
  LaunchedChild,
  WorkerResponse,
} from '../../src/runtime/runAnalysis';
import type { ExtensionMapModel } from '../../src/model/types';

const repoRoot = findRepoRoot();
const repoModel = getRepoModel();
const workerPath = path.join(__dirname, 'cacheModeWorker.ts');
let uncachedModel: ExtensionMapModel;
let cachedModel: ExtensionMapModel;

const isWorkerResponse = (message: unknown): message is WorkerResponse =>
  typeof message === 'object' && message !== null && 'ok' in message;

const launcherWithModeEvidence =
  (evidence: string[]): LaunchChild =>
  (spec: ChildSpec) => {
    const child = spawn(
      process.execPath,
      buildChildArgs(spec.workerPath, spec.heapMiB, process.execArgv),
      { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
    );
    let response: unknown;
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('message', (message: unknown) => {
      response = message;
    });
    const settled = new Promise<ChildExit>((resolve) => {
      let completed = false;
      const finish = (exit: ChildExit): void => {
        if (!completed) {
          completed = true;
          resolve(exit);
        }
      };
      child.on('error', (error: Error) => finish({ kind: 'spawn-error', message: error.message }));
      child.on('close', (code, signal) => {
        const modeLine = stderr
          .split(/\r?\n/u)
          .find((line) => line.startsWith('EXTENSION_MAP_TEST_MODE '));
        if (modeLine !== undefined) {
          evidence.push(modeLine);
        }
        if (isWorkerResponse(response)) {
          if (response.ok) {
            finish(
              code === 0 ? { kind: 'model', model: response.model } : { kind: 'invalid-response' },
            );
          } else {
            finish({ kind: 'child-error', message: response.error });
          }
          return;
        }
        finish({ kind: 'exit', code, signal, stderr });
      });
    });
    if (child.connected) {
      child.send(spec.request);
    }
    const launched: LaunchedChild = {
      pid: child.pid,
      kill: (signal) => {
        child.kill(signal);
      },
      settled,
    };
    return launched;
  };

const runInMode = async (
  sourceCache: boolean,
  evidence: string[],
  reports: string[],
  availableBytes?: number,
): Promise<ExtensionMapModel> =>
  runAnalysis({
    repoRoot,
    sourceCache,
    workerPath,
    launchChild: launcherWithModeEvidence(evidence),
    ...(availableBytes === undefined ? {} : { availableMemory: () => availableBytes }),
    report: (line) => reports.push(line),
  });

beforeAll(async () => {
  const uncachedEvidence: string[] = [];
  const uncachedReports: string[] = [];
  uncachedModel = await runInMode(false, uncachedEvidence, uncachedReports);
  expect(uncachedReports.some((line) => line.includes('uncached analysis (source cache off'))).toBe(
    true,
  );
  expect(uncachedEvidence).toHaveLength(1);
  expect(uncachedEvidence[0]).toMatch(/mode=uncached availableBytes=\d+/u);

  const availableBytes = process.availableMemory();
  if (availableBytes < 8 * 1024 ** 3) {
    throw new Error(
      `cached parity requires 8 GiB of actual available memory; observed ${availableBytes} bytes`,
    );
  }
  const cachedEvidence: string[] = [];
  const cachedReports: string[] = [];
  cachedModel = await runInMode(true, cachedEvidence, cachedReports, availableBytes);
  expect(cachedReports.some((line) => line.includes('cached analysis (source cache on'))).toBe(
    true,
  );
  expect(cachedReports.some((line) => line.includes('retrying uncached'))).toBe(false);
  expect(cachedEvidence).toHaveLength(1);
  expect(cachedEvidence[0]).toMatch(/mode=cached availableBytes=\d+/u);
}, 600_000);

describe('render determinism', () => {
  it('renders byte-identical output from a second analysis', () => {
    expect(renderAll(uncachedModel)).toEqual(renderAll(repoModel));
    expect(renderAll(cachedModel)).toEqual(renderAll(repoModel));
  });

  it('builds the same model with the source cache off', () => {
    expect(uncachedModel).toEqual(repoModel);
  });

  it('builds the same model with the source cache on', () => {
    expect(cachedModel).toEqual(repoModel);
  });
});
