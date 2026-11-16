/*
 * The analysis model: everything `@odh-dashboard/extension-map` knows about the extension system,
 * as plain data. `generate --json <file>` writes it as JSON, and every renderer reads only this.
 *
 * Conventions that hold for every type below:
 * - Every file path is repo-relative and POSIX (`packages/plugin-core/extensions.ts`), and never points
 *   into `frontend/@mf-types`: a declaration reached through a committed `@mf-types` copy is
 *   reported at the source declaration the copy was generated from.
 * - Every line is 1-based.
 * - An optional field is omitted, never `undefined` or `null`, when it does not apply.
 * - The model states facts about the code. How to show them is each renderer's business.
 */

/** A source location: where a declaration, expression or reference is written. */
export type Loc = {
  /** Repo-relative POSIX path of the file. Never under `frontend/@mf-types`. */
  file: string;
  /** 1-based line the node starts on. */
  line: number;
  /** 1-based line the node ends on. Omitted when it equals `line`. */
  endLine?: number;
};

/**
 * How a relationship was established:
 * - `declared`: written explicitly in source (an extension's `type`, an entry's export).
 * - `type-resolved`: proven by the type checker (a guard's predicate, a value's type).
 * - `derived`: follows from a carried type after an extension was unwrapped (a derived use).
 * - `jsdoc-tagged`: asserted by a JSDoc tag such as `@extensionData`.
 * - `unresolved`: the analysis could not prove it; it is reported, never drawn as an edge.
 */
export type Provenance = 'declared' | 'type-resolved' | 'derived' | 'jsdoc-tagged' | 'unresolved';

/** A workspace package as discovery reads it. An input to the analysis, not part of the model. */
export type WorkspacePackage = {
  /** The `name` in its `package.json`. */
  name: string;
  /** Directory relative to the repo root (POSIX). */
  dir: string;
  /** Its parsed `package.json`, read as data and never executed. */
  packageJson: Record<string, unknown>;
};

/**
 * A display package: a workspace package that is not rolled up into another one. Nested
 * workspace packages (`<pkg>/frontend`, anything under `<pkg>/upstream/`) roll up into their
 * parent, and their files belong to it.
 */
export type Pkg = {
  /** The package name, e.g. `@odh-dashboard/plugin-core`. The core app is `@odh-dashboard/internal`. */
  name: string;
  /** Directory relative to the repo root (POSIX), e.g. `packages/plugin-core` or `frontend/src`. */
  dir: string;
  /** `host` for the core app, `distribution` for anything under `distributions/`, else `package`. */
  kind: 'host' | 'package' | 'distribution';
  /** Repo-relative `upstream/` subtrees inside the package directory that exist; sorted. */
  upstreamDirs: string[];
};

/**
 * An entry: a module whose default export is an array of extensions, reachable by one loading
 * path. A package can have several (its static `./extensions` export and its federated expose).
 */
export type Entry = {
  /** `<pkg>#<key>`, unique across the model, e.g. `@odh-dashboard/plugin-core#./extensions`. */
  id: string;
  /** Name of the display package the entry belongs to. */
  pkg: string;
  /** Repo-relative POSIX path of the entry module. */
  file: string;
  /**
   * How the entry is loaded: `static` (`package.json` export `./extensions`, bundled into the
   * host), `federated` (the `./extensions` expose of a Module Federation remote),
   * `distribution-static` (`package.json` export `./extensions/<name>`, bundled by a
   * distribution) or `distribution-local` (a distribution's own entry).
   */
  path: 'static' | 'federated' | 'distribution-static' | 'distribution-local';
  /** The export or expose key: `./extensions`, `./extensions/<name>`, or `mf:./extensions`. */
  key: string;
};

