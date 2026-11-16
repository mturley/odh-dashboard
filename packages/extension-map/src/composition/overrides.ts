import { makeDiagnostic } from '../model/diagnostics';
import type { App, Diagnostic, ExtensionRecord, Override, Value } from '../model/types';

const SUPPRESS_TYPE = 'app.suppress';
const PATCH_TYPE = 'app.patch';

/**
 * The extension types an `app.patch` may target: the keys of `PATCH_SCHEMAS` in
 * `packages/plugin-core/src/core/extensionResolution.ts`. The store drops a patch of any other
 * type. Every one of them uses the nav patch schema (`nav-patch.ts`). A repo test guards that
 * this list and the store's stay equal.
 */
export const PATCHABLE_TYPES: readonly string[] = [
  'app.navigation/href',
  'app.navigation/section',
  'app.tab-route/page',
];

/** `NAV_PATCH_KEYS` of `nav-patch.ts`: the keys a patch applies; any other key is ignored. */
export const NAV_PATCH_KEYS: readonly string[] = [
  'title',
  'group',
  'section',
  'label',
  'dataAttributes',
];

/** `CLEARABLE_NAV_PATCH_KEYS` of `nav-patch.ts`: the keys a patch may set to `null`. */
export const CLEARABLE_NAV_PATCH_KEYS: readonly string[] = ['section', 'label'];

/** `OBJECT_NAV_PATCH_KEYS` of `nav-patch.ts`: the keys whose value is a map of strings. */
export const OBJECT_NAV_PATCH_KEYS: readonly string[] = ['dataAttributes'];

/** `DATA_ATTRIBUTE_KEY` of `nav-patch.ts`. */
export const DATA_ATTRIBUTE_KEY = /^data-[a-z0-9-]+$/;

/** What the analysis can prove about a value the store checks: valid, invalid (why), or unknown. */
type Check = { kind: 'valid' } | { kind: 'invalid'; why: string } | { kind: 'unknown' };

const VALID: Check = { kind: 'valid' };
const UNKNOWN: Check = { kind: 'unknown' };
const invalid = (why: string): Check => ({ kind: 'invalid', why });

/** A value that might still hold anything: the analysis proved nothing about it. */
const isUnproven = (value: Value): boolean =>
  value.kind === 'unresolved' || value.kind === 'mapped' || value.kind === 'reference';

/** The literal a value is proven to hold, or `undefined` when it is not a proven literal. */
const literalOf = (value: Value): { value: string | number | boolean | null } | undefined =>
  value.kind === 'literal' || value.kind === 'constant' || value.kind === 'enumMember'
    ? { value: value.value }
    : undefined;

/** A target half (`targetType`, `targetId`) as the store's `isNonEmptyString` sees it. */
type TargetPart = { kind: 'string'; value: string } | { kind: 'invalid' } | { kind: 'unknown' };

