import type { WorkerRequest, WorkerResponse } from '../../src/runtime/runAnalysis';
import { analysisSourceCache, analyzeRepo } from '../../src/analyze';
import type { ExtensionMapModel } from '../../src/model/types';

const isWorkerRequest = (message: unknown): message is WorkerRequest =>
  typeof message === 'object' &&
  message !== null &&
  'repoRoot' in message &&
  typeof message.repoRoot === 'string' &&
  'sourceCache' in message &&
  typeof message.sourceCache === 'boolean' &&
  (!('workspace' in message) || Array.isArray(message.workspace));

const respond = (response: WorkerResponse): void => {
  if (process.send === undefined) {
    process.exit(response.ok ? 0 : 1);
    return;
  }
  process.send(response, () => process.exit(response.ok ? 0 : 1));
};

process.on('message', (message: unknown) => {
  if (!isWorkerRequest(message)) {
    respond({ ok: false, error: 'invalid extension-map cache-mode request' });
    return;
  }
  const availableBytes = process.availableMemory();
  const actualCache = analysisSourceCache(message.sourceCache, () => availableBytes);
  process.stderr.write(
    `EXTENSION_MAP_TEST_MODE mode=${
      actualCache ? 'cached' : 'uncached'
    } availableBytes=${availableBytes}\n`,
  );
  if (message.sourceCache && !actualCache) {
    respond({
      ok: false,
      error: `cached parity requires 8 GiB in the analysis child; observed ${availableBytes} bytes`,
    });
    return;
  }
  try {
    const model: ExtensionMapModel = analyzeRepo({
      repoRoot: message.repoRoot,
      workspace: message.workspace,
      sourceCache: message.sourceCache,
      availableMemory: () => availableBytes,
    });
    respond({ ok: true, model });
  } catch (error) {
    respond({
      ok: false,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
  }
});
