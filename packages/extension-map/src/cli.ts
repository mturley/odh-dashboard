import fs from 'node:fs';
import { runAnalysis } from './runtime/runAnalysis';
import { findRepoRoot } from './repoRoot';
import { renderAll } from './render/renderAll';
import { writeGenerated } from './output/write';

const USAGE = 'Usage: extension-map <generate|check>';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.stack ?? error.message : String(error);

const generate = async (args: string[]): Promise<number> => {
  const jsonIndex = args.indexOf('--json');
  const jsonFile = jsonIndex === -1 ? undefined : args[jsonIndex + 1];
  if (jsonIndex !== -1 && jsonFile === undefined) {
    console.error(`--json requires a <file> argument\n${USAGE}`);
    return 2;
  }
  try {
    const repoRoot = findRepoRoot();
    const model = await runAnalysis({
      repoRoot,
      sourceCache: args.includes('--no-source-cache') ? false : undefined,
    });
    const generated = renderAll(model);
    writeGenerated(repoRoot, generated);
    if (jsonFile !== undefined) {
      fs.writeFileSync(jsonFile, `${JSON.stringify(model, null, 2)}\n`);
    }
    console.log(`extension-map generate: wrote ${generated.length} package pages`);
    return 0;
  } catch (error) {
    console.error(`extension-map generate: ${errorMessage(error)}`);
    return 1;
  }
};

const check = (): number => {
  // `--strict` is accepted but only takes effect once the stale-output check exists.
  console.log('extension-map check: not implemented yet');
  return 0;
};

const run = async (): Promise<number> => {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'generate':
      return generate(args);
    case 'check':
      return check();
    default:
      console.error(USAGE);
      return 2;
  }
};

run().then(
  (code: number): void => {
    process.exitCode = code;
  },
  (error: unknown): void => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  },
);
