import { makeDiagnostic } from '../model/diagnostics';
import type { App, Diagnostic, ExtensionRecord, Override, Value } from '../model/types';

const SUPPRESS_TYPE = 'app.suppress';
const PATCH_TYPE = 'app.patch';

/** The keys the plugin store applies from a patch; any other key is ignored. */
const PATCH_ALLOWLIST: ReadonlySet<string> = new Set([
  'title',
  'group',
  'section',
  'label',
  'dataAttributes',
]);

/**
 * The string a value is proven to hold: a literal, a constant or an enum member. Anything else
 * (an unresolved expression, a mapped element, code) proves nothing.
 */
const provenString = (value: Value | undefined): string | undefined => {
  if (value?.kind === 'literal' || value?.kind === 'constant' || value?.kind === 'enumMember') {
    return typeof value.value === 'string' ? value.value : undefined;
  }
  return undefined;
};

/** The same collision-free key the plugin store builds for `(type, id)`. */
const keyOf = (type: string, id: string): string => JSON.stringify([type, id]);

const propAt = (record: ExtensionRecord, name: string): Value | undefined =>
  Object.hasOwn(record.properties, name) ? record.properties[name] : undefined;

const missing = (record: ExtensionRecord, name: string): Value => ({
  kind: 'unresolved',
  reason: `no ${name}`,
  loc: record.loc,
});

/** A registration's identity: a proven `(type, id)` key, no id at all, or an unproven id. */
type Identity = { kind: 'key'; key: string } | { kind: 'none' } | { kind: 'unknown' };

const identityOf = (record: ExtensionRecord): Identity => {
  const id = propAt(record, 'id');
  if (id === undefined) {
    return { kind: 'none' };
  }
  const proven = provenString(id);
  return proven === undefined
    ? { kind: 'unknown' }
    : { kind: 'key', key: keyOf(record.type, proven) };
};

/** A registration (neither a suppress nor a patch) at its position in the suppress pass. */
type Registration = { record: ExtensionRecord; index: number; identity: Identity };

/** The target an override names, when both halves are proven strings. */
type Target = { type: string; key: string } | undefined;

const targetOf = (record: ExtensionRecord): Target => {
  const type = provenString(propAt(record, 'targetType'));
  const id = provenString(propAt(record, 'targetId'));
  return type === undefined || id === undefined ? undefined : { type, key: keyOf(type, id) };
};

const uniqueSorted = (keys: string[]): string[] => [...new Set(keys)].toSorted();

/**
 * Resolves the `app.suppress` and `app.patch` extensions of one app's catalog the way the plugin
 * store does (`packages/plugin-core/src/core/extensionResolution.ts`), without evaluating flags:
 * 1. Patches are taken out of the catalog first.
 * 2. For each `(targetType, targetId)`, registrations before the last matching suppress are
 *    removed; later registrations of that key are redefines.
 * 3. The last patch of each key is applied to the registrations still in the catalog; a patch
 *    "applies" if its target is in use. Only allowlisted keys are applied.
 *
 * A key is matched only when it is proven: an override whose target is not a proven string, or a
 * candidate registration whose `properties.id` is not, makes the override `unresolved`.
 *
 * @param catalog The app's extensions in catalog order. A record may appear more than once.
 */
