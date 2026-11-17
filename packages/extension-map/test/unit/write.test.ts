import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findGeneratedFiles, HEADER, writeGenerated } from '../../src/output/write';

const withTempRepo = (run: (root: string) => void): void => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-map-write-'));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

describe('writeGenerated', () => {
  it('never writes into upstream or docs/superpowers', () => {
    withTempRepo((root) => {
      const upstream = [{ path: 'packages/x/upstream/docs/extensions.md', content: HEADER }];
      const superpowers = [{ path: 'docs/superpowers/docs/extensions.md', content: HEADER }];
      expect(() => writeGenerated(root, upstream)).toThrow(/upstream/);
      expect(() => writeGenerated(root, superpowers)).toThrow(/docs\/superpowers/);
    });
  });

  it('refuses to overwrite hand-written files', () => {
    withTempRepo((root) => {
      const destination = path.join(root, 'packages/x/docs/extensions.md');
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, '# mine');
      const files = [{ path: 'packages/x/docs/extensions.md', content: HEADER }];
      expect(() => writeGenerated(root, files)).toThrow(/header/i);
      expect(fs.readFileSync(destination, 'utf8')).toBe('# mine');
    });
  });

  it('rejects paths escaping the repository or crossing symlinks', () => {
    withTempRepo((root) => {
      expect(() => writeGenerated(root, [{ path: '../outside.md', content: HEADER }])).toThrow();
      const rootLink = `${root}-link`;
      fs.symlinkSync(root, rootLink, 'dir');
      try {
        expect(() => writeGenerated(rootLink, [])).toThrow(/real directory/i);
      } finally {
        fs.unlinkSync(rootLink);
      }
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-map-outside-'));
      try {
        fs.symlinkSync(outside, path.join(root, 'linked'));
        expect(() =>
          writeGenerated(root, [{ path: 'linked/docs/extensions.md', content: HEADER }]),
        ).toThrow(/symlink/i);
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  it('writes desired files and prunes only previously generated pages', () => {
    withTempRepo((root) => {
      const oldPage = path.join(root, 'packages/x/docs/extensions.md');
      fs.mkdirSync(path.dirname(oldPage), { recursive: true });
      fs.writeFileSync(oldPage, `${HEADER}\n\nold`);
      const handwritten = path.join(root, 'packages/y/docs/extensions.md');
      fs.mkdirSync(path.dirname(handwritten), { recursive: true });
      fs.writeFileSync(handwritten, '# keep');
      const desired = { path: 'docs/extension-map/README.md', content: `${HEADER}\n\nnew` };

      writeGenerated(root, [desired]);

      expect(fs.existsSync(oldPage)).toBe(false);
      expect(fs.readFileSync(path.join(root, desired.path), 'utf8')).toBe(desired.content);
      expect(fs.readFileSync(handwritten, 'utf8')).toBe('# keep');
      expect(findGeneratedFiles(root)).toEqual([desired.path]);
    });
  });
});