/** A composition root that assembles entries into one plugin store (the host, a distribution). */
export type App = {
  /** `host` for the core app, else the distribution's name. */
  id: 'host' | string;
  /** The app's entries, kept in catalog order (the order the app registers them). */
  entries: {
    /** The `Entry.id` of the entry. */
    entry: string;
    /** Where a code-level `loadRemote` adds the entry; omitted when it is always included. */
    conditional?: Loc;
  }[];
  /** Feature flags the app sets, by flag name. Empty when it sets none. */
  featureFlags: Record<string, boolean>;
};

/** The JSDoc of a declaration, as the parts the map uses. */
export type Doc = {
  /** The comment text before any tag, with `{@link X}` kept inline. Omitted when empty. */
  summary?: string;
  /** The text of `@remarks` tags, joined by blank lines. Omitted when there is none. */
  remarks?: string;
  /** The `@deprecated` text, `true` for a bare tag. Omitted when not deprecated. */
  deprecated?: string | true;
  /** Each `@see` tag's target and text, in source order. */
  see: string[];
  /** The `@category` text. Omitted when there is none. */
  category?: string;
  /** Every name an inline `{@link …}` points at, in source order (duplicates kept). */
  links: string[];
  /** Each `@extensionData` tag's text (a point ID the documented type is carried by). */
  extensionData: string[];
};

/** An extension point: a type alias resolving to `Extension<'<id>', …>`. */
export type ExtensionPoint = {
  /** The point ID: the string literal of `Extension`'s first type argument. Unique key. */
  id: string;
  /** Name of the display package that declares it. */
  pkg: string;
  /** The type alias name, e.g. `RouteExtension`. */
  typeName: string;
  /** Where the type alias is declared (the source declaration, never an `@mf-types` copy). */
  loc: Loc;
  /** Names of the alias's type parameters, in declared order. */
  typeParams: string[];
  /** Names of the guards that narrow to this point; sorted. Joins `Guard.name`. */
  guards: string[];
  /** The alias's JSDoc. */
  doc: Doc;
  /** The declared properties of the point, in declared order. */
  properties: {
    /** The property name. */
    name: string;
    /** True when the property is declared optional (`?`). */
    optional: boolean;
    /** The declared type as written, whitespace collapsed. */
    typeText: string;
    /** Present when the property is a `CodeRef<X>`; omitted otherwise. */
    codeRef?: {
      /** The carried type `X`, as the checker prints it. */
      inner: string;
      /**
       * Declaration key (`<file>:<start offset>`) of the named type `X`, when `X` has a named
       * declaration in repo source. Omitted otherwise (an inline or library type).
       */
      innerKey?: string;
    };
    /** The property's JSDoc summary. Omitted when it has none. */
    doc?: string;
  }[];
};

/** A type guard: a function whose type predicate narrows to one or more extension points. */
export type Guard = {
  /** The name the guard is declared under. */
  name: string;
  /** Where the guard is declared. */
  loc: Loc;
  /**
   * `inline` (a function written in place), `factory` (built by a call, e.g. a guard factory) or
   * `parameterized` (a function returning a guard).
   */
  style: 'inline' | 'factory' | 'parameterized';
  /** The point IDs its predicate narrows to; sorted. */
  pointIds: string[];
};

/** A named function, hook or constant a CodeRef target supplies, where it is declared. */
export type SymbolRef = {
  /** Discriminant: a reference by name. */
  kind: 'symbol';
  /** The name as written at the supplying property (or the property name, for inline code). */
  name: string;
  /** Where the named thing (or the inline code) is declared. */
  loc: Loc;
};

/**
 * A value an extension sets, proven rather than guessed. Anything the analysis cannot prove is
 * `unresolved`, with the reason and a location; it is never filled in by inference.
 */
