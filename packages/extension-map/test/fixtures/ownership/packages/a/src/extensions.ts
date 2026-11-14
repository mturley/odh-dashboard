import type { Extension, LoadedExtension } from '@openshift/dynamic-plugin-sdk';

export type FxA = Extension<'fx.a', { x: number }>;

export interface LiteralExt extends Extension<'fx.a', { x: number }> {}

export type OtherExt = Extension<'fx.b', { y: string }>;

export type UnionExt = LiteralExt | OtherExt;

export type AnyExt = { type: string; properties: { x: number } };

export type LoadedExt = LoadedExtension<FxA>;

export const isLiteralExt = (e: Extension): e is LiteralExt => e.type === 'fx.a';

export const notAGuard = (e: Extension): boolean => e.type === 'fx.a';
