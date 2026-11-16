import type { Diagnostic, ExtensionRecord } from '../model/types';

/** Plain-data result retained after the program that discovered extensions is released. */
export type ExtensionsResult = { extensions: ExtensionRecord[]; diagnostics: Diagnostic[] };
