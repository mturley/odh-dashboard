import { sourceLink } from '../links';
import { joinBlocks, oneLine, table } from '../markdown';
import type { Diagnostic, ExtensionMapModel, Pkg } from '../../model/types';

/** Where a diagnostic was raised, as `<file>:<line>`. */
const sourceCell = (diagnostic: Diagnostic, docPath: string): string =>
  diagnostic.loc ? sourceLink(docPath, diagnostic.loc) : '—';

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
    oneLine(`What the analysis could not prove, or thought worth reporting, about this package:
       warnings are things the analysis could not prove, which are gaps in the map; info entries
       are findings about the code, which the map reports in full.`),
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