export type Value =
  | {
      /** A literal written in source (or a template whose parts are all literals). */
      kind: 'literal';
      /** The literal's value. */
      value: string | number | boolean | null;
    }
  | {
      /** A reference to an enum member with a literal value. */
      kind: 'enumMember';
      /** The enum's name. */
      enumName: string;
      /** The member's name. */
      member: string;
      /** The member's value. */
      value: string | number;
    }
  | {
      /** A reference to a constant whose value is a literal. */
      kind: 'constant';
      /** The reference as written (`KSERVE_ID`, `Ns.NAME`). */
      name: string;
      /** The literal value it holds. */
      value: string | number | boolean;
    }
  | {
      /** A code reference: an arrow function returning a dynamic `import()`. */
      kind: 'codeRef';
      /**
       * The file the `import()` resolves to (repo-relative POSIX). When `external` is set, the raw
       * import specifier instead. This is the module the code imports, not necessarily the one
       * that declares the export: see `target`.
       */
      module: string;
      /**
       * The export the code reference picks: `default` for a bare `import()`, the name a `.then`
       * callback reads, or `null` when the callback builds something new instead of picking one.
       */
      export: string | null;
      /** Set when the import does not resolve to a file in this repo. Omitted otherwise. */
      external?: true;
      /**
       * Where the picked export is declared, following re-exports: its `file` differs from
       * `module` when `module` re-exports it from elsewhere. Omitted when `export` is `null`,
       * the import is external, or the export cannot be found.
       */
      target?: Loc;
      /**
       * When the target declares an object literal, its properties: a resolved `Value`, or a
       * `SymbolRef` to the function or symbol a property names. Omitted when the target is not an
       * object literal (a component, a hook).
       */
      supplies?: Record<string, Value | SymbolRef>;
    }
  | {
      /**
       * Code rather than data: an inline function, a function declaration or `const` holding a
       * function that a reference names, or a `const` whose type (ignoring `null` / `undefined`)
       * has a call signature and is not a union.
       */
      kind: 'function';
      /** The reference or function-expression name. Omitted for an anonymous inline function. */
      name?: string;
      /** Where the function (or the `const` holding it) is declared. */
      loc: Loc;
    }
  | {
      /**
       * A reference to a `const` whose value is code, not data. Produced only on positive proof:
       * the value cannot be read as data, the chain of `const` aliases it names does not end at an
       * object or array literal, and its type (ignoring `null` / `undefined`; for a union, every
       * other member) has a construct signature, has a property or method whose type has a call
       * signature (a schema object's `parse`), or is a class instance. A value whose type is
       * data, or proves nothing (`any`, `unknown`, an unconstrained type parameter, a mixed
       * union), stays `unresolved`. Never a function the checker proves callable (that is
       * `function`) and never a call written inline (that is `unresolved`).
       */
      kind: 'reference';
      /** The reference as written at the use, e.g. `timeoutFieldSchema`. */
      name: string;
      /** Where the `const` is declared. */
      loc: Loc;
    }
  | {
      /**
       * The element of the array a `.map()` generated this extension from. The elements are in
       * the record's `mappedValues`.
       */
      kind: 'mapped';
    }
  | {
      /** An array literal. */
      kind: 'array';
      /** Its elements, in source order. */
      items: Value[];
    }
  | {
      /** An object literal, with spreads merged in source order (a later key wins). */
      kind: 'object';
      /** Its members, by name. */
      props: Record<string, Value>;
    }
  | {
      /** A value the analysis could not prove. Each one is also reported as a diagnostic. */
      kind: 'unresolved';
      /** Why, in words. */
      reason: string;
      /** Where the expression that could not be resolved is written. */
      loc: Loc;
    };

