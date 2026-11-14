import { findRepoRoot } from './repoRoot';

const USAGE = `Usage: extension-map <generate|check> [options]

  generate [--json <file>] [--no-source-cache]
  check [--strict]
`;

const main = (argv: string[]): number => {
  const [command] = argv;
  if (command === 'generate' || command === 'check') {
    // eslint-disable-next-line no-console
    console.log(`extension-map ${command}: not implemented (repo root: ${findRepoRoot()})`);
    return 0;
  }
  process.stderr.write(USAGE);
  return 2;
};

process.exitCode = main(process.argv.slice(2));
