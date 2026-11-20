import { HEADER, table } from './markdown';
import { docPathFor, headingAnchors } from './links';
import { renderContributes } from './sections/contributes';
import { renderDefines } from './sections/defines';
import { renderDiagnostics } from './sections/diagnostics';
import type { ExtensionMapModel, Pkg } from '../model/types';

export type GeneratedFile = { path: string; content: string };

const loadingPaths = (model: ExtensionMapModel, pkg: Pkg): string => {
  const entries = model.entries.filter((entry) => entry.pkg === pkg.name);
  const hostFiltered = model.diagnostics.some(
    (diagnostic) => diagnostic.code === 'federation-not-loaded' && diagnostic.pkg === pkg.name,
  );
  if (entries.length === 0 && !hostFiltered) {
    return '';
  }
  const pathTable = table(
    ['Entry', 'Path', 'Source'],
    entries.map((entry) => [entry.id, entry.path, `\`${entry.file}\``]),
  );
  return [
    '## Loading paths',
    entries.length === 0 ? '' : pathTable,
    hostFiltered ? '_Federation declared but not loaded by the host._' : '',
  ]
    .filter(Boolean)
    .join('\n\n');
};

const contents = (body: string): string => {
  const headings = headingAnchors(`## Contents\n\n${body}`).slice(1);
  if (headings.length === 0) {
    return '';
  }
  return [
    '## Contents',
    ...headings.map(
      ({ level, text, anchor }) => `${'  '.repeat(Math.max(0, level - 2))}- [${text}](#${anchor})`,
    ),
  ].join('\n');
};

export const renderPackagePage = (model: ExtensionMapModel, pkg: Pkg): GeneratedFile => {
  const sections = [
    loadingPaths(model, pkg),
    renderDefines(model, pkg),
    renderContributes(model, pkg),
    renderDiagnostics(model, pkg),
  ].filter((section) => section !== '');
  const body = sections.join('\n\n');
  const tableOfContents = contents(body);
  return {
    path: docPathFor(pkg),
    content: `${HEADER}\n\n${tableOfContents}${tableOfContents === '' ? '' : '\n\n'}${body}\n`,
  };
};
