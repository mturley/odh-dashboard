import ts from 'typescript';

/**
 * Shared parsed `ts.SourceFile`s across streamed programs — the one explicit
 * exception to the "no AST state outlives its program" rule (spec §5.3):
 * parsed files are effectively immutable and sharing them halves pass time.
 */
export type SourceFileCache = { sourceFiles: Map<string, ts.SourceFile> };

export const createSourceFileCache = (): SourceFileCache => ({ sourceFiles: new Map() });

/** The compiler options that affect parsing (and therefore cache identity). */
const CACHE_OPTION_KEYS = [
  'target',
  'module',
  'moduleDetection',
  'jsx',
  'jsxImportSource',
  'allowJs',
  'experimentalDecorators',
  'useDefineForClassFields',
  'strict',
  'alwaysStrict',
  'isolatedModules',
  'verbatimModuleSyntax',
] as const;

/** The form `ts.CreateSourceFileOptions.impliedNodeFormat` takes (not exported publicly). */
type ImpliedNodeFormat = ts.ModuleKind.CommonJS | ts.ModuleKind.ESNext | undefined;

const cacheKey = (
  fileName: string,
  languageVersion: ts.ScriptTarget | undefined,
  impliedNodeFormat: ImpliedNodeFormat,
  options: ts.CompilerOptions,
): string =>
  JSON.stringify([
    fileName,
    languageVersion ?? null,
    impliedNodeFormat ?? null,
    CACHE_OPTION_KEYS.map((key) => options[key] ?? null),
  ]);

/** A `ts.CompilerHost` whose `getSourceFile` consults `cache` before parsing. */
export const cachingHost = (
  options: ts.CompilerOptions,
  cache: SourceFileCache,
): ts.CompilerHost => {
  const host = ts.createCompilerHost(options, false);
  const { getSourceFile } = host;
  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) => {
    const create = (): ts.SourceFile | undefined =>
      getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile);
    if (shouldCreateNewSourceFile) {
      return create();
    }
    const languageVersion: ts.ScriptTarget =
      typeof languageVersionOrOptions === 'object'
        ? languageVersionOrOptions.languageVersion
        : languageVersionOrOptions;
    const impliedNodeFormat: ImpliedNodeFormat =
      typeof languageVersionOrOptions === 'object'
        ? languageVersionOrOptions.impliedNodeFormat
        : undefined;
    const key = cacheKey(fileName, languageVersion, impliedNodeFormat, options);
    const cached = cache.sourceFiles.get(key);
    if (cached) {
      return cached;
    }
    const sourceFile = create();
    if (sourceFile) {
      cache.sourceFiles.set(key, sourceFile);
    }
    return sourceFile;
  };
  return host;
};
