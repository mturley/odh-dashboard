import type { Extension } from '@openshift/dynamic-plugin-sdk';

/** A generic helper: its receiver names no point. */
export const propertyOf = <T extends Extension>(e: T, key: string): unknown => e.properties[key];

/** Another generic helper reading a named property. */
export const labelOf = <T extends Extension<string, { label: string }>>(e: T): string =>
  e.properties.label;