/** One declared extension: an object literal with a `type` naming a point. */
export type ExtensionRecord = {
  /**
   * `<file>:<start offset>` of the object literal: the unique key of the record. Stable only
   * while the source before the literal is unchanged; never points into `frontend/@mf-types`.
   */
  key: string;
  /** The point ID its `type` resolves to. Joins `ExtensionPoint.id`. */
  type: string;
  /** Name of the display package whose source declares it. */
  pkg: string;
  /** Where the object literal is written. */
  loc: Loc;
  /**
   * The name of the `const` whose initializer is the object literal (through `as`, `satisfies`,
   * angle-bracket type assertions, non-null assertions `!` and parentheses), e.g.
   * `routeExtension`. Omitted when the literal is written inline in an array or returned from a
   * `.map()` callback.
   */
  binding?: string;
  /** `Entry.id` of every entry that reaches it; sorted. */
  entries: string[];
  /** The apps that include it. Empty until app composition is analyzed; sorted by `app`. */
  apps: {
    /** `App.id` of the app. */
    app: string;
    /** `Entry.id` of the entry through which the app includes it. */
    via: string;
    /** `true` when that entry is included only conditionally; omitted otherwise. */
    conditional?: true;
  }[];
  /** Its feature flags. */
  flags: {
    /** `flags.required`, in source order. A list that is not an array literal is one value. */
    required: Value[];
    /** `flags.disallowed`, in source order. A list that is not an array literal is one value. */
    disallowed: Value[];
  };
  /** Its `properties`, by name. A `properties` that is not an object is kept under `properties`. */
  properties: Record<string, Value>;
  /**
   * How many extensions this record stands for, when it was generated by a `.map()`: the
   * element count, or `unknown` when the mapped array cannot be counted. Omitted for a literal
   * that stands for exactly one extension.
   */
  multiplicity?: number | 'unknown';
  /**
   * The resolved elements of the array a `.map()` generated it from, in order. Present only when
   * `multiplicity` is a number.
   */
  mappedValues?: Value[];
};

/** A suppress, patch or redefine in one app's catalog. */
export type Override = {
  /**
   * `suppress` (an `app.suppress` removes earlier registrations of a key), `patch` (an
   * `app.patch` changes a target's properties), or `redefine` (a later registration of a key
   * that a suppress removed earlier ones of).
   */
  kind: 'suppress' | 'patch' | 'redefine';
  /** `App.id` of the app whose catalog it applies in. */
  app: string;
  /** `ExtensionRecord.key` of the extension performing the override. */
  by: string;
  /** The `targetType` it names. */
  targetType: Value;
  /** The `targetId` it names (matched against `properties.id`). */
  targetId: Value;
  /** `ExtensionRecord.key` of each extension it affects; sorted. */
  targets: string[];
  /**
   * `removed` (a suppress removed targets), `applied` (a patch applies if the target is in use),
   * `noop-missing` (no target), `noop-suppressed` (the target was suppressed), or `unresolved`
   * (the target could not be proven).
   */
  effect: 'removed' | 'applied' | 'noop-missing' | 'noop-suppressed' | 'unresolved';
  /** The patched properties and values. Present only for `patch`. */
  patch?: Record<string, Value>;
  /** Patch keys the plugin store ignores. Omitted when there are none. */
  ignoredKeys?: string[];
};

/** Code that reads extensions: a file and its nearest enclosing named symbol. */
export type Consumer = {
  /** `<file>#<symbol>`: the unique key of the consumer. */
  id: string;
  /** Name of the display package whose source contains it. */
  pkg: string;
  /** The nearest enclosing named function, component, hook or variable. */
  symbol: string;
  /** Where that symbol is declared. */
  loc: Loc;
  /** Where the symbol is used, one hop up; sorted by location. */
  renderedIn: {
    /** The symbol that renders or calls it. */
    symbol: string;
    /** Where it does. */
    loc: Loc;
    /** `jsx` when rendered as a JSX tag, `call` when called. */
    how: 'jsx' | 'call';
  }[];
};

/** Where a consumer fetches extensions with a guard. */
export type QuerySite = {
  /** `Consumer.id` of the consumer. */
  consumer: string;
  /** The point IDs the guard selects; sorted. */
  pointIds: string[];
  /** The query hook called (e.g. `useExtensions`, `useResolvedExtensions`). */
  hook: string;
  /** The wrapper the guard was passed to, when the query goes through one. Omitted otherwise. */
  wrapper?: string;
  /** True when the hook resolves code references (`useResolvedExtensions`). */
  resolved: boolean;
  /** Where the call is written. */
  loc: Loc;
  /** How the site was established. */
  provenance: Provenance;
};

