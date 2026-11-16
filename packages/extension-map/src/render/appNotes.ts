import path from 'path';
import { relLink } from './links';
import { joinBlocks, table } from './markdown';
import { valueCell } from './values';
import type { ExtensionMapModel, ExtensionRecord, Override } from '../model/types';

/** The column that names the apps including a contribution. */
export const INCLUDED_IN = 'Included in';

/** True when the model has app composition to show. */
export const hasApps = (model: ExtensionMapModel): boolean => model.apps.length > 0;

/**
 * The apps that include a contribution: `host`, `rhaii (conditional)`, … An app that includes it
 * both always and conditionally is named once, without the mark.
 */
export const includedInCell = (record: ExtensionRecord): string => {
  const always = new Set(record.apps.filter((a) => !a.conditional).map((a) => a.app));
  const conditional = new Set(
    record.apps.filter((a) => a.conditional && !always.has(a.app)).map((a) => a.app),
  );
  const names = [
    ...[...always].map((app) => ({ app, text: app })),
    ...[...conditional].map((app) => ({ app, text: `${app} (conditional)` })),
  ]
    .toSorted((a, b) => (a.app < b.app ? -1 : a.app > b.app ? 1 : 0))
    .map((item) => item.text);
  return names.length === 0 ? '—' : names.join(', ');
};

/** What an override does to the contribution it targets, in words. */
const effectText = (override: Override, record: ExtensionRecord, docPath: string): string => {
  if (override.kind === 'suppress') {
    return 'suppressed';
  }
  if (override.kind === 'redefine') {
    return 'redefined';
  }
  const fields = Object.entries(override.patch ?? {})
    .filter(([key]) => !(override.ignoredKeys ?? []).includes(key))
    .map(([key, value]) => `\`${key}\` = ${valueCell(value, { docPath, record, label: key })}`)
    .join(', ');
  const ignored =
    override.ignoredKeys && override.ignoredKeys.length > 0
      ? ` (ignored: ${override.ignoredKeys.map((key) => `\`${key}\``).join(', ')})`
      : '';
  if (override.effect === 'noop-suppressed') {
    return `patch has no effect: suppressed (would set ${fields || 'nothing'})`;
  }
  if (override.effect === 'unresolved') {
    return `may be patched (not proven): ${fields || 'nothing'}${ignored}`;
  }
  return `patched if in use: ${fields || 'nothing'}${ignored}`;
};

/**
 * The "Suppressed / patched in" note under one point's table: every override an app applies to
 * these contributions, each linked to the extension that performs it.
 */
export const overrideNotes = (
  records: ExtensionRecord[],
  model: ExtensionMapModel,
  docPath: string,
  labels: Map<string, string>,
): string | undefined => {
  const byKey = new Map(model.extensions.map((record) => [record.key, record]));
  const rows = records.flatMap((record) =>
    model.overrides
      .filter((override) => override.targets.includes(record.key))
      .map((override) => {
        const by = byKey.get(override.by);
        return [
          labels.get(record.key) ?? '',
          override.app,
          effectText(override, record, docPath),
          by ? relLink(docPath, by.loc, `${path.posix.basename(by.loc.file)}:${by.loc.line}`) : '—',
        ];
      }),
  );
  return rows.length === 0
    ? undefined
    : joinBlocks([
        '**Suppressed / patched in** (overrides an app applies to these contributions):',
        table(['Contribution', 'App', 'Effect', 'By'], rows),
      ]);
};
