import path from 'path';
import { githubAnchor } from './markdown';
import { CORE_PACKAGE } from '../discovery/workspace';
import type { ExtensionMapModel, ExtensionPoint, Loc, Pkg } from '../model/types';

/** The page a package's extensions are documented on. */
export const docPathFor = (pkg: Pkg): string => `${pkg.docsDir}/extensions.md`;

/** How a package is named in prose: the bare name, or the core app by where it lives. */
export const pkgDisplayName = (pkg: Pkg): string =>
  pkg.name === CORE_PACKAGE ? 'frontend (core app)' : pkg.name.replace(/^@odh-dashboard\//, '');

const relPath = (fromDoc: string, file: string): string => {
  const rel = path.posix.relative(path.posix.dirname(fromDoc), file);
  return rel.startsWith('.') ? rel : `./${rel}`;
};

/** `#L36`, or `#L36-L58` when the declaration spans lines. */
const lineAnchor = (loc: Loc): string => {
  const endLine = loc.endLine ?? loc.line;
  return endLine > loc.line ? `#L${loc.line}-L${endLine}` : `#L${loc.line}`;
};

/** A relative link to a declaration, with the symbol name as its visible text. */
export const relLink = (fromDoc: string, loc: Loc, text: string): string =>
  `[${text}](${relPath(fromDoc, loc.file)}${lineAnchor(loc)})`;

/**
 * A link whose visible text is `<file>:<line>`: for a line that declares no symbol, such as the
 * expression a value could not be resolved from, or the subject of a diagnostic.
 */
export const sourceLink = (fromDoc: string, loc: Loc): string =>
  relLink(fromDoc, loc, `${path.posix.basename(loc.file)}:${loc.line}`);

/** A relative link to a whole file or directory, with no line anchor. */
export const fileLink = (fromDoc: string, file: string, text: string): string =>
  `[${text}](${relPath(fromDoc, file)})`;

/** The heading a package page uses for its contributions to one point. */
export const contributesHeading = (pointId: string): string => `Contributes to ${pointId}`;

const linkToDoc = (fromDoc: string, toDoc: string, anchor: string, text: string): string =>
  `[${text}](${fromDoc === toDoc ? '' : relPath(fromDoc, toDoc)}#${anchor})`;

/** A link to where a point is defined: the `### <id>` heading on the defining package's page. */
export const pointLink = (
  fromDoc: string,
  point: ExtensionPoint,
  model: ExtensionMapModel,
): string => {
  const owner = model.packages.find((pkg) => pkg.name === point.pkg);
  if (!owner) {
    return `\`${point.id}\``;
  }
  return linkToDoc(fromDoc, docPathFor(owner), githubAnchor(point.id), point.id);
};

/** A link to where a package documents its contributions to one point. */
export const contributesLink = (
  fromDoc: string,
  pointId: string,
  contributor: Pkg,
  text: string,
): string =>
  linkToDoc(fromDoc, docPathFor(contributor), githubAnchor(contributesHeading(pointId)), text);
