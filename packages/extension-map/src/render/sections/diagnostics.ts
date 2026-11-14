import { pathLink } from '../links';
import { joinBlocks, oneLine, table } from '../markdown';
import type { Diagnostic, ExtensionMapModel, Pkg } from '../../model/types';

/** The relative path of a diagnostic's file, as its own visible link text. */
const sourceCell = (diagnostic: Diagnostic, docPath: string): string =>
  diagnostic.loc ? pathLink(docPath, diagnostic.loc) : '—';

/** The `## Diagnostics` section: what the analysis could not prove about this package. */
export const renderDiagnostics = (
  model: ExtensionMapModel,
  pkg: Pkg,
  docPath: string,
): string | undefined => {
  const diagnostics = model.diagnostics.filter((diagnostic) => diagnostic.pkg === pkg.name);
  if (diagnostics.length === 0) {
    return undefined;
  }
  return joinBlocks([
    '## Diagnostics',
    oneLine(`What the analysis could not prove, or thought worth reporting, about this package.
       Warnings are gaps in the generated map; info entries are observations.`),
    table(
      ['Code', 'Severity', 'Message', 'Source'],
      diagnostics.map((diagnostic) => [
        `\`${diagnostic.code}\``,
        diagnostic.severity,
        oneLine(diagnostic.message),
        sourceCell(diagnostic, docPath),
      ]),
    ),
  ]);
};
