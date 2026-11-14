import fs from 'node:fs';
import { analyzeRepo } from './analyze';
import { findRepoRoot } from './repoRoot';

const USAGE = 'Usage: extension-map <generate|check>';

const generate = (args: string[]): number => {
  const jsonIndex = args.indexOf('--json');
  const jsonFile = jsonIndex === -1 ? undefined : args[jsonIndex + 1];
  if (jsonIndex !== -1 && jsonFile === undefined) {
    console.error(`--json requires a <file> argument\n${USAGE}`);
    return 2;
  }
  const model = analyzeRepo({
    repoRoot: findRepoRoot(),
    sourceCache: !args.includes('--no-source-cache'),
  });
  if (jsonFile !== undefined) {
    fs.writeFileSync(jsonFile, `${JSON.stringify(model, null, 2)}\n`);
  }
  console.log('extension-map generate: documentation rendering is not implemented yet');
  return 0;
};

const check = (): number => {
  // `--strict` is accepted but only takes effect once the stale-output check exists.
  console.log('extension-map check: not implemented yet');
  return 0;
};

const run = (): number => {
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

process.exitCode = run();
