import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { getRepoModel } from './model';
import {
  CLEARABLE_NAV_PATCH_KEYS,
  DATA_ATTRIBUTE_KEY,
  NAV_PATCH_KEYS,
  OBJECT_NAV_PATCH_KEYS,
  PATCHABLE_TYPES,
} from '../../src/composition/overrides';
import { findRepoRoot } from '../../src/repoRoot';
import type { App, Override } from '../../src/model/types';

const appIds = (): string[] => getRepoModel().apps.map((a) => a.id);

const app = (id: string): App => {
  const found = getRepoModel().apps.find((a) => a.id === id);
  if (!found) {
    throw new Error(`No app ${id} in the repo model`);
  }
  return found;
};

const overrides = (appId: string, kind: Override['kind']): Override[] =>
  getRepoModel().overrides.filter((o) => o.app === appId && o.kind === kind);

const override = (appId: string, kind: Override['kind'], targetId: string): Override => {
  const found = overrides(appId, kind).filter(
    (o) => o.targetId.kind === 'literal' && o.targetId.value === targetId,
  );
  if (found.length !== 1) {
    throw new Error(`Expected one ${kind} of ${targetId} in ${appId}, found ${found.length}`);
  }
  return found[0];
};

const hostEntriesOf = (pkgName: string): string[] =>
  app('host')
    .entries.map((x) => x.entry)
    .filter((entry) => entry.startsWith(`${pkgName}#`));

describe('apps (real repo)', () => {
  it('models exactly host, maas-portal and rhaii', () => {
    expect(appIds()).toEqual(['host', 'maas-portal', 'rhaii']);
  });

  it('has rhaii conditionally load the model-serving federated entry', () => {
    const entry = app('rhaii').entries.find(
      (x) => x.entry === '@odh-dashboard/model-serving#mf:./extensions',
    );
    expect(entry?.conditional).toBeDefined();
  });

  it('finds six suppresses and three patches in maas-portal', () => {
    expect(overrides('maas-portal', 'suppress')).toHaveLength(6);
    expect(overrides('maas-portal', 'patch')).toHaveLength(3);
  });

  it('finds the maas-portal patch of maas-governance-view to be a no-op', () => {
    expect(override('maas-portal', 'patch', 'maas-governance-view').effect).toBe('noop-suppressed');
  });

  it('includes maas in the host only through its federated entry', () => {
    expect(hostEntriesOf('@odh-dashboard/maas')).toEqual(['@odh-dashboard/maas#mf:./extensions']);
  });

  it('starts the host catalog with the core app', () => {
    expect(app('host').entries[0]).toEqual({ entry: '@odh-dashboard/internal#./extensions' });
  });

  it('composes maas-portal bundled packages first, then its local entry', () => {
    expect(app('maas-portal').entries.map((x) => x.entry)).toEqual([
      '@odh-dashboard/observability#./extensions/static',
      '@odh-dashboard/maas#./extensions/static',
      '@odh-dashboard/gen-ai#./extensions/static',
      '@odh-dashboard/maas-portal-distribution#local:./extensions',
    ]);
  });
});

/** The initializer of a top-level `const` in a plugin-core source file, parsed and never run. */
const pluginCoreConst = (file: string, name: string): ts.Expression => {
  const fileName = path.join(findRepoRoot(), 'packages/plugin-core/src/core', file);
  const source = ts.createSourceFile(
    fileName,
    fs.readFileSync(fileName, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
          return decl.initializer;
        }
      }
    }
  }
  throw new Error(`No const ${name} in ${file}`);
};

const unwrap = (expr: ts.Expression): ts.Expression =>
  ts.isSatisfiesExpression(expr) || ts.isAsExpression(expr) ? unwrap(expr.expression) : expr;

/** The string elements of an array literal const (`[...] as const satisfies ...`). */
const stringElements = (file: string, name: string): string[] => {
  const init = unwrap(pluginCoreConst(file, name));
  if (!ts.isArrayLiteralExpression(init)) {
    throw new Error(`${name} is not an array literal`);
  }
  return init.elements.map((element) => {
    if (!ts.isStringLiteral(element)) {
      throw new Error(`${name} has a non-literal element`);
    }
    return element.text;
  });
};

describe('plugin store patch rules (drift guard)', () => {
  it('lists exactly the types PATCH_SCHEMAS has a schema for, all using the nav schema', () => {
    const init = pluginCoreConst('extensionResolution.ts', 'PATCH_SCHEMAS');
    if (!ts.isNewExpression(init) || !init.arguments?.[0]) {
      throw new Error('PATCH_SCHEMAS is not `new Map([...])`');
    }
    const pairs = init.arguments[0];
    if (!ts.isArrayLiteralExpression(pairs)) {
      throw new Error('PATCH_SCHEMAS is not built from an array literal');
    }
    const entries = pairs.elements.map((pair) => {
      if (
        !ts.isArrayLiteralExpression(pair) ||
        !ts.isStringLiteral(pair.elements[0]) ||
        !ts.isIdentifier(pair.elements[1])
      ) {
        throw new Error('A PATCH_SCHEMAS entry is not a [string, identifier] pair');
      }
      return [pair.elements[0].text, pair.elements[1].text];
    });
    expect(entries.map(([type]) => type).toSorted()).toEqual([...PATCHABLE_TYPES].toSorted());
    expect(new Set(entries.map(([, schema]) => schema))).toEqual(new Set(['NAV_PATCH_SCHEMA']));
  });

  it('allows and clears the same keys as nav-patch.ts', () => {
    expect(stringElements('nav-patch.ts', 'NAV_PATCH_KEYS')).toEqual(NAV_PATCH_KEYS);
    expect(stringElements('nav-patch.ts', 'CLEARABLE_NAV_PATCH_KEYS')).toEqual(
      CLEARABLE_NAV_PATCH_KEYS,
    );
    expect(stringElements('nav-patch.ts', 'OBJECT_NAV_PATCH_KEYS')).toEqual(OBJECT_NAV_PATCH_KEYS);
    const pattern = pluginCoreConst('nav-patch.ts', 'DATA_ATTRIBUTE_KEY');
    expect(ts.isRegularExpressionLiteral(pattern) ? pattern.text : undefined).toBe(
      String(DATA_ATTRIBUTE_KEY),
    );
  });
});
