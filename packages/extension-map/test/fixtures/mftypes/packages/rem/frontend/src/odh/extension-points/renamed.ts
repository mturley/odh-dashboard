import type { Extension } from '@openshift/dynamic-plugin-sdk';

/** Point `rem.stale` summary. */
export type RemStale = Extension<'rem.stale', { note: string }>;

/** Guard for the `rem.stale` point, renamed after the copy was committed. */
export const isRenamedP = (e: Extension): e is RemStale => e.type === 'rem.stale';