const targetPart = (value: Value | undefined): TargetPart => {
  if (value === undefined) {
    return { kind: 'invalid' };
  }
  if (isUnproven(value)) {
    return { kind: 'unknown' };
  }
  const literal = literalOf(value);
  return typeof literal?.value === 'string' && literal.value !== ''
    ? { kind: 'string', value: literal.value }
    : { kind: 'invalid' };
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

/**
 * What an override names: a valid target, an invalid one the store drops, or one that cannot be
 * proven. An unproven target keeps its `type` when that half is proven.
 */
type Target =
  | { kind: 'key'; type: string; key: string }
  | { kind: 'invalid' }
  | { kind: 'unknown'; type?: string };

const targetOf = (record: ExtensionRecord): Target => {
  const type = targetPart(propAt(record, 'targetType'));
  const id = targetPart(propAt(record, 'targetId'));
  if (type.kind === 'invalid' || id.kind === 'invalid') {
    return { kind: 'invalid' };
  }
  if (type.kind === 'string' && id.kind === 'string') {
    return { kind: 'key', type: type.value, key: keyOf(type.value, id.value) };
  }
  return type.kind === 'string' ? { kind: 'unknown', type: type.value } : { kind: 'unknown' };
};

/** One field of a nav patch, as `isValidNavPatchField` checks it. */
const checkNavField = (field: string, value: Value): Check => {
  if (!NAV_PATCH_KEYS.includes(field)) {
    return VALID;
  }
  if (isUnproven(value)) {
    return UNKNOWN;
  }
  if (OBJECT_NAV_PATCH_KEYS.includes(field)) {
    if (value.kind !== 'object') {
      return invalid(`\`${field}\` is not a map`);
    }
    let result: Check = VALID;
    for (const [key, item] of Object.entries(value.props)) {
      if (!DATA_ATTRIBUTE_KEY.test(key)) {
        return invalid(`\`${field}\` key \`${key}\` does not match ${DATA_ATTRIBUTE_KEY.source}`);
      }
      if (isUnproven(item)) {
        result = UNKNOWN;
      } else if (typeof literalOf(item)?.value !== 'string') {
        return invalid(`\`${field}.${key}\` is not a string`);
      }
    }
    return result;
  }
  const literal = literalOf(value);
  if (typeof literal?.value === 'string') {
    return VALID;
  }
  if (literal?.value === null && CLEARABLE_NAV_PATCH_KEYS.includes(field)) {
    return VALID;
  }
  return invalid(
    CLEARABLE_NAV_PATCH_KEYS.includes(field)
      ? `\`${field}\` is neither a string nor null`
      : `\`${field}\` is not a string`,
  );
};

/** A patch payload, as `isValidNavPatch` checks it. */
const checkNavPatch = (payload: Value | undefined): Check => {
  if (payload === undefined) {
    return invalid('it has no `patch`');
  }
  if (isUnproven(payload)) {
    return UNKNOWN;
  }
  if (payload.kind !== 'object') {
    return invalid('its `patch` is not an object');
  }
  let result: Check = VALID;
  for (const [field, value] of Object.entries(payload.props)) {
    const check = checkNavField(field, value);
    if (check.kind === 'invalid') {
      return check;
    }
    if (check.kind === 'unknown') {
      result = UNKNOWN;
    }
  }
  return result;
};

/** A registration's identity: a proven `(type, id)` key, no string id at all, or an unproven id. */
type Identity = { kind: 'key'; key: string } | { kind: 'none' } | { kind: 'unknown' };

const identityOf = (record: ExtensionRecord): Identity => {
  const id = propAt(record, 'id');
  if (id === undefined) {
    return { kind: 'none' };
  }
  if (isUnproven(id)) {
    return { kind: 'unknown' };
  }
  const literal = literalOf(id);
  // The store reads only a string id; any other proven value means "no id".
  return typeof literal?.value === 'string'
    ? { kind: 'key', key: keyOf(record.type, literal.value) }
    : { kind: 'none' };
};

/** A registration (neither a suppress nor a patch) at its position in the suppress pass. */
type Registration = { record: ExtensionRecord; index: number; identity: Identity };

const uniqueSorted = (keys: string[]): string[] => [...new Set(keys)].toSorted();

/**
 * The target types whose overrides some unproven override makes uncertain. `null` stands for
 * every type: an override whose own target type is unproven.
 */
type Taint = Set<string | null>;

const isTainted = (taint: Taint, type: string): boolean => taint.has(null) || taint.has(type);

/** The taint of the overrides whose target is not proven. */
const taintOf = (targets: Target[]): Taint =>
  new Set(targets.flatMap((target) => (target.kind === 'unknown' ? [target.type ?? null] : [])));

/**
 * Resolves the `app.suppress` and `app.patch` extensions of one app's catalog the way the plugin
 * store does (`packages/plugin-core/src/core/extensionResolution.ts`), without evaluating flags:
 * 1. Patches are taken out of the catalog first. A patch whose target is not two non-empty
 *    strings, whose `targetType` has no patch schema, or whose payload fails the nav patch
 *    schema is dropped, and does not count for "last patch wins".
 * 2. A suppress whose target is not two non-empty strings is dropped. For each
 *    `(targetType, targetId)`, registrations before the last matching suppress are removed; a
 *    later registration of a key whose earlier registrations were removed is a redefine.
 * 3. The last kept patch of each key is applied to the registrations still in the catalog; a
 *    patch "applies" if its target is in use. Keys outside the nav allowlist are ignored.
 *
 * Nothing is guessed. An override whose target, or whose validity, cannot be proven is
 * `unresolved`, and so is everything it could change: an unproven suppress makes every other
 * override of its target type unresolved, an unproven patch every patch of its target type, and
 * a registration of the target type whose `properties.id` is not proven makes the override that
 * could match it unresolved.
 *
 * @param catalog The app's extensions in catalog order. A record may appear more than once.
 */
export const applyOverrides = (
  app: App,
  catalog: ExtensionRecord[],
): { overrides: Override[]; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];
  const report = (code: Diagnostic['code'], record: ExtensionRecord, message: string): void => {
    diagnostics.push(
      makeDiagnostic(code, `In ${app.id}: ${message}`, record.loc, record.pkg, record.type),
    );
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

  // 1. Patches leave the catalog before anything else happens.
  const patches = catalog.filter((record) => record.type === PATCH_TYPE);
  const rest = catalog.filter((record) => record.type !== PATCH_TYPE);

  // 2. Suppress, by position in what is left. Dropped suppresses do not count.
  const lastSuppress = new Map<string, number>();
  const suppressTargets = new Map<number, Target>();
  rest.forEach((record, index) => {
    if (record.type !== SUPPRESS_TYPE) {
      return;
    }
    const target = targetOf(record);
    suppressTargets.set(index, target);
    if (target.kind === 'key') {
      lastSuppress.set(target.key, index);
    }
  });
  const suppressTaint = taintOf([...suppressTargets.values()]);
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
  const uncertain = (record: ExtensionRecord, why: string): void => {
    report('unresolved-override', record, why);
  };
  const taintedBySuppress = (type: string): string =>
    `a suppress in this catalog names a target that is not proven, so whether it also removes ${type} registrations is unknown.`;

  rest.forEach((record, index) => {
    if (record.type === SUPPRESS_TYPE) {
      const target = suppressTargets.get(index) ?? { kind: 'invalid' };
      if (target.kind === 'invalid') {
        report(
          'suppress-dropped',
          record,
          'the plugin store drops this suppress: its targetType and targetId are not both non-empty strings.',
        );
        overrides.push({ kind: 'suppress', ...base(record), targets: [], effect: 'dropped' });
        return;
      }
      if (target.kind === 'unknown') {
        uncertain(
          record,
          'the target of this suppress is not a proven (targetType, targetId) pair, so what it removes is unknown.',
        );
        overrides.push({ kind: 'suppress', ...base(record), targets: [], effect: 'unresolved' });
        return;
      }
      const before = registrations.filter((reg) => reg.index < index);
      const removed = uniqueSorted(
        before.filter((reg) => hasKey(reg, target.key)).map((reg) => reg.record.key),
      );
      // This suppress names a proven key, so any taint on its type comes from another one.
      if (isTainted(suppressTaint, target.type)) {
        uncertain(record, taintedBySuppress(target.type));
        overrides.push({
          kind: 'suppress',
          ...base(record),
          targets: removed,
          effect: 'unresolved',
        });
        return;
      }
      if (before.some((reg) => isUnknownOfType(reg, target.type))) {
        uncertain(
          record,
          `a ${target.type} extension in the catalog has an id that is not proven, so it may also be a target of this suppress.`,
        );
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
    // A registration after the last suppress of its key, replacing what that suppress removed.
    const reg = registrations.find((candidate) => candidate.index === index);
    if (reg?.identity.kind !== 'key') {
      return;
    }
    const { key } = reg.identity;
    const at = lastSuppress.get(key);
    if (at === undefined || index < at) {
      return;
    }
    const replaced = uniqueSorted(
      registrations
        .filter((other) => hasKey(other, key) && isRemoved(other))
        .map((other) => other.record.key),
    );
    if (replaced.length === 0) {
      return;
    }
    const tainted = isTainted(suppressTaint, record.type);
    if (tainted) {
      uncertain(record, taintedBySuppress(record.type));
    }
    overrides.push({
      kind: 'redefine',
      app: app.id,
      by: record.key,
      targetType: { kind: 'literal', value: record.type },
      targetId: propAt(record, 'id') ?? missing(record, 'id'),
      targets: replaced,
      effect: tainted ? 'unresolved' : 'applied',
    });
  });

  // 3. Patches: which ones the store keeps, then the last kept one per key wins.
  type PatchCheck = { record: ExtensionRecord; target: Target; check: Check };
  const checked: PatchCheck[] = patches.map((record) => {
    const target = targetOf(record);
    if (target.kind === 'invalid') {
      return {
        record,
        target,
        check: invalid('its targetType and targetId are not both non-empty strings'),
      };
    }
    if (target.type !== undefined && !PATCHABLE_TYPES.includes(target.type)) {
      return { record, target, check: invalid(`${target.type} has no patch schema`) };
    }
    return { record, target, check: checkNavPatch(propAt(record, 'patch')) };
  });
  const patchTaint = taintOf(checked.map(({ target }) => target));

  checked.forEach(({ record, target, check }, index) => {
    const payload = propAt(record, 'patch');
    const patch = payload?.kind === 'object' ? payload.props : undefined;
    const ignoredKeys = Object.keys(patch ?? {}).filter((key) => !NAV_PATCH_KEYS.includes(key));
    const common = {
      kind: 'patch' as const,
      ...base(record),
      ...(patch ? { patch } : {}),
      ...(ignoredKeys.length > 0 ? { ignoredKeys } : {}),
    };
    if (check.kind === 'invalid') {
      report('patch-dropped', record, `the plugin store drops this patch: ${check.why}.`);
      overrides.push({ ...common, targets: [], effect: 'dropped' });
      return;
    }
    if (target.kind !== 'key') {
      uncertain(
        record,
        'the target of this patch is not a proven (targetType, targetId) pair, so what it changes is unknown.',
      );
      overrides.push({ ...common, targets: [], effect: 'unresolved' });
      return;
    }
    if (check.kind === 'unknown') {
      uncertain(
        record,
        'the patch payload is not proven valid, so whether the plugin store keeps it is unknown.',
      );
      overrides.push({ ...common, targets: [], effect: 'unresolved' });
      return;
    }
    const later = checked.slice(index + 1).filter((other) => {
      if (other.check.kind === 'invalid') {
        return false;
      }
      return other.target.kind === 'key' && other.target.key === target.key;
    });
    const matches = registrations.filter((reg) => hasKey(reg, target.key));
    const inUse = uniqueSorted(
      matches.filter((reg) => !isRemoved(reg)).map((reg) => reg.record.key),
    );
    // This patch names a proven key, so any taint on its type comes from another patch.
    if (
      later.some((other) => other.check.kind === 'unknown') ||
      isTainted(patchTaint, target.type)
    ) {
      uncertain(
        record,
        `another patch of ${target.type} has an unproven target or validity, so whether this one wins is unknown.`,
      );
      overrides.push({ ...common, targets: inUse, effect: 'unresolved' });
      return;
    }
    if (later.length > 0) {
      overrides.push({ ...common, targets: [], effect: 'superseded' });
      return;
    }
    const suppressed = uniqueSorted(
      matches.filter((reg) => isRemoved(reg)).map((reg) => reg.record.key),
    );
    if (
      isTainted(suppressTaint, target.type) ||
      registrations.some((reg) => isUnknownOfType(reg, target.type))
    ) {
      uncertain(
        record,
        `which ${target.type} registrations are in use cannot be proven, so whether this patch applies is unknown.`,
      );
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
