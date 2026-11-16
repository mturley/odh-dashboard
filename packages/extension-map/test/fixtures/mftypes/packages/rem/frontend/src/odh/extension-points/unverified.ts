import type { Extension } from '@openshift/dynamic-plugin-sdk';

/** Fresh point whose source is not part of the consumer program. */
export type UnvP = Extension<'rem.unv', { note: string }>;
