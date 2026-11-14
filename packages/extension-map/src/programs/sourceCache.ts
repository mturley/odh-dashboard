import ts from 'typescript';

/**
 * Compiler options that change how a file is parsed or bound. Two programs may only share a
 * parsed `SourceFile` when all of these agree.
 */
const CACHE_KEY_OPTIONS = [
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

/** Parsed `SourceFile`s shared between the streamed programs. */
export type SourceFileCache = {
  get: (key: string) => ts.SourceFile | undefined;
  set: (key: string, file: ts.SourceFile) => void;
  stats: () => { hits: number; misses: number; size: number };
};

export const createSourceFileCache = (): SourceFileCache => {
  const files = new Map<string, ts.SourceFile>();
  let hits = 0;
  let misses = 0;
  return {
    get: (key) => {
      const file = files.get(key);
      if (file) {
        hits += 1;
      } else {
        misses += 1;
      }
      return file;
    },
    set: (key, file) => {
      files.set(key, file);
    },
    stats: () => ({ hits, misses, size: files.size }),
  };
};

/** A compiler host with parent pointers set, so that `node.getStart()` works. */
export const createHost = (options: ts.CompilerOptions): ts.CompilerHost =>
  ts.createCompilerHost(options, true);

/** A compiler host that reads parsed `SourceFile`s from, and writes them to, a shared cache. */
export const cachingHost = (
  options: ts.CompilerOptions,
  cache: SourceFileCache,
): ts.CompilerHost => {
  const host = createHost(options);
  const optionsKey = JSON.stringify(CACHE_KEY_OPTIONS.map((key) => options[key] ?? null));
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) => {
    const creation =
      typeof languageVersionOrOptions === 'object'
        ? languageVersionOrOptions
        : { languageVersion: languageVersionOrOptions, impliedNodeFormat: undefined };
    const key = `${fileName}|${creation.languageVersion}|${
      creation.impliedNodeFormat ?? ''
    }|${optionsKey}`;
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    const file = read(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile);
    if (file) {
      cache.set(key, file);
    }
    return file;
  };
  return host;
};
