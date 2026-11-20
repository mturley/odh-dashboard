import path from 'path';
import { contributesLink, pkgDisplayName, relLink } from './links';
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

/** The column that says what an override an app applies actually does. */
export const EFFECT = 'Effect';

/**
 * The overrides an app applies by declaring this very extension: its `app.suppress` or
 * `app.patch` entries. A redefine is not one — it is an ordinary registration the store keeps.
 */
const overridesBy = (record: ExtensionRecord, model: ExtensionMapModel): Override[] =>
  model.overrides.filter((override) => override.by === record.key && override.kind !== 'redefine');

/** True when any of these contributions is itself a suppress or patch an app applies. */
export const hasOverrideEffects = (records: ExtensionRecord[], model: ExtensionMapModel): boolean =>
  records.some((record) => overridesBy(record, model).length > 0);

/** The name an override's target goes by: the `targetId` it names, when it names one. */
const targetName = (override: Override, target: ExtensionRecord): string => {
  const { targetId } = override;
  if (
    targetId.kind === 'literal' ||
    targetId.kind === 'constant' ||
    targetId.kind === 'enumMember'
  ) {
    return String(targetId.value);
  }
  return path.posix.basename(target.loc.file);
};

/** What one override does, in words, from the point of view of the extension that performs it. */
const outcomeText = (
  override: Override,
  model: ExtensionMapModel,
  docPath: string,
): string | undefined => {
  switch (override.effect) {
    case 'noop-suppressed':
      return 'no effect — target suppressed';
    case 'noop-missing':
      return 'no effect — nothing registers that key';
    case 'dropped':
      return 'no effect — the plugin store discards it';
    case 'superseded':
      return 'no effect — a later override of the same key wins';
    case 'unresolved':
      return 'not proven';
    default:
      break;
  }
  const [verb, preposition] =
    override.kind === 'suppress' ? ['removes', 'from'] : ['patches', 'in'];
  const byKey = new Map(model.extensions.map((record) => [record.key, record]));
  const targets = override.targets.flatMap((key) => {
    const target = byKey.get(key);
    if (!target) {
      return [];
    }
    const owner = model.packages.find((candidate) => candidate.name === target.pkg);
    const name = targetName(override, target);
    return [
      `${owner ? contributesLink(docPath, target.type, owner, name) : name} ${preposition} ${
        owner ? pkgDisplayName(owner) : target.pkg
      }`,
    ];
  });
  return targets.length === 0 ? undefined : `${verb} ${[...new Set(targets)].join(', ')}`;
};

/**
 * The `Effect` cell of one override extension: what it does in each app that applies it, on the
 * page of the package that declares it.
 */
export const effectCell = (
  record: ExtensionRecord,
  model: ExtensionMapModel,
  docPath: string,
): string => {
  const parts = overridesBy(record, model).flatMap((override) => {
    const outcome = outcomeText(override, model, docPath);
    return outcome === undefined ? [] : [`${override.app}: ${outcome}`];
  });
  return parts.length === 0 ? '—' : parts.join('<br>');
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
