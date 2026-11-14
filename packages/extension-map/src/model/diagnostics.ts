import type { Diagnostic, DiagnosticCode, Loc } from './types';

/**
 * Builds a diagnostic. Severity defaults to `'warning'` (use an explicit
 * object for `'info'` diagnostics).
 */
export const makeDiagnostic = (
  code: DiagnosticCode,
  message: string,
  loc?: Loc,
  pkg?: string,
): Diagnostic => ({
  code,
  severity: 'warning',
  message,
  ...(loc !== undefined ? { loc } : {}),
  ...(pkg !== undefined ? { pkg } : {}),
});
