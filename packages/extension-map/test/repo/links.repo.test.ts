import fs from 'node:fs';
import path from 'node:path';
import { getRepoModel } from './model';
import { headingAnchors } from '../../src/render/links';
import { findRepoRoot } from '../../src/repoRoot';
import type { GeneratedFile } from '../../src/render/packagePage';
import { renderAll } from '../../src/render/renderAll';

const repoRoot = findRepoRoot();
const model = getRepoModel();
const files = renderAll(model);
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
      const locationLabel = visible.match(/^(.+):(\d+)$/u);
      const relativeSource = path.relative(repoRoot, sourcePath);
      const registrations = model.extensions.filter(
        (extension) => extension.loc.file === relativeSource && extension.loc.line === lineNumber,
      );
      const registrationRow = file.content
        .split(/\r?\n/u)
        .find(
          (row) => row.startsWith('|') && row.includes(`[${visible}](${relative}#L${lineNumber}`),
        );
      const contractId = registrationRow
        ?.split('|')[2]
        ?.trim()
        .match(/^\[([^\]]+)\]\(/u)?.[1];
      const knownRegistration =
        contractId !== undefined &&
        registrations.some((extension) => extension.type === contractId);
      const knownDiagnostic = model.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === visible &&
          diagnostic.loc?.file === relativeSource &&
          diagnostic.loc.line === lineNumber,
      );
      if (sourceLine === undefined) {
        problems.push(`${file.path}: ${relative}#L${lineNumber} does not exist`);
      } else if (locationLabel !== null) {
        const [, labelPath, labelLine] = locationLabel;
        const labeledPath = path.resolve(path.dirname(path.join(repoRoot, file.path)), labelPath);
        if (labeledPath !== sourcePath || Number(labelLine) !== lineNumber || !knownRegistration) {
          problems.push(
            `${file.path}: ${visible} does not identify a known registration at ${relative}#L${lineNumber}`,
          );
        }
      } else if (
        !sourceLine.includes(visible) &&
        !registrations.some((extension) => extension.type === visible) &&
        !knownDiagnostic
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
          : headingAnchors(target).map(({ anchor: targetAnchor }) => targetAnchor);
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
