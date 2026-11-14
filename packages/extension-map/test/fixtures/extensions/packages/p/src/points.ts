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
