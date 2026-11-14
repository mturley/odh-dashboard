import type { Diagnostic, DiagnosticCode, Loc } from './types';

const INFO_CODES: ReadonlySet<DiagnosticCode> = new Set<DiagnosticCode>([
  'point-unused',
  'point-no-contributors',
  'point-no-consumers',
  'federation-not-loaded',
]);

export const makeDiagnostic = (
  code: DiagnosticCode,
  message: string,
  loc?: Loc,
  pkg?: string,
): Diagnostic => ({
  code,
  severity: INFO_CODES.has(code) ? 'info' : 'warning',
  message,
  ...(loc ? { loc } : {}),
  ...(pkg ? { pkg } : {}),
});
