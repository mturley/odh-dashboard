import fs from 'node:fs';
import path from 'node:path';
import type { GeneratedFile } from '../render/packagePage';
import { HEADER } from '../render/markdown';

export { HEADER };

const matchesGeneratedPath = (relative: string): boolean =>
  /(^|\/)docs\/extension-map\/.+/u.test(relative) ||
  /(^|\/)docs\/extensions\.md$/u.test(relative) ||
  /(^|\/)docs\/views\/[^/]+\.md$/u.test(relative);

const walkFiles = (root: string, relative = ''): string[] => {
  const directory = path.join(root, relative);
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if (
      entry.isSymbolicLink() ||
      entry.name === '.git' ||
      entry.name === 'node_modules' ||
      entry.name === 'upstream'
    ) {
      return [];
    }
    const child = path.posix.join(relative.split(path.sep).join('/'), entry.name);
    if (child === 'docs/superpowers') {
      return [];
    }
    if (entry.isDirectory()) {
      return walkFiles(root, child);
    }
    return entry.isFile() ? [child] : [];
  });
};

/** Finds generated extension-map output among tracked and untracked repository files. */
export const findGeneratedFiles = (repoRoot: string): string[] => {
  const root = path.resolve(repoRoot);
  return walkFiles(root)
    .filter(matchesGeneratedPath)
    .filter((relative) => {
      const absolute = path.join(root, relative);
      return fs.readFileSync(absolute, 'utf8').startsWith(HEADER);
    })
    .toSorted();
};

const safeDestination = (repoRoot: string, relative: string): string => {
  if (relative === '' || path.posix.isAbsolute(relative) || relative.includes('\\')) {
    throw new Error(`Generated path must be a repository-relative path: ${relative}`);
  }
  const segments = relative.split('/');
  if (segments[0] === 'docs' && segments[1] === 'superpowers') {
    throw new Error(`Refusing to write within docs/superpowers: ${relative}`);
  }
  if (segments.includes('..') || segments.includes('.') || segments.includes('upstream')) {
    if (segments.includes('upstream')) {
      throw new Error(`Refusing to write generated output inside upstream: ${relative}`);
    }
    throw new Error(
      `Generated path escapes or is not normalized within the repository: ${relative}`,
    );
  }
  if (!matchesGeneratedPath(relative)) {
    throw new Error(`Unsupported generated output path: ${relative}`);
  }
  const root = path.resolve(repoRoot);
  const destination = path.resolve(root, ...segments);
  const fromRoot = path.relative(root, destination);
  if (fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    throw new Error(`Generated path escapes the repository: ${relative}`);
  }
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) {
        throw new Error(`Refusing generated path through symlink: ${relative}`);
      }
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;
      if (code !== 'ENOENT') {
        throw error;
      }
    }
  }
  return destination;
};

/** Writes generated pages safely and removes stale generated pages only. */
export const writeGenerated = (repoRoot: string, files: GeneratedFile[]): void => {
  const root = path.resolve(repoRoot);
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Repository output root must be a real directory: ${repoRoot}`);
  }
  const desired = new Map<string, { path: string; content: string }>();
  const destinations = new Map<string, string>();
  for (const file of files) {
    if (!file.content.startsWith(HEADER)) {
      throw new Error(`Generated output is missing the required header: ${file.path}`);
    }
    const destination = safeDestination(root, file.path);
    if (desired.has(file.path)) {
      throw new Error(`Duplicate generated output path: ${file.path}`);
    }
    desired.set(file.path, file);
    destinations.set(file.path, destination);
    if (fs.existsSync(destination)) {
      const stat = fs.lstatSync(destination);
      if (!stat.isFile() || !fs.readFileSync(destination, 'utf8').startsWith(HEADER)) {
        throw new Error(`Refusing to overwrite a file without the generated header: ${file.path}`);
      }
    }
  }

  for (const [relative, file] of desired) {
    const destination = destinations.get(relative);
    if (destination === undefined) {
      throw new Error(`Missing validated output destination: ${relative}`);
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, file.content);
  }
  for (const stale of findGeneratedFiles(root)) {
    if (!desired.has(stale)) {
      const destination = safeDestination(root, stale);
      fs.unlinkSync(destination);
    }
  }
};
