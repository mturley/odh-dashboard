import fs from 'fs';
import path from 'path';
import { getRepoModel } from './model';
import { githubAnchor } from '../../src/render/markdown';
import type { GeneratedFile } from '../../src/render/packagePage';
import { renderAll } from '../../src/render/renderAll';
import { findRepoRoot } from '../../src/repoRoot';

const repoRoot = findRepoRoot();
const files = renderAll(getRepoModel());

const LINK = /\[([^\]\n]*)\]\(([^)\s]*)\)/g;
// Levels 1-4 only: nothing links to the level-5 heading of a single contribution, and two
// contributions to different points may legitimately carry the same name on one page.
const HEADING = /^#{1,4} (.+)$/gm;

/** The page without its fenced blocks: Mermaid is checked separately, links live in prose. */
const prose = (content: string): string =>
  content
    .split('\n')
    .filter((line, index, lines) => {
      const fences = lines.slice(0, index).filter((l) => l.startsWith('```')).length;
      return fences % 2 === 0 && !line.startsWith('```');
    })
    .join('\n');

type Link = { file: string; text: string; href: string };

const linksOf = (file: GeneratedFile): Link[] =>
  [...prose(file.content).matchAll(LINK)].map(([, text, href]) => ({
    file: file.path,
    text,
    href,
  }));

const allLinks = files.flatMap(linksOf);

const anchorsOf = (content: string): string[] =>
  [...prose(content).matchAll(HEADING)].map(([, heading]) => githubAnchor(heading.trim()));

const fileLinesCache = new Map<string, string[]>();
const fileLines = (relPath: string): string[] => {
  const cached = fileLinesCache.get(relPath);
  if (cached) {
    return cached;
  }
  const lines = fs.readFileSync(path.join(repoRoot, relPath), 'utf8').split('\n');
  fileLinesCache.set(relPath, lines);
  return lines;
};

/**
 * What the line a link points at must contain, from the link's visible text:
 * a symbol name must appear on it; a bare file name means an anonymous target (an object
 * literal), so the line must open one; prose and paths are not claims about the line.
 */
const expectationOf = (text: string): { symbol: string } | 'brace' | 'none' => {
  if (/\s/.test(text) || text.includes('/')) {
    return 'none';
  }
  if (/^[^\s/]+:\d+$/.test(text)) {
    // A `<file>:<line>` reference points at an expression, not at a declaration that names it.
    return 'none';
  }
  const tail = text.includes('#') ? text.slice(text.lastIndexOf('#') + 1) : text;
  if (tail === 'default') {
    // A default export's declaration names the symbol, not the word `default`.
    return 'none';
  }
  return /^[A-Za-z_$][\w$]*$/.test(tail) ? { symbol: tail } : 'brace';
};

const brokenSourceLinks = (): string[] =>
  allLinks.flatMap(({ file, text, href }) => {
    const hash = href.indexOf('#');
    const target = hash === -1 ? href : href.slice(0, hash);
    const anchor = hash === -1 ? '' : href.slice(hash + 1);
    if (target === '' || target.endsWith('.md')) {
      return [];
    }
    const relPath = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
    if (!fs.existsSync(path.join(repoRoot, relPath))) {
      return [`${file}: [${text}](${href}) -> missing ${relPath}`];
    }
    const match = /^L(\d+)(?:-L(\d+))?$/.exec(anchor);
    if (!match) {
      return [];
    }
    const lines = fileLines(relPath);
    const line = Number(match[1]);
    const end = match[2] ? Number(match[2]) : line;
    if (line < 1 || end > lines.length) {
      return [`${file}: [${text}](${href}) -> ${relPath} has ${lines.length} lines`];
    }
    const source = lines[line - 1];
    const expectation = expectationOf(text);
    if (expectation === 'none') {
      return [];
    }
    if (expectation === 'brace') {
      return source.includes('{')
        ? []
        : [`${file}: [${text}](${href}) -> ${relPath}:${line} opens no literal: ${source.trim()}`];
    }
    return source.includes(expectation.symbol)
      ? []
      : [
          `${file}: [${text}](${href}) -> ${relPath}:${line} lacks ${
            expectation.symbol
          }: ${source.trim()}`,
        ];
  });

