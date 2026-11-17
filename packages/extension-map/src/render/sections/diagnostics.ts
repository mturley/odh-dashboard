import { table } from '../markdown';
import type { ExtensionMapModel, Pkg } from '../../model/types';

export const renderDiagnostics = (model: ExtensionMapModel, pkg: Pkg): string => {
  const diagnostics = model.diagnostics.filter((diagnostic) => diagnostic.pkg === pkg.name);
  if (diagnostics.length === 0) {
    return '';
  }
  return [
    '## Diagnostics',
    table(
      ['Code', 'Message', 'Link'],
      diagnostics.map((diagnostic) => [
        `\`${diagnostic.code}\``,
        diagnostic.message,
        diagnostic.loc === undefined
          ? '[details](#diagnostics)'
          : `[${diagnostic.code}](#diagnostics)`,
      ]),
    ),
  ].join('\n\n');
};
