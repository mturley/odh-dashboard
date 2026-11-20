import { consumedPointIds, consumersOf, symbolText } from './consumes';
import { contributionGroups, identityLabels, rowMark } from './contributes';
import { INCLUDED_IN, hasApps, includedInCell } from '../appNotes';
import {
  consumesHeading,
  consumesLink,
  contributesHeading,
  contributesLink,
  pkgDisplayName,
  pointLink,
} from '../links';
import { githubAnchor, joinBlocks, oneLine, table } from '../markdown';
import type { ExtensionMapModel, Pkg } from '../../model/types';

/** Which sections a page has, so the nav line and the table of contents list only those. */
export type PageSections = {
  loadingPaths: boolean;
  defines: boolean;
  contributes: boolean;
  consumes: boolean;
  diagnostics: boolean;
  legend: boolean;
};

const EMPTY = '—';
const UNUSED = 'unused';

/** The one-line section nav under the page title: every section the page actually has. */
const navLine = (sections: PageSections): string =>
  (
    [
      [sections.loadingPaths, 'Loading paths'],
      [sections.defines, 'Defines'],
      [sections.contributes, 'Contributes'],
      [sections.consumes, 'Consumes'],
      [sections.diagnostics, 'Diagnostics'],
      [sections.legend, 'Legend'],
    ] as const
  )
    .flatMap(([present, name]) => (present ? [`[${name}](#${githubAnchor(name)})`] : []))
    .join(' · ');

/** The packages that contribute an extension of a point, linked to their contributor sections. */
const implementers = (model: ExtensionMapModel, pointId: string, docPath: string): string[] =>
  [
    ...new Set(
      model.extensions.filter((record) => record.type === pointId).map((record) => record.pkg),
    ),
  ]
    .toSorted()
    .map((name) => {
      const owner = model.packages.find((candidate) => candidate.name === name);
      return owner
        ? contributesLink(docPath, pointId, owner, pkgDisplayName(owner))
        : `\`${name}\``;
    });

/** The packages whose code queries or uses a point, linked to their Consumes sections. */
const consumerPkgs = (model: ExtensionMapModel, pointId: string, docPath: string): string[] =>
  [...new Set(consumersOf(model, pointId).map(({ consumer }) => consumer.pkg))]
    .toSorted()
    .map((name) => {
      const owner = model.packages.find((candidate) => candidate.name === name);
      return owner ? consumesLink(docPath, pointId, owner, pkgDisplayName(owner)) : `\`${name}\``;
    });

/** The points this package declares, and which packages implement and consume each. */
const definesTable = (model: ExtensionMapModel, pkg: Pkg, docPath: string): string | undefined => {
  const points = model.points.filter((point) => point.pkg === pkg.name);
  if (points.length === 0) {
    return undefined;
  }
  return joinBlocks([
    '**Defines**',
    table(
      ['Extension point', 'Implemented by', 'Consumed in'],
      points.map((point) => {
        const implementedBy = implementers(model, point.id, docPath);
        const consumedIn = consumerPkgs(model, point.id, docPath);
        const unused = implementedBy.length === 0 && consumedIn.length === 0;
        return [
          `[${point.id}](#${githubAnchor(point.id)})`,
          unused ? UNUSED : implementedBy.join(', ') || EMPTY,
          unused ? UNUSED : consumedIn.join(', ') || EMPTY,
        ];
      }),
    ),
  ]);
};

/** Every extension this package declares, in the order of the detail sections below it. */
const contributesTable = (
  model: ExtensionMapModel,
  pkg: Pkg,
  docPath: string,
): string | undefined => {
  const groups = contributionGroups(model, pkg);
  if (groups.length === 0) {
    return undefined;
  }
  const withApps = hasApps(model);
  const rows = groups.flatMap(({ byType }) =>
    [...byType.entries()].flatMap(([type, records]) => {
      const labels = identityLabels(type, records);
      const point = model.points.find((candidate) => candidate.id === type);
      return records.map((record) => {
        const mark = rowMark(record);
        const label = `${labels.get(record.key) ?? ''}${mark === undefined ? '' : ` ${mark}`}`;
        return [
          `[${label}](#${githubAnchor(contributesHeading(type))})`,
          point ? pointLink(docPath, point, model) : `\`${type}\``,
          ...(withApps ? [includedInCell(record)] : []),
        ];
      });
    }),
  );
  return joinBlocks([
    '**Contributes**',
    table(['Extension', 'Extension point', ...(withApps ? [INCLUDED_IN] : [])], rows),
  ]);
};

/** Every consumer in this package, in the order of the Consumes detail sections below it. */
const consumesTable = (model: ExtensionMapModel, pkg: Pkg, docPath: string): string | undefined => {
  const pointIds = consumedPointIds(model, pkg);
  if (pointIds.length === 0) {
    return undefined;
  }
  const rows = pointIds.flatMap((pointId) => {
    const point = model.points.find((candidate) => candidate.id === pointId);
    return consumersOf(model, pointId, pkg.name).map(({ consumer }) => [
      `[${symbolText(consumer.symbol)}](#${githubAnchor(consumesHeading(pointId))})`,
      point ? pointLink(docPath, point, model) : `\`${pointId}\``,
    ]);
  });
  return joinBlocks(['**Consumes**', table(['Consumer', 'Extension point'], rows)]);
};

/**
 * The section nav and the `## On this page` tables: what the page holds, with an anchor link to
 * every section of it. Code links live in the sections it points at, never here.
 */
export const renderToc = (
  model: ExtensionMapModel,
  pkg: Pkg,
  docPath: string,
  sections: PageSections,
): string =>
  joinBlocks([
    navLine(sections),
    '## On this page',
    oneLine(`Every extension point, extension and consumer on this page, each linking to its own
       section. Links to the code are in those sections.`),
    definesTable(model, pkg, docPath),
    contributesTable(model, pkg, docPath),
    consumesTable(model, pkg, docPath),
  ]);
