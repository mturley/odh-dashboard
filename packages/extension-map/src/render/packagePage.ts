import { HEADER, table } from './markdown';
import { docPathFor } from './links';
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

export const renderPackagePage = (model: ExtensionMapModel, pkg: Pkg): GeneratedFile => {
  const sections = [
    loadingPaths(model, pkg),
    renderDefines(model, pkg),
    renderContributes(model, pkg),
    renderDiagnostics(model, pkg),
  ].filter((section) => section !== '');
  return {
    path: docPathFor(pkg),
    content: `${HEADER}\n\n${sections.join('\n\n')}\n`,
  };
};
