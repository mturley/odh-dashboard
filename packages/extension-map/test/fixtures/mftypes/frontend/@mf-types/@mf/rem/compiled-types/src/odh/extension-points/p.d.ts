import type { CodeRef, Extension } from '@openshift/dynamic-plugin-sdk';
/** The data a `rem.p` extension carries. */
export type RemData = {
    id: string;
};
/** A fixture point declared by the remote itself. */
export type RemP = Extension<'rem.p', {
    data: CodeRef<RemData>;
}>;
export declare const isRemP: (e: Extension) => e is RemP;
