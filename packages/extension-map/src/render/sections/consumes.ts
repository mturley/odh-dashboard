import path from 'path';
import { consumesHeading, fileLink, pointLink, relLink, sourceLink } from '../links';
import { joinBlocks, oneLine, table } from '../markdown';
import type { Consumer, ExtensionMapModel, Pkg, QuerySite, UseSite } from '../../model/types';

/** One consumer of one point: where it queries the point and how it uses what it gets. */
export type PointConsumer = {
  consumer: Consumer;
  querySites: QuerySite[];
  uses: UseSite[];
};

/** The consumers of a point, optionally only those of one package; sorted by consumer id. */
export const consumersOf = (
  model: ExtensionMapModel,
  pointId: string,
  pkgName?: string,
): PointConsumer[] =>
  model.consumers
    .filter((consumer) => pkgName === undefined || consumer.pkg === pkgName)
    .map((consumer) => ({
      consumer,
      querySites: model.querySites.filter(
        (site) => site.consumer === consumer.id && site.pointIds.includes(pointId),
      ),
      uses: model.useSites.filter((use) => use.consumer === consumer.id && use.pointId === pointId),
    }))
    .filter((entry) => entry.querySites.length > 0 || entry.uses.length > 0);

/** A symbol name as link text: `<module>` is shown as code so it is not read as an HTML tag. */
export const symbolText = (symbol: string): string =>
  symbol.startsWith('<') ? `\`${symbol}\`` : symbol;

/**
 * A link to a consumer's declaration, named after it. Code at the top level of a module has no
 * declaration to point at, so it links the file.
 */
export const consumerLink = (consumer: Consumer, docPath: string): string =>
  consumer.symbol.startsWith('<')
    ? fileLink(
        docPath,
        consumer.loc.file,
        `${symbolText(consumer.symbol)} of ${path.posix.basename(consumer.loc.file)}`,
      )
    : relLink(docPath, consumer.loc, consumer.symbol);

/**
 * One place a consumer is rendered or called: the symbol that does it, and a `<file>:<line>` link
 * to where (the reference, not the symbol's declaration).
 */
export const refText = (ref: Consumer['renderedIn'][number], docPath: string): string =>
  `${symbolText(ref.symbol)} (${ref.how === 'call' ? 'called at ' : ''}${sourceLink(
    docPath,
    ref.loc,
  )})`;

/** Where a query happens: the hook, or the wrapper it goes through and the hook behind it. */
const queryCell = (sites: QuerySite[], docPath: string): string =>
  sites.length === 0
    ? '—'
    : sites
        .map((site) =>
          site.wrapper === undefined
            ? relLink(docPath, site.loc, site.hook)
            : `${relLink(docPath, site.loc, site.wrapper)} → \`${site.hook}\``,
        )
        .join('<br>');

/** The kinds of use, one entry per property path and kind, linking where it first happens. */
const usesCell = (uses: UseSite[], docPath: string): string => {
  const groups = new Map<string, UseSite[]>();
  uses.forEach((use) => {
    const key = `${use.path}\0${use.kind}\0${String(use.direct)}`;
    groups.set(key, [...(groups.get(key) ?? []), use]);
  });
  if (groups.size === 0) {
    return '—';
  }
  return [...groups.values()]
    .map((group) => {
      const [first] = group;
      const oneOf = first.oneOf ? `, one of: ${first.oneOf.join(', ')}` : '';
      const more = group.length > 1 ? ` (+${group.length - 1} more)` : '';
      return `\`${first.path}\` — ${first.kind}, ${
        first.direct ? 'direct' : 'derived'
      }${oneOf} (${sourceLink(docPath, first.loc)}${more})`;
    })
    .join('<br>');
};

/** Where a consumer is rendered or called, one hop up. */
export const renderedInCell = (consumer: Consumer, docPath: string): string =>
  consumer.renderedIn.length === 0
    ? '—'
    : consumer.renderedIn.map((ref) => refText(ref, docPath)).join('<br>');

/** The `## Consumes` section: the extension points this package's code queries or uses. */
export const renderConsumes = (
  model: ExtensionMapModel,
  pkg: Pkg,
  docPath: string,
): string | undefined => {
  const own = new Set(
    model.consumers.filter((consumer) => consumer.pkg === pkg.name).map((c) => c.id),
  );
  const pointIds = [
    ...new Set([
      ...model.querySites.filter((site) => own.has(site.consumer)).flatMap((s) => s.pointIds),
      ...model.useSites.filter((use) => own.has(use.consumer)).map((use) => use.pointId),
    ]),
  ].toSorted();
  if (pointIds.length === 0) {
    return undefined;
  }
  return joinBlocks([
    '## Consumes',
    oneLine(`The extension points this package's code queries or uses, one table per point. A
       use is a property read from an extension, followed wherever the extension is passed;
       "rendered in" is one hop up: where the consumer itself is rendered or called.`),
    ...pointIds.map((pointId) => {
      const point = model.points.find((candidate) => candidate.id === pointId);
      return joinBlocks([
        `### ${consumesHeading(pointId)}`,
        point ? `Defined in ${pointLink(docPath, point, model)}.` : undefined,
        table(
          ['Consumer', 'Query', 'Uses', 'Rendered in'],
          consumersOf(model, pointId, pkg.name).map(({ consumer, querySites, uses }) => [
            consumerLink(consumer, docPath),
            queryCell(querySites, docPath),
            usesCell(uses, docPath),
            renderedInCell(consumer, docPath),
          ]),
        ),
      ]);
    }),
  ]);
};
