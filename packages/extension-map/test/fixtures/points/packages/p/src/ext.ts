import type { CodeRef, Extension } from '@openshift/dynamic-plugin-sdk';

export type FxField = { id: string; run: () => void };

export type FxProps = { label: string };

/** A repo alias of `CodeRef`, like plugin-core's `ComponentCodeRef`. */
export type ComponentCodeRef<Props = FxProps> = CodeRef<{ default: (props: Props) => string }>;

/**
 * The alias form of a fixture point.
 *
 * @remarks Declared as an alias body. The interface form is {@link FxB}.
 * @category Wizard
 * @see the fx.b point
 */
export type FxA<T = unknown> = Extension<
  'fx.a',
  {
    /** A code reference to a field definition. */
    field: CodeRef<FxField>;
    /** A code reference to an inline type. */
    inline: CodeRef<{ x: number }>;
    /** A code reference declared through an alias of `CodeRef`. */
    widget: ComponentCodeRef<FxProps>;
    label?: string;
    data: T;
  }
>;

export const isFxA = (e: Extension): e is FxA => e.type === 'fx.a';

/** Narrows to `FxA` but compares against the wrong literal. */
export const isFxAMistyped = (e: Extension): e is FxA => e.type === 'fx.oops';

export const makeFxAGuard =
  () =>
  (e: Extension): e is FxA =>
    e.type === 'fx.a';

export interface FxB extends Extension<'fx.b', { name: string }> {}

/**
 * @param e the extension to check
 */
export type FxC = Extension<'fx.c', { count: number }> & { extra?: boolean };

export const FX_D = 'fx.d';

export type FxD = Extension<typeof FX_D, { enabled: boolean }>;

export const isFxD = (e: Extension): e is FxD => e.type === FX_D;

/** A specialization of a point, not a point of its own. */
export type Mine = FxA<string>;

/** A union of points, not a point of its own. */
export type Either = FxA | FxB;
