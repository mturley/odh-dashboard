/**
 * The extension map data model (spec §5.8).
 *
 * The model is plain serializable data only: no `ts.Program`, `ts.Node`,
 * `ts.Type`, `ts.Symbol` or `ts.SourceFile` may ever be stored here (holding
 * all repo programs alive costs multiple GB). Collectors keep keys, `Loc`s and
 * strings.
 */

/** Source location, repo-relative. */
export type Loc = { file: string; line: number; endLine?: number };

/** A pnpm workspace package, read as data (never `require`d). */
export type WorkspacePackage = {
  name: string;
  /** Repo-relative package directory. */
  dir: string;
  packageJson: Record<string, unknown>;
};

export type Pkg = {
  name: string;
  dir: string;
  kind: 'host' | 'package' | 'distribution';
  docsDir: string;
  upstreamDirs: string[];
};

export type Entry = {
  id: string;
  pkg: string;
  file: string;
  path: 'static' | 'federated' | 'distribution-static' | 'distribution-local';
  key: string;
};

export type App = {
  id: 'host' | string;
  /** In catalog order — never sorted. */
  entries: { entry: string; conditional?: Loc }[];
  featureFlags: Record<string, boolean>;
};

/** JSDoc-derived documentation for an extension point. */
export type Doc = {
  summary?: string;
  remarks?: string;
  deprecated?: string | true;
  see: string[];
  category?: string;
  links: string[];
  extensionData: string[];
};

export type ExtensionPoint = {
  id: string;
  pkg: string;
  typeName: string;
  loc: Loc;
  typeParams: string[];
  guards: string[];
  doc: Doc;
  /** In the point type's declared property order — never sorted. */
  properties: {
    name: string;
    optional: boolean;
    typeText: string;
    codeRef?: { inner: string };
    doc?: string;
    /**
     * Internal (Task 11): repo-relative declaration keys of the `codeRef`
     * inner type, recorded as plain data for carried-type extraction.
     */
    innerDeclKeys?: string[];
  }[];
};

export type Guard = {
  name: string;
  loc: Loc;
  style: 'inline' | 'factory' | 'parameterized';
  pointIds: string[];
};

/** A reference to a named symbol, e.g. a `supplies` value that is not a `Value`. */
export type SymbolRef = { kind: 'symbol'; name: string; loc: Loc };

export type Value =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'enumMember'; enumName: string; member: string; value: string | number }
  | { kind: 'constant'; name: string; value: string | number | boolean }
  | {
      kind: 'codeRef';
      module: string;
      export: string | null;
      target?: Loc;
      supplies?: Record<string, Value | SymbolRef>;
    }
  | { kind: 'array'; items: Value[] }
  | { kind: 'object'; props: Record<string, Value> }
  | { kind: 'unresolved'; reason: string; loc: Loc };

/** Named `ExtensionRecord` (not `Extension`) to avoid the SDK's `Extension` name. */
export type ExtensionRecord = {
  /** `file:pos` */
  key: string;
  type: string;
  pkg: string;
  loc: Loc;
  entries: string[];
  apps: { app: string; via: string; conditional?: boolean }[];
  flags: { required: Value[]; disallowed: Value[] };
  properties: Record<string, Value>;
  multiplicity?: number | 'unknown';
  mappedValues?: Value[];
};

export type Override = {
  kind: 'suppress' | 'patch' | 'redefine';
  app: string;
  /** Extension key of the overriding extension. */
  by: string;
  targetType: Value;
  targetId: Value;
  targets: string[];
  effect: 'removed' | 'applied' | 'noop-missing' | 'noop-suppressed' | 'unresolved';
  patch?: Record<string, Value>;
  ignoredKeys?: string[];
};

export type Consumer = {
  /** `file#symbol` */
  id: string;
  pkg: string;
  symbol: string;
  loc: Loc;
  renderedIn: { symbol: string; loc: Loc; how: 'jsx' | 'call' }[];
};

export type QuerySite = {
  consumer: string;
  pointIds: string[];
  hook: string;
  wrapper?: string;
  resolved: boolean;
  loc: Loc;
  provenance: Provenance;
};

export type UseSite = {
  consumer: string;
  pointId: string;
  path: string;
  kind: 'lazy-render' | 'jsx-render' | 'hook-run' | 'call' | 'read' | 'filter';
  direct: boolean;
  carriedType?: string;
  oneOf?: string[];
  loc: Loc;
  provenance: Provenance;
};

export type CarriedType = {
  name: string;
  loc: Loc;
  pointIds: string[];
  source: 'inferred' | 'jsdoc';
  builtOutsideExtensions: Loc[];
};

export type Provenance = 'declared' | 'type-resolved' | 'derived' | 'jsdoc-tagged' | 'unresolved';

export type DiagnosticCode =
  | 'point-no-jsdoc'
  | 'jsdoc-param-on-type'
  | 'point-no-guard'
  | 'guard-no-point'
  | 'guard-literal-mismatch'
  | 'point-duplicate-id'
  | 'extension-unknown-point'
  | 'unresolved-element'
  | 'unresolved-value'
  | 'unresolved-expose'
  | 'unresolved-loadremote'
  | 'multiplicity-unknown'
  | 'federation-not-loaded'
  | 'stale-mf-types'
  | 'unverified-mf-types'
  | 'suppress-no-match'
  | 'patch-noop-missing'
  | 'patch-noop-suppressed'
  | 'patch-ignored-keys'
  | 'unresolved-override'
  | 'query-unknown-point'
  | 'guard-unknown-callee'
  | 'point-id-literal'
  | 'point-unused'
  | 'point-no-contributors'
  | 'point-no-consumers'
  | 'carried-built-outside'
  | 'extension-data-invalid'
  | 'tsconfig-error';

export type Diagnostic = {
  code: DiagnosticCode;
  severity: 'warning' | 'info';
  message: string;
  loc?: Loc;
  pkg?: string;
};

export type ExtensionMapModel = {
  version: 1;
  packages: Pkg[];
  entries: Entry[];
  apps: App[];
  points: ExtensionPoint[];
  guards: Guard[];
  extensions: ExtensionRecord[];
  overrides: Override[];
  consumers: Consumer[];
  querySites: QuerySite[];
  useSites: UseSite[];
  carriedTypes: CarriedType[];
  diagnostics: Diagnostic[];
};