export const applyOverrides = (
  app: App,
  catalog: ExtensionRecord[],
): { overrides: Override[]; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];
  const report = (code: Diagnostic['code'], record: ExtensionRecord, message: string): void => {
    diagnostics.push(makeDiagnostic(code, `In ${app.id}: ${message}`, record.loc, record.pkg));
  };

  // 1. Patches leave the catalog before anything else happens.
  const patches = catalog.filter((record) => record.type === PATCH_TYPE);
  const rest = catalog.filter((record) => record.type !== PATCH_TYPE);

  // 2. Suppress, by position in what is left.
  const lastSuppress = new Map<string, number>();
  rest.forEach((record, index) => {
    const target = record.type === SUPPRESS_TYPE ? targetOf(record) : undefined;
    if (target) {
      lastSuppress.set(target.key, index);
    }
  });
  const registrations: Registration[] = rest.flatMap((record, index) =>
    record.type === SUPPRESS_TYPE ? [] : [{ record, index, identity: identityOf(record) }],
  );
  const hasKey = (reg: Registration, key: string): boolean =>
    reg.identity.kind === 'key' && reg.identity.key === key;
  const isUnknownOfType = (reg: Registration, type: string): boolean =>
    reg.identity.kind === 'unknown' && reg.record.type === type;
  const isRemoved = (reg: Registration): boolean => {
    if (reg.identity.kind !== 'key') {
      return false;
    }
    const at = lastSuppress.get(reg.identity.key);
    return at !== undefined && reg.index < at;
  };

  const overrides: Override[] = [];
  const base = (
    record: ExtensionRecord,
  ): Pick<Override, 'app' | 'by' | 'targetType' | 'targetId'> => ({
    app: app.id,
    by: record.key,
    targetType: propAt(record, 'targetType') ?? missing(record, 'targetType'),
    targetId: propAt(record, 'targetId') ?? missing(record, 'targetId'),
  });
  const unresolvedTarget = (record: ExtensionRecord, kind: string): void => {
    report(
      'unresolved-override',
      record,
      `the target of this ${kind} is not a proven (targetType, targetId) pair, so what it affects is unknown.`,
    );
  };
  const unprovenCandidates = (record: ExtensionRecord, kind: string, type: string): void => {
    report(
      'unresolved-override',
      record,
      `a ${type} extension in the catalog has an id that is not proven, so it may also be a target of this ${kind}.`,
    );
  };

  rest.forEach((record, index) => {
    if (record.type === SUPPRESS_TYPE) {
      const target = targetOf(record);
      if (!target) {
        unresolvedTarget(record, 'suppress');
        overrides.push({ kind: 'suppress', ...base(record), targets: [], effect: 'unresolved' });
        return;
      }
      const before = registrations.filter((reg) => reg.index < index);
      const removed = uniqueSorted(
        before.filter((reg) => hasKey(reg, target.key)).map((reg) => reg.record.key),
      );
      if (before.some((reg) => isUnknownOfType(reg, target.type))) {
        unprovenCandidates(record, 'suppress', target.type);
        overrides.push({
          kind: 'suppress',
          ...base(record),
          targets: removed,
          effect: 'unresolved',
        });
        return;
      }
      if (removed.length === 0) {
        report(
          'suppress-no-match',
          record,
          `nothing before this suppress of ${target.key} registers that key, so it removes nothing.`,
        );
        overrides.push({ kind: 'suppress', ...base(record), targets: [], effect: 'noop-missing' });
        return;
      }
      overrides.push({ kind: 'suppress', ...base(record), targets: removed, effect: 'removed' });
      return;
    }
    // A registration after the last suppress of its key is a redefine.
    const reg = registrations.find((candidate) => candidate.index === index);
    if (reg?.identity.kind !== 'key') {
      return;
    }
    const { key } = reg.identity;
    const at = lastSuppress.get(key);
    if (at === undefined || index < at) {
      return;
    }
    overrides.push({
      kind: 'redefine',
      app: app.id,
      by: record.key,
      targetType: { kind: 'literal', value: record.type },
      targetId: propAt(record, 'id') ?? missing(record, 'id'),
      targets: uniqueSorted(
        registrations
          .filter((other) => hasKey(other, key) && isRemoved(other))
          .map((other) => other.record.key),
      ),
      effect: 'applied',
    });
  });

  // 3. Patches: the last one per key wins, applied to what the suppress pass left.
  const lastPatch = new Map<string, number>();
  patches.forEach((record, index) => {
    const target = targetOf(record);
    if (target) {
      lastPatch.set(target.key, index);
    }
  });
  patches.forEach((record, index) => {
    const target = targetOf(record);
    const payload = propAt(record, 'patch');
    if (!target || payload?.kind !== 'object') {
      if (target) {
        report(
          'unresolved-override',
          record,
          'the patch payload is not an object literal, so what it changes is unknown.',
        );
      } else {
        unresolvedTarget(record, 'patch');
      }
      overrides.push({
        kind: 'patch',
        ...base(record),
        targets: [],
        effect: 'unresolved',
        ...(payload?.kind === 'object' ? { patch: payload.props } : {}),
      });
      return;
    }
    const patch = payload.props;
    const ignoredKeys = Object.keys(patch).filter((key) => !PATCH_ALLOWLIST.has(key));
    const common = {
      kind: 'patch' as const,
      ...base(record),
      patch,
      ...(ignoredKeys.length > 0 ? { ignoredKeys } : {}),
    };
    if (lastPatch.get(target.key) !== index) {
      overrides.push({ ...common, targets: [], effect: 'superseded' });
      return;
    }
    const matches = registrations.filter((reg) => hasKey(reg, target.key));
    const inUse = uniqueSorted(
      matches.filter((reg) => !isRemoved(reg)).map((reg) => reg.record.key),
    );
    const suppressed = uniqueSorted(
      matches.filter((reg) => isRemoved(reg)).map((reg) => reg.record.key),
    );
    if (registrations.some((reg) => isUnknownOfType(reg, target.type))) {
      unprovenCandidates(record, 'patch', target.type);
      overrides.push({ ...common, targets: inUse, effect: 'unresolved' });
      return;
    }
    if (ignoredKeys.length > 0) {
      report(
        'patch-ignored-keys',
        record,
        `the plugin store ignores the patch keys ${ignoredKeys.join(', ')} of ${target.key}.`,
      );
    }
    if (inUse.length > 0) {
      overrides.push({ ...common, targets: inUse, effect: 'applied' });
    } else if (suppressed.length > 0) {
      report(
        'patch-noop-suppressed',
        record,
        `every registration of ${target.key} is suppressed, so this patch has nothing to apply to.`,
      );
      overrides.push({ ...common, targets: suppressed, effect: 'noop-suppressed' });
    } else {
      report(
        'patch-noop-missing',
        record,
        `nothing registers ${target.key}, so this patch has nothing to apply to.`,
      );
      overrides.push({ ...common, targets: [], effect: 'noop-missing' });
    }
  });

  const position = new Map(catalog.map((record, index) => [record.key, index]));
  return {
    overrides: overrides.toSorted((a, b) => (position.get(a.by) ?? 0) - (position.get(b.by) ?? 0)),
    diagnostics,
  };
};
