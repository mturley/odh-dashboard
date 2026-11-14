import { contributesLink, docPathFor, pkgDisplayName, relLink } from '../links';
import { joinBlocks, oneLine, table } from '../markdown';
import type { ExtensionMapModel, ExtensionPoint, Pkg } from '../../model/types';

/**
 * The checker's expansion of a code reference's inner type, cut short: the declared `Type`
 * column beside it already carries the exact text as written in the source.
 */
const INNER_TYPE_LIMIT = 120;

const innerType = (inner: string): string => {
  const text = oneLine(inner);
  return text.length > INNER_TYPE_LIMIT ? `${text.slice(0, INNER_TYPE_LIMIT)}…` : text;
};

const propertyRows = (point: ExtensionPoint): string[][] =>
  point.properties.map((property) => [
    `\`${property.name}\``,
    property.optional ? '—' : 'yes',
    `\`${oneLine(property.typeText)}\``,
    property.codeRef ? `\`${innerType(property.codeRef.inner)}\`` : '—',
    property.doc ? oneLine(property.doc) : '',
  ]);

/** The packages that contribute an extension of this point, with a link to their page. */
const implementedBy = (
  point: ExtensionPoint,
  model: ExtensionMapModel,
  docPath: string,
): string | undefined => {
  const names = [
    ...new Set(
      model.extensions.filter((record) => record.type === point.id).map((record) => record.pkg),
    ),
  ].toSorted();
  if (names.length === 0) {
    return undefined;
  }
  const links = names.map((name) => {
    const contributor = model.packages.find((candidate) => candidate.name === name);
    return contributor
      ? contributesLink(docPath, point.id, contributor, pkgDisplayName(contributor))
      : `\`${name}\``;
  });
  return `**Implemented by:** ${links.join(', ')}`;
};

const renderPoint = (point: ExtensionPoint, model: ExtensionMapModel, docPath: string): string => {
  const deprecated =
    point.doc.deprecated === undefined
      ? undefined
      : `> **Deprecated.**${
          typeof point.doc.deprecated === 'string' ? ` ${point.doc.deprecated}` : ''
        }`;
  const declaration = [
    `Declared as ${relLink(docPath, point.loc, point.typeName)}`,
    point.typeParams.length === 0
      ? ''
      : `, with type parameters ${point.typeParams.map((p) => `\`${p}\``).join(', ')}`,
    '.',
  ].join('');

  return joinBlocks([
    `### ${point.id}`,
    deprecated,
    point.doc.summary,
    point.doc.remarks,
    declaration,
    point.properties.length === 0
      ? undefined
      : joinBlocks([
          '**Properties:**',
          table(['Property', 'Required', 'Type', 'CodeRef of', 'Description'], propertyRows(point)),
        ]),
    point.doc.links.length === 0
      ? undefined
      : `**Related:** ${point.doc.links.map((link) => `\`${link}\``).join(', ')}`,
    point.doc.see.length === 0
      ? undefined
      : `**See:** ${point.doc.see.map((see) => oneLine(see)).join('; ')}`,
    implementedBy(point, model, docPath) ??
      '> **Unused.** No package in this repository contributes an extension of this point.',
  ]);
};

/** The `## Defines` section: the extension points this package declares. */
export const renderDefines = (model: ExtensionMapModel, pkg: Pkg): string | undefined => {
  const points = model.points.filter((point) => point.pkg === pkg.name);
  if (points.length === 0) {
    return undefined;
  }
  const docPath = docPathFor(pkg);
  return joinBlocks([
    '## Defines',
    oneLine(`The extension points this package declares. Each heading is the point ID other
       packages use as an extension's \`type\`.`),
    ...points.map((point) => renderPoint(point, model, docPath)),
  ]);
};
