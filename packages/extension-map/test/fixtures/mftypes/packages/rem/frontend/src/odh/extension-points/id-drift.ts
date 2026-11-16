import type { Extension } from '@openshift/dynamic-plugin-sdk';

/** Point whose ID drifted in source after the copy was committed. */
export type DriftP = Extension<'rem.drift.source', { note: string }>;
