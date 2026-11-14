import fs from 'fs';
import path from 'path';
import { analyzeRepo } from './analyze';
import { writeGenerated } from './output/write';
import { renderAll } from './render/renderAll';
import { findRepoRoot } from './repoRoot';

const USAGE = `Usage: extension-map <generate|check> [options]

  generate [--json <file>] [--no-source-cache]
  check [--strict]
`;

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const generate = (argv: string[]): number => {
  const jsonAt = argv.indexOf('--json');
  const jsonFile = jsonAt === -1 ? undefined : argv[jsonAt + 1];
  if (jsonAt !== -1 && jsonFile === undefined) {
    process.stderr.write('--json needs a file path\n');
    return 2;
  }
  const repoRoot = findRepoRoot();
  const model = analyzeRepo({ repoRoot, sourceCache: !argv.includes('--no-source-cache') });
  if (jsonFile !== undefined) {
    fs.mkdirSync(path.dirname(path.resolve(jsonFile)), { recursive: true });
    fs.writeFileSync(path.resolve(jsonFile), JSON.stringify(model, null, 2));
    log(`extension-map: wrote the model to ${jsonFile}`);
  }
  const files = renderAll(model);
  const changed = writeGenerated(repoRoot, files);
  log(
    `extension-map: generated ${files.length} files, ${changed.length} changed, ${model.diagnostics.length} diagnostics`,
  );
  changed.forEach((file) => log(`  ${file}`));
  return 0;
};

const main = (argv: string[]): number => {
  const [command, ...rest] = argv;
  if (command === 'generate') {
    return generate(rest);
  }
  if (command === 'check') {
    log(`extension-map check: not implemented (repo root: ${findRepoRoot()})`);
    return 0;
  }
  process.stderr.write(USAGE);
  return 2;
};

process.exitCode = main(process.argv.slice(2));
