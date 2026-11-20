import path from 'path';
import { docPathFor, fileLink, pkgDisplayName } from './links';
import { HEADER, joinBlocks, oneLine } from './markdown';
import { LEGEND_MD } from './mermaid';
import { renderContributes } from './sections/contributes';
import { renderConsumes } from './sections/consumes';
import { definesHasDiagram, renderDefines } from './sections/defines';
import { renderDiagnostics } from './sections/diagnostics';
import { renderToc } from './sections/toc';
import type { Entry, ExtensionMapModel, Pkg } from '../model/types';

export type GeneratedFile = { path: string; content: string };

const PATH_TEXT: Record<Entry['path'], string> = {
  static: 'bundled into the host at build time (the `./extensions` export)',
  federated: 'loaded at runtime by the host as a Module Federation remote',
  'distribution-static': 'bundled by a distribution that imports this export',
  'distribution-local': 'local to one distribution',
};

/** The `## Loading paths` section: the entries through which this package's extensions arrive. */
const renderLoadingPaths = (
  model: ExtensionMapModel,
  pkg: Pkg,
  docPath: string,
): string | undefined => {
  const entries = model.entries.filter((entry) => entry.pkg === pkg.name);
  const notLoaded = model.diagnostics.filter(
    (diagnostic) => diagnostic.pkg === pkg.name && diagnostic.code === 'federation-not-loaded',
  );
  if (entries.length === 0 && notLoaded.length === 0) {
    return undefined;
  }
  return joinBlocks([
    '## Loading paths',
    entries.length === 0
      ? 'This package exposes no extension entry.'
      : entries
          .map(
            (entry) =>
              `- ${fileLink(docPath, entry.file, path.posix.basename(entry.file))} (\`${
                entry.key
              }\`) — ${PATH_TEXT[entry.path]}`,
          )
          .join('\n'),
    ...notLoaded.map(
      (diagnostic) => `> **Federation declared but not loaded.** ${diagnostic.message}`,
    ),
  ]);
};

/** The whole generated page for one package. Empty sections are omitted. */
export const renderPackagePage = (model: ExtensionMapModel, pkg: Pkg): GeneratedFile => {
  const docPath = docPathFor(pkg);
  const loadingPaths = renderLoadingPaths(model, pkg, docPath);
  const defines = renderDefines(model, pkg);
  const contributes = renderContributes(model, pkg, docPath);
  const consumes = renderConsumes(model, pkg, docPath);
  const diagnostics = renderDiagnostics(model, pkg, docPath);
  const legend = definesHasDiagram(model, pkg);
  const content = joinBlocks([
    HEADER,
    `# Extensions in ${pkgDisplayName(pkg)}`,
    oneLine(`Package \`${pkg.name}\` (${pkg.kind}) at \`${pkg.dir}\`. Everything below is read
       out of this repository's sources by static analysis.`),
    renderToc(model, pkg, docPath, {
      loadingPaths: loadingPaths !== undefined,
      defines: defines !== undefined,
      contributes: contributes !== undefined,
      consumes: consumes !== undefined,
      diagnostics: diagnostics !== undefined,
      legend,
    }),
    loadingPaths,
    defines,
    contributes,
    consumes,
    diagnostics,
    legend ? LEGEND_MD : undefined,
  ]);
  return { path: docPath, content: `${content}\n` };
};
