import fs from 'fs';
import os from 'os';
import path from 'path';
import { findGeneratedFiles, writeGenerated } from '../../src/output/write';
import { HEADER } from '../../src/render/markdown';

let tmp: string;

const write = (relPath: string, content: string): void => {
  const absolute = path.join(tmp, relPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
};

const page = (body: string): string => `${HEADER}\n\n${body}\n`;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'extension-map-write-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('writeGenerated', () => {
  it('never writes into upstream', () => {
    const files = [{ path: 'packages/x/upstream/docs/extensions.md', content: HEADER }];
    expect(() => writeGenerated(tmp, files)).toThrow(/upstream/);
    expect(fs.existsSync(path.join(tmp, 'packages/x/upstream/docs/extensions.md'))).toBe(false);
  });

  it('refuses to overwrite hand-written files', () => {
    write('packages/x/docs/extensions.md', '# mine');
    const files = [{ path: 'packages/x/docs/extensions.md', content: HEADER }];
    expect(() => writeGenerated(tmp, files)).toThrow(/header/);
    expect(fs.readFileSync(path.join(tmp, 'packages/x/docs/extensions.md'), 'utf8')).toBe('# mine');
  });

  it('writes new files and overwrites its own', () => {
    write('packages/x/docs/extensions.md', page('old'));
    const changed = writeGenerated(tmp, [
      { path: 'packages/x/docs/extensions.md', content: page('new') },
      { path: 'docs/extension-map/README.md', content: page('index') },
    ]);
    expect(changed).toEqual(['docs/extension-map/README.md', 'packages/x/docs/extensions.md']);
    expect(fs.readFileSync(path.join(tmp, 'packages/x/docs/extensions.md'), 'utf8')).toBe(
      page('new'),
    );
  });

  it('reports nothing changed when the content is identical', () => {
    const files = [{ path: 'packages/x/docs/extensions.md', content: page('same') }];
    writeGenerated(tmp, files);
    expect(writeGenerated(tmp, files)).toEqual([]);
  });

  it('deletes files a previous run generated and this one did not', () => {
    write('packages/gone/docs/extensions.md', page('stale'));
    write('packages/gone/docs/views/a-view.md', page('stale view'));
    write('packages/keep/docs/overview.md', '# hand written');
    writeGenerated(tmp, [{ path: 'packages/keep/docs/extensions.md', content: page('kept') }]);
    expect(fs.existsSync(path.join(tmp, 'packages/gone/docs/extensions.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'packages/gone/docs/views/a-view.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'packages/keep/docs/overview.md'))).toBe(true);
  });
});

describe('findGeneratedFiles', () => {
  it('finds only generated paths that carry the header', () => {
    write('packages/x/docs/extensions.md', page('generated'));
    write('docs/extension-map/README.md', page('generated'));
    write('packages/x/docs/views/one.md', page('generated'));
    write('packages/x/docs/overview.md', page('hand-written path, generated header'));
    write('packages/y/docs/extensions.md', '# hand written');
    write('packages/y/bff/docs/extensions.md', '# hand written');
    write('node_modules/z/docs/extensions.md', page('ignored'));
    expect(findGeneratedFiles(tmp)).toEqual([
      'docs/extension-map/README.md',
      'packages/x/docs/extensions.md',
      'packages/x/docs/views/one.md',
    ]);
  });
});
