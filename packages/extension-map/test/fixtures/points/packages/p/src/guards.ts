import type { Extension } from '@openshift/dynamic-plugin-sdk';
import type { FxB } from './ext';

export const createGuard =
  <T extends Extension>(type: string) =>
  (e: Extension): e is T =>
    e.type === type;

export const isFxB = createGuard<FxB>('fx.b');

export type FxZ = { type: 'fx.z'; properties: { z: number } };

export const isFxZ = (e: Extension): e is FxZ => e.type === 'fx.z';

type FxDataField = { type: 'short-text' | 'uri'; properties: { label: string } };
type FxSectionField = { type: 'section'; properties: { label: string } };
type FxAnyField = FxDataField | FxSectionField;

/** Narrows a union that carries `type` and `properties` but has nothing to do with extensions. */
export const isFxDataField = (field: FxAnyField): field is FxDataField =>
  field.type !== 'section';