const brokenAnchors = (): string[] => {
  const anchors = new Map(files.map((file) => [file.path, anchorsOf(file.content)]));
  return allLinks.flatMap(({ file, text, href }) => {
    const hash = href.indexOf('#');
    if (hash === -1) {
      return [];
    }
    const target = href.slice(0, hash);
    const anchor = href.slice(hash + 1);
    if (target !== '' && !target.endsWith('.md')) {
      return [];
    }
    const docPath =
      target === ''
        ? file
        : path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
    const found = anchors.get(docPath);
    if (!found) {
      return [`${file}: [${text}](${href}) -> no generated page ${docPath}`];
    }
    return found.includes(anchor) ? [] : [`${file}: [${text}](${href}) -> no anchor #${anchor}`];
  });
};

const duplicateAnchors = (): string[] =>
  files.flatMap((file) => {
    const seen = new Set<string>();
    return anchorsOf(file.content)
      .filter((anchor) => {
        const duplicate = seen.has(anchor);
        seen.add(anchor);
        return duplicate;
      })
      .map((anchor) => `${file.path}: #${anchor}`);
  });

const mermaidBlocks = (content: string): string[] =>
  [...content.matchAll(/```mermaid\n([\s\S]*?)```/g)].map(([, block]) => block);

/** Structural Mermaid check: a flowchart header, balanced subgraphs, declared edge endpoints. */
const brokenDiagrams = (): string[] =>
  files.flatMap((file) =>
    mermaidBlocks(file.content).flatMap((block, index) => {
      const where = `${file.path} diagram ${index + 1}`;
      const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const problems: string[] = [];
      if (!/^flowchart (LR|TB)$/.test(lines[0])) {
        problems.push(`${where}: first line is '${lines[0]}'`);
      }
      const declared = new Set<string>();
      let depth = 0;
      lines.forEach((line) => {
        if (line.startsWith('subgraph ')) {
          depth += 1;
        } else if (line === 'end') {
          depth -= 1;
        }
        const node = /^(n_[A-Za-z0-9_]+)[[(]/.exec(line);
        if (node) {
          declared.add(node[1]);
        }
      });
      if (depth !== 0) {
        problems.push(`${where}: unbalanced subgraphs (${depth})`);
      }
      lines.forEach((line) => {
        const edge = /^(n_[A-Za-z0-9_]+) .*?(n_[A-Za-z0-9_]+)$/.exec(line);
        if (edge && !(declared.has(edge[1]) && declared.has(edge[2]))) {
          problems.push(`${where}: edge with an undeclared endpoint: ${line}`);
        }
      });
      return problems;
    }),
  );

describe('generated links', () => {
  it('generates a page for every package that defines or contributes', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('points every relative file link at an existing file and the right line', () => {
    expect(brokenSourceLinks()).toEqual([]);
  });

  it('resolves every intra-doc anchor', () => {
    expect(brokenAnchors()).toEqual([]);
  });

  it('gives every heading on a page a unique anchor', () => {
    expect(duplicateAnchors()).toEqual([]);
  });

  it('contains no absolute github blob links', () => {
    expect(files.map((file) => file.content).join('\n')).not.toMatch(/github\.com\/[^)]*\/blob\//);
  });

  it('emits no ts or js fences', () => {
    expect(files.map((file) => file.content).join('\n')).not.toMatch(/```(js|jsx|ts|tsx)\b/);
  });

  it('emits structurally valid mermaid diagrams', () => {
    expect(brokenDiagrams()).toEqual([]);
  });

  it('writes no page inside an upstream directory', () => {
    expect(files.filter((file) => file.path.split('/').includes('upstream'))).toEqual([]);
  });
});
