/**
 * Stub analysis worker for the runtime integration test. It speaks the same
 * IPC protocol as the real `src/runtime/worker.ts` but, instead of analyzing,
 * it self-verifies the child's launch environment: the parent-chosen heap cap
 * must have reached this process (inherited execArgv / NODE_OPTIONS heap flags
 * must not override it). Any failed check is reported back as a child error,
 * which fails the test; a passing check responds with a successful empty
 * model.
 */
import v8 from 'node:v8';
import type { ExtensionMapModel } from '../../../src/model/types';
import type { WorkerResponse } from '../../../src/runtime/runAnalysis';

const MIB = 1024 ** 2;
/** Matches runAnalysis' uncached budget for 3 GiB available (3072 - 1024). */
const EXPECTED_CAP = '--max-old-space-size=2048';

const model: ExtensionMapModel = {
  version: 1,
  packages: [],
  entries: [],
  apps: [],
  points: [],
  guards: [],
  extensions: [],
  overrides: [],
  consumers: [],
  querySites: [],
  useSites: [],
  carriedTypes: [],
  diagnostics: [],
};

/** Sends the response, then exits once the message has been flushed. */
const respond = (response: WorkerResponse): void => {
  const code = response.ok ? 0 : 1;
  if (process.send === undefined) {
    process.exit(code);
    return;
  }
  process.send(response, () => {
    process.exit(code);
  });
};

process.on('message', () => {
  const failures: string[] = [];
  if (!process.execArgv.includes(EXPECTED_CAP)) {
    failures.push(`execArgv ${JSON.stringify(process.execArgv)} lacks ${EXPECTED_CAP}`);
  }
  if (
    process.execArgv.some((arg) => arg.startsWith('--max-old-space-size') && arg !== EXPECTED_CAP)
  ) {
    failures.push('an inherited heap flag overrode the chosen cap');
  }
  const limit = v8.getHeapStatistics().heap_size_limit;
  if (limit > 3072 * MIB) {
    failures.push(`heap limit ${limit} bytes exceeds the chosen cap`);
  }
  const nodeOptions = process.env.NODE_OPTIONS ?? '';
  if (nodeOptions.includes('--max-old-space-size')) {
    failures.push(`NODE_OPTIONS was not sanitized: ${nodeOptions}`);
  }
  if (failures.length > 0) {
    respond({ ok: false, error: failures.join('; ') });
    return;
  }
  respond({ ok: true, model });
});

process.on('disconnect', () => {
  process.exit(1);
});
