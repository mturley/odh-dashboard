import fs from 'node:fs';
import path from 'node:path';

/**
 * Walks up from `start` (default: cwd) until it finds the repo root, marked by
 * `pnpm-workspace.yaml`.
 */
export const findRepoRoot = (start: string = process.cwd()): string => {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`findRepoRoot: no pnpm-workspace.yaml found at or above ${start}`);
    }
    dir = parent;
  }
};
