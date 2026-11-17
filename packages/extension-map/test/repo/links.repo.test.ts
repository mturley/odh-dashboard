import fs from 'node:fs';
import path from 'node:path';
import { getRepoModel } from './model';
import { githubAnchor } from '../../src/render/links';
import { findRepoRoot } from '../../src/repoRoot';
import type { GeneratedFile } from '../../src/render/packagePage';
import { renderAll } from '../../src/render/renderAll';

const repoRoot = findRepoRoot();
const files = renderAll(getRepoModel());
const sourceLinkPattern = /\[([^\]]+)\]\(([^)#]+)#L(\d+)(?:-L\d+)?\)/gu;
const anchorPattern = /\[([^\]]+)\]\(([^)]*)#([^#)]+)\)/gu;

const brokenSourceLinks = (generated: GeneratedFile[]): string[] =>
  generated.flatMap((file) => {
    const problems: string[] = [];
    for (const match of file.content.matchAll(sourceLinkPattern)) {
      const [, visible, relative, lineText] = match;
      const sourcePath = path.resolve(path.dirname(path.join(repoRoot, file.path)), relative);
      const lineNumber = Number(lineText);
      if (!fs.existsSync(sourcePath)) {
        problems.push(`${file.path}: missing ${relative}`);
        continue;
      }
      const lines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/u);
      const sourceLine = lines.at(lineNumber - 1);
      if (
        sourceLine === undefined ||
        (!sourceLine.includes(visible) && !sourceLine.includes('{'))
      ) {
        problems.push(`${file.path}: ${relative}#L${lineNumber} does not contain ${visible}`);
      }
    }
    return problems;
  });

const brokenAnchors = (generated: GeneratedFile[]): string[] => {
  const byPath = new Map(generated.map((file) => [file.path, file.content]));
  return generated.flatMap((file) => {
    const problems: string[] = [];
    for (const match of file.content.matchAll(anchorPattern)) {
      const [, visible, relative, anchor] = match;
      if (anchor.startsWith('L') && /^L\d+(?:-L\d+)?$/u.test(anchor)) {
        continue;
      }
      if (relative.startsWith('http')) {
        continue;
      }
      const targetPath =
        relative === ''
          ? file.path
          : path.posix.normalize(path.posix.join(path.posix.dirname(file.path), relative));
      const target = byPath.get(targetPath);
      const targetAnchors =
        target === undefined
          ? []
          : [...target.matchAll(/^#{1,6}\s+(.+)$/gmu)].map((heading) => githubAnchor(heading[1]));
      if (target === undefined || !targetAnchors.includes(anchor)) {
        problems.push(`${file.path}: missing ${relative}#${anchor} (${visible})`);
      }
    }
    return problems;
  });
};

describe('rendered package links', () => {
  it('points every relative file link at an existing file and the right line', () => {
    expect(brokenSourceLinks(files)).toEqual([]);
  });

  it('resolves every intra-doc anchor', () => {
    expect(brokenAnchors(files)).toEqual([]);
  });

  it('contains no absolute GitHub blob links', () => {
    expect(files.map((file) => file.content).join('\n')).not.toMatch(/github\.com\/[^)]*\/blob\//);
  });
});
