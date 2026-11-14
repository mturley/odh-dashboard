/**
 * The analysis child (memory-fix brief). Receives one `WorkerRequest` over
 * IPC, runs `analyzeRepo` synchronously (one TypeScript program at a time),
 * and transports only the successful plain model — or a plain error message —
 * back to the parent. It never writes to stdout: stdout is not a machine
 * protocol. The process exits once its response has been flushed.
 */
import type { WorkerRequest, WorkerResponse } from './runAnalysis';
import { analyzeRepo } from '../analyze';

const isWorkerRequest = (message: unknown): message is WorkerRequest => {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  if (!('repoRoot' in message) || !('sourceCache' in message)) {
    return false;
  }
  const workspaceOk = !('workspace' in message) || Array.isArray(message.workspace);
  return (
    typeof message.repoRoot === 'string' && typeof message.sourceCache === 'boolean' && workspaceOk
  );
};

const safeStringify = (message: unknown): string => {
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
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

let handled = false;

process.on('message', (message: unknown) => {
  if (handled) {
    return; // one analysis per child
  }
  handled = true;
  if (!isWorkerRequest(message)) {
    respond({ ok: false, error: `invalid analysis request: ${safeStringify(message)}` });
    return;
  }
  try {
    const model = analyzeRepo({
      repoRoot: message.repoRoot,
      workspace: message.workspace,
      sourceCache: message.sourceCache,
    });
    respond({ ok: true, model });
  } catch (error) {
    respond({
      ok: false,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
  }
});

process.on('disconnect', () => {
  process.exit(1);
});
