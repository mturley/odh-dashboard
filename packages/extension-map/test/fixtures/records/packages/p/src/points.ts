import type { CodeRef, Extension } from '@openshift/dynamic-plugin-sdk';

export type FxFieldType = { id: string; label: string; externalDataHook?: () => number };

/** A route of the fixture app. */
export type FxRouteExtension = Extension<
  'app.route',
  { path: string; component: CodeRef<{ default: () => string }> }
>;

/** Shared across both of the fixture package's entries. */
export type FxSharedExtension = Extension<'fx.shared', { id: string }>;

/** Carries a field definition by code reference. */
export type FxFieldExtension = Extension<'fx.field', { field: CodeRef<FxFieldType> }>;

/** Gated by flags written in two different ways. */
export type FxFlaggedExtension = Extension<'fx.flagged', { id: string }>;

/** Built by a `.map()` over an array the walk cannot count. */
export type FxGeneratedExtension = Extension<'fx.generated', { name: string }>;

/** Declared by spreading a base extension and overriding part of it. */
export type FxSpreadExtension = Extension<'fx.spread', { id: string; label: string }>;

/** Bound to a name through `satisfies`, with a code-like constant, a computed path and a call. */
export type FxWrappedExtension = Extension<
  'fx.wrapped',
  {
    schema: { parse: (input: unknown) => string };
    route: string;
    label: string;
    alias: { label: string };
  }
>;