/** Where a consumer uses a property of an extension (or of a type an extension carries). */
export type UseSite = {
  /** `Consumer.id` of the consumer. */
  consumer: string;
  /** The point ID the used value belongs to. */
  pointId: string;
  /** The dotted property path used, e.g. `properties.field`. */
  path: string;
  /**
   * `lazy-render` (passed as `component` to `LazyCodeRefComponent`), `jsx-render` (rendered as
   * JSX), `hook-run` (run as a hook), `call` (invoked), `read` (anything else), or `filter` (a
   * guard passed to an array method).
   */
  kind: 'lazy-render' | 'jsx-render' | 'hook-run' | 'call' | 'read' | 'filter';
  /** True for a use of the extension itself, false for a derived use of a carried type. */
  direct: boolean;
  /** `CarriedType.name` of the carried type, for a derived use. Omitted for a direct use. */
  carriedType?: string;
  /** The point IDs of a union receiver, when the use is one of several. Omitted otherwise. */
  oneOf?: string[];
  /** Where the use is written. */
  loc: Loc;
  /** How the use was established. */
  provenance: Provenance;
};

/** A type an extension point carries inside a `CodeRef` property. */
export type CarriedType = {
  /** The type's name; unique key. */
  name: string;
  /** Where the type is declared. */
  loc: Loc;
  /** The point IDs that carry it; sorted. */
  pointIds: string[];
  /** `inferred` from a `CodeRef<X>` property, or `jsdoc` from an `@extensionData` tag. */
  source: 'inferred' | 'jsdoc';
  /** Where the type is constructed outside a contribution's CodeRef target; sorted. */
  builtOutsideExtensions: Loc[];
};

/** What a diagnostic is about. The message carries the specifics. */
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

/** Something the analysis could not prove, or a problem it found in the code. */
export type Diagnostic = {
  /** What kind of finding it is. */
  code: DiagnosticCode;
  /** `info` for findings that are not problems (an unused point), else `warning`. */
  severity: 'warning' | 'info';
  /** The finding in words. */
  message: string;
  /** Where it was found. Omitted when it concerns no single location (a package's config). */
  loc?: Loc;
  /** Name of the display package it concerns. Omitted when it concerns none. */
  pkg?: string;
};

/**
 * The whole model. Every array is sorted by a stable key (listed per field), so the same code
 * always produces the same JSON; only `App.entries` keeps an order of its own (catalog order).
 */
export type ExtensionMapModel = {
  /** The model shape version, bumped on any breaking change to the shape. */
  version: 1;
  /** Display packages; sorted by `name`. */
  packages: Pkg[];
  /** Entries; sorted by `id`. */
  entries: Entry[];
  /** Apps; sorted by `id`. Empty until app composition is analyzed. */
  apps: App[];
  /** Extension points; sorted by `id`. */
  points: ExtensionPoint[];
  /** Guards; sorted by `loc` (file, then line), then `name`. */
  guards: Guard[];
  /** Extensions; sorted by `key`. */
  extensions: ExtensionRecord[];
  /** Overrides; sorted by `app`, then `by`. Empty until app composition is analyzed. */
  overrides: Override[];
  /** Consumers; sorted by `id`. Empty until consumers are analyzed. */
  consumers: Consumer[];
  /** Query sites; sorted by `loc`, then `consumer`. Empty until consumers are analyzed. */
  querySites: QuerySite[];
  /**
   * Use sites; sorted by `loc`, then `consumer`, `pointId`, `path`. Empty until consumers are
   * analyzed.
   */
  useSites: UseSite[];
  /** Carried types; sorted by `name`. Empty until carried types are analyzed. */
  carriedTypes: CarriedType[];
  /** Diagnostics; sorted by `loc` (file, then line; none first), then `code`, then `message`. */
  diagnostics: Diagnostic[];
};
