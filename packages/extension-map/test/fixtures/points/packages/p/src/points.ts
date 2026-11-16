import type { CodeRef, Extension, ExtensionPredicate } from '@openshift/dynamic-plugin-sdk';

/**
 * A field contributed to the `fx.a` point.
 *
 * @extensionData fx.a.carried
 */
export type FxField = {
  id: string;
  label: string;
};

/**
 * Point `fx.a` summary referencing {@link FxB}.
 *
 * @remarks Remarks about the fx.a point.
 * @category Wizard
 */
export type FxA<T = string> = Extension<
  'fx.a',
  {
    /** The field the extension provides. */
    field: CodeRef<FxField>;
    title: T;
  }
>;

export const isFxA = (e: Extension): e is FxA => e.type === 'fx.a';

/** A guard whose compared literal disagrees with its predicate. */
export const isFxAWithWrongLiteral = (e: Extension): e is FxA => e.type === 'fx.wrong';

const createGuard = <TExtension extends Extension>(
  type: string,
): ExtensionPredicate<TExtension> => {
  const guard = (e: Extension): e is TExtension => e.type === type;
  return guard;
};

/** Point `fx.b` summary. */
export interface FxB extends Extension<'fx.b', { title: string }> {}

export const isFxB = createGuard<FxB>('fx.b');

/** A factory guard whose argument disagrees with its predicate. */
export const isFxBWithWrongArgument = createGuard<FxB>('fx.wrong');

/**
 * @param field the field
 */
export type FxC = Extension<'fx.c', { id: string; note?: string }> & { extra: boolean };

export const FX_D = 'fx.d';

/**
 * Point `fx.d` summary.
 *
 * @deprecated Use fx.a instead.
 * @see FxA
 * @extensionData fx.d.carried
 */
export type FxD = Extension<typeof FX_D, { count: number }>;

export const isFxD = (e: Extension): e is FxD => e.type === FX_D;

/** A specialization of another point is not itself a point. */
export type Specialization = FxA<number>;

/** A union of points is not a point. */
export type Union = FxA | FxB;

/** A type with a literal `type` property but no point declaration. */
export type ZExt = {
  type: 'fx.z';
  properties: { z: string };
};

export const isFz = (e: Extension): e is ZExt => e.type === 'fx.z';

/** A field-kind marker excluded by negative comparison, as connection-type guards do. */
export enum FxFieldKind {
  Section = 'fx.section',
}

/** Excluding a kind cannot prove a literal disagrees with the predicate. */
export const isFzNotSection = (e: Extension): e is ZExt => e.type !== FxFieldKind.Section;

/** A function returning a predicate function is a parameterized guard. */
export const guardForZ =
  (id: string): ExtensionPredicate<ZExt> =>
  (e): e is ZExt =>
    e.type === id;
