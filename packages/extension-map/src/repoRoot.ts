import fs from 'fs';
import path from 'path';

/** Walks up from `start` until a directory containing `pnpm-workspace.yaml` is found. */
export const findRepoRoot = (start: string = process.cwd()): string => {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`No pnpm-workspace.yaml found above ${start}`);
    }
    dir = parent;
  }
};
