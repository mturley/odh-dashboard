import path from 'node:path';
import { table } from '../markdown';
import { docPathFor, githubAnchor, pointLink } from '../links';
import type { ExtensionMapModel, ExtensionPoint, Pkg } from '../../model/types';

const docText = (text: string | undefined, model: ExtensionMapModel, fromDoc: string): string =>
  (text ?? '').replace(/\{@link\s+([^}\s]+)(?:\s+[^}]*)?\}/gu, (match, id: string) => {
    const point = model.points.find((candidate) => candidate.id === id);
    return point === undefined ? `\`${id}\`` : pointLink(fromDoc, point, model);
  });

const implementers = (point: ExtensionPoint, model: ExtensionMapModel): string[] =>
  [
    ...new Set(
      model.extensions.filter((extension) => extension.type === point.id).map((ext) => ext.pkg),
    ),
  ].toSorted();

export const renderDefines = (model: ExtensionMapModel, pkg: Pkg): string => {
  const points = model.points.filter((point) => point.pkg === pkg.name);
  if (points.length === 0) {
    return '';
  }
  const fromDoc = docPathFor(pkg);
  const sections = points.map((point) => {
    const properties = table(
      ['Property', 'Type', 'Required', 'Description'],
      point.properties.map((property) => [
        `\`${property.name}\``,
        `\`${property.typeText}\``,
        property.optional ? 'No' : 'Yes',
        property.doc ?? '',
      ]),
    );
    const contributors = implementers(point, model);
    const implementedBy =
      contributors.length === 0
        ? '_Unused: no package contributes to this point._'
        : contributors
            .map((name) => {
              const contributor = model.packages.find((candidate) => candidate.name === name);
              if (contributor === undefined) {
                return `\`${name}\``;
              }
              const target = docPathFor(contributor);
              const relative = path.posix.relative(path.posix.dirname(fromDoc), target);
              return `[${name}](${relative}#${githubAnchor(point.id)})`;
            })
            .join(', ');
    const related = [...new Set([...point.doc.links, ...point.doc.see])]
      .map((id) => {
        const relatedPoint = model.points.find((candidate) => candidate.id === id);
        return relatedPoint === undefined ? `\`${id}\`` : pointLink(fromDoc, relatedPoint, model);
      })
      .join(', ');
    return [
      `### ${point.id}`,
      point.doc.deprecated === undefined
        ? ''
        : `> **Deprecated**${point.doc.deprecated === true ? '' : `: ${point.doc.deprecated}`}`,
      docText(point.doc.summary, model, fromDoc),
      point.doc.remarks === undefined
        ? ''
        : `**Remarks:** ${docText(point.doc.remarks, model, fromDoc)}`,
      properties,
      related === '' ? '' : `**Related:** ${related}`,
      `**Implemented by:** ${implementedBy}`,
    ]
      .filter((section) => section !== '')
      .join('\n\n');
  });
  return ['## Defines', ...sections].join('\n\n');
};
