import type { Diagnostic, DiagnosticCode, Loc } from './types';

/**
 * Codes that report a finding about the analyzed code rather than a gap in the generated map: an
 * unused point, a federation declared but never loaded, and an override the plugin store does
 * nothing with (the analysis proved the outcome; the code is what is surprising).
 */
const INFO_CODES: ReadonlySet<DiagnosticCode> = new Set<DiagnosticCode>([
  'point-unused',
  'point-no-contributors',
  'point-no-consumers',
  'federation-not-loaded',
  'patch-noop-suppressed',
  'patch-noop-missing',
  'patch-ignored-keys',
  'patch-dropped',
  'suppress-no-match',
  'suppress-dropped',
]);

export const makeDiagnostic = (
  code: DiagnosticCode,
  message: string,
  loc?: Loc,
  pkg?: string,
  pointId?: string,
): Diagnostic => ({
  code,
  severity: INFO_CODES.has(code) ? 'info' : 'warning',
  message,
  ...(loc ? { loc } : {}),
  ...(pkg ? { pkg } : {}),
  ...(pointId ? { pointId } : {}),
});
