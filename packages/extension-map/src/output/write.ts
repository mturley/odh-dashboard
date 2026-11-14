import fs from 'fs';
import path from 'path';
import { toPosix } from '../discovery/workspace';
import { HEADER } from '../render/markdown';
import type { GeneratedFile } from '../render/packagePage';

/** Directories never walked when looking for previously generated files. */
const SKIPPED_DIRS: ReadonlySet<string> = new Set(['node_modules', '.git']);

/** Repo-relative paths the tool is allowed to own. */
const isGeneratedPath = (relPath: string): boolean => {
  const segments = relPath.split('/');
  const base = segments[segments.length - 1];
  if (relPath.startsWith('docs/extension-map/')) {
    return true;
  }
  const parent = segments[segments.length - 2];
  if (parent === 'docs' && base === 'extensions.md') {
    return true;
  }
  return segments[segments.length - 3] === 'docs' && parent === 'views' && base.endsWith('.md');
};

const startsWithHeader = (file: string): boolean => {
  const handle = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(HEADER.length);
    const read = fs.readSync(handle, buffer, 0, HEADER.length, 0);
    return buffer.subarray(0, read).toString('utf8') === HEADER;
  } finally {
    fs.closeSync(handle);
  }
};

const walk = (dir: string, repoRoot: string, found: string[]): void => {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) {
      if (!SKIPPED_DIRS.has(item.name)) {
        walk(path.join(dir, item.name), repoRoot, found);
      }
    } else if (item.isFile() && item.name.endsWith('.md')) {
      const file = path.join(dir, item.name);
      const relPath = toPosix(path.relative(repoRoot, file));
      if (isGeneratedPath(relPath) && startsWithHeader(file)) {
        found.push(relPath);
      }
    }
  }
};

/**
 * Every file this tool previously generated: a tracked or untracked Markdown file in one of the
 * generated locations that still carries the generated header.
 */
export const findGeneratedFiles = (repoRoot: string): string[] => {
  const found: string[] = [];
  walk(repoRoot, repoRoot, found);
  return found.toSorted();
};

/**
 * Writes the generated files and removes the ones a previous run left behind. Never writes inside
 * an `upstream/` directory, and never over a file that does not carry the generated header.
 */
export const writeGenerated = (repoRoot: string, files: GeneratedFile[]): string[] => {
  for (const file of files) {
    const relPath = toPosix(file.path);
    if (relPath.split('/').includes('upstream')) {
      throw new Error(`Refusing to write inside an upstream directory: ${relPath}`);
    }
    const absolute = path.join(repoRoot, relPath);
    if (fs.existsSync(absolute) && !startsWithHeader(absolute)) {
      throw new Error(
        `Refusing to overwrite ${relPath}: it does not start with the generated header.`,
      );
    }
  }

  const stale = findGeneratedFiles(repoRoot).filter(
    (existing) => !files.some((file) => toPosix(file.path) === existing),
  );
  for (const relPath of stale) {
    fs.rmSync(path.join(repoRoot, relPath));
  }

  const written: string[] = [];
  for (const file of files) {
    const relPath = toPosix(file.path);
    const absolute = path.join(repoRoot, relPath);
    const current = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : undefined;
    if (current !== file.content) {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, file.content);
      written.push(relPath);
    }
  }
  return [...written, ...stale].toSorted();
};
