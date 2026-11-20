import fs from 'node:fs';
import path from 'node:path';
import { findRepoRoot } from '../repoRoot';
import type { ExtensionMapModel, ExtensionPoint, Loc, Pkg } from '../model/types';

export const githubAnchor = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/gu, '')
    .replace(/ /gu, '-');

export type HeadingAnchor = { level: number; text: string; anchor: string };

/** Derives GitHub heading IDs in document order, excluding fenced code blocks. */
export const headingAnchors = (markdown: string): HeadingAnchor[] => {
  const used = new Set<string>();
  const nextSuffix = new Map<string, number>();
  let inFence = false;
  const headings: HeadingAnchor[] = [];
  for (const line of markdown.split(/\r?\n/u)) {
    if (/^\s*```/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/u);
    if (match === null) {
      continue;
    }
    const text = match[2];
    const base = githubAnchor(text);
    let suffix = nextSuffix.get(base) ?? 0;
    let anchor = suffix === 0 ? base : `${base}-${suffix}`;
    while (used.has(anchor)) {
      suffix += 1;
      anchor = `${base}-${suffix}`;
    }
    used.add(anchor);
    nextSuffix.set(base, suffix + 1);
    headings.push({ level: match[1].length, text, anchor });
  }
  return headings;
};

export const docPathFor = (pkg: Pkg): string => path.posix.join(pkg.docsDir, 'extensions.md');

export const sourceSymbolName = (loc: Loc, fallback: string): string => {
  try {
    const source = fs.readFileSync(path.join(findRepoRoot(), loc.file), 'utf8');
    const line = source.split(/\r?\n/u).at(loc.line - 1) ?? '';
    const declaration = line.match(
      /^\s*(?:export\s+)?(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/u,
    );
    const defaultValue = line.match(/^\s*(?:export\s+)?default\s+([A-Za-z_$][\w$]*)/u);
    const expression = line.match(/^\s*(?:return\s+)?([A-Za-z_$][\w$]*)\s*(?::|\(|\.|,|;|$)/u);
    return declaration?.[1] ?? defaultValue?.[1] ?? expression?.[1] ?? fallback;
  } catch {
    return fallback;
  }
};

export const relLink = (fromDoc: string, loc: Loc, text: string): string => {
  const relative = path.posix.relative(path.posix.dirname(fromDoc), loc.file);
  return `[${text}](${relative}#L${loc.line}${
    loc.endLine === undefined ? '' : `-L${loc.endLine}`
  })`;
};

export const locationLink = (fromDoc: string, loc: Loc): string => {
  const relative = path.posix.relative(path.posix.dirname(fromDoc), loc.file);
  return relLink(fromDoc, loc, `${relative}:${loc.line}`);
};

export const pointLink = (
  fromDoc: string,
  point: ExtensionPoint,
  model: ExtensionMapModel,
): string => {
  const pkg = model.packages.find((candidate) => candidate.name === point.pkg);
  if (pkg === undefined) {
    throw new Error(`Extension point '${point.id}' has no defining package '${point.pkg}'`);
  }
  const target = docPathFor(pkg);
  const relative = path.posix.relative(path.posix.dirname(fromDoc), target);
  return `[${point.id}](${relative}#${githubAnchor(point.id)})`;
};
