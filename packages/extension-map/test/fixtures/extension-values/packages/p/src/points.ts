import type { Extension } from '@openshift/dynamic-plugin-sdk';

export type FxRoute = Extension<'fx.route', { path: string; after?: string }>;
export type FxShared = Extension<'fx.shared', { id: string }>;
export type FxField = Extension<'fx.field', { field: unknown }>;
export type FxValue = Extension<'fx.value', { values: unknown }>;
