import fs from 'fs';
import path from 'path';
import { diags, getRepoModel } from './model';
import { federationFrontendRoot } from '../../src/discovery/hostFederation';
import { loadWorkspace } from '../../src/discovery/workspace';
import { remoteNameOf } from '../../src/programs/mfTypes';
import { findRepoRoot } from '../../src/repoRoot';

/** The committed generated type copies. Nothing in the model may point into them. */
const COPIES = 'frontend/@mf-types';
const COPY_ROOT = `${COPIES}/@mf`;

/** Every `<path>: <string>` in the model whose string names a file inside the committed copies. */
const intoCopies = (value: unknown, at: string): string[] => {
  if (typeof value === 'string') {
    return value.startsWith(COPIES) ? [`${at}: ${value}`] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => intoCopies(item, `${at}[${index}]`));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => intoCopies(item, `${at}.${key}`));
  }
  return [];
};

/** Repo-relative paths of every committed `.d.ts` below a directory. */
const copiesBelow = (repoRoot: string, relDir: string): string[] => {
  const entries = fs.readdirSync(path.join(repoRoot, relDir), { withFileTypes: true });
  return entries.flatMap((entry) => {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      return copiesBelow(repoRoot, rel);
    }
    return entry.name.endsWith('.d.ts') ? [rel] : [];
  });
};

/**
 * Every committed copy whose mirrored source file is gone, as
 * `<copy> -> <mirrored source without extension>`.
 */
const copiesWithoutSource = (): string[] => {
  const repoRoot = findRepoRoot();
  const roots = new Map(
    loadWorkspace(repoRoot).flatMap((pkg) => {
      const remote = remoteNameOf(pkg);
      return remote ? [[remote, federationFrontendRoot(pkg.dir, repoRoot)] as const] : [];
    }),
  );
  return fs
    .readdirSync(path.join(repoRoot, COPY_ROOT))
    .flatMap((remote) => {
      const root = roots.get(remote);
      const dir = `${COPY_ROOT}/${remote}/compiled-types`;
      return copiesBelow(repoRoot, dir).map((copy) => {
        const below = copy.slice(`${dir}/`.length, -'.d.ts'.length);
        const mirrored = root === undefined ? undefined : `${root}/${below}`;
        const found =
          mirrored !== undefined &&
          ['.ts', '.tsx'].some((ext) => fs.existsSync(path.join(repoRoot, mirrored + ext)));
        return found ? '' : `${copy} -> ${mirrored ?? `(no root for remote '${remote}')`}`;
      });
    })
    .filter((entry) => entry !== '')
    .toSorted();
};

describe('@mf-types copies on the real repo', () => {
  it('never names a committed copy in a location or a declaration key', () => {
    const model = getRepoModel();
    // The stale-copy diagnostics are the one place a copy is named on purpose.
    const checked = {
      ...model,
      diagnostics: model.diagnostics.filter((d) => d.code !== 'stale-mf-types'),
    };
    expect(intoCopies(checked, 'model')).toEqual([]);
  });

  it('reports the stale committed copies, and only those reviewed by hand', () => {
    // Nothing in the model reaches a declaration through a copy yet: every `@mf/*` import in the
    // repo is type-only, so the first keys mapped through the copies arrive with carried types.
    expect(
      diags('stale-mf-types')
        .map((d) => d.message)
        .toSorted(),
    ).toEqual([]);
  });

  it('mirrors every committed copy onto its source file, bar the ones deleted upstream', () => {
    // Reviewed by hand: the eval-hub security-insights files were removed in d64a4cd308 and
    // model-registry's RuntimeCatalogIcon in d3532c5005, but their generated copies are still
    // committed. Any other entry here is a mapping bug, not a stale copy.
    expect(copiesWithoutSource()).toEqual([
      'frontend/@mf-types/@mf/evalHub/compiled-types/src/app/components/SourceAgentFields.d.ts -> packages/eval-hub/frontend/src/app/components/SourceAgentFields',
      'frontend/@mf-types/@mf/evalHub/compiled-types/src/app/hooks/useSecurityArtifacts.d.ts -> packages/eval-hub/frontend/src/app/hooks/useSecurityArtifacts',
      'frontend/@mf-types/@mf/evalHub/compiled-types/src/app/hooks/useSyncPreferredNamespace.d.ts -> packages/eval-hub/frontend/src/app/hooks/useSyncPreferredNamespace',
      'frontend/@mf-types/@mf/evalHub/compiled-types/src/app/pages/modelCatalog/SecurityInsightsDevPage.d.ts -> packages/eval-hub/frontend/src/app/pages/modelCatalog/SecurityInsightsDevPage',
      'frontend/@mf-types/@mf/evalHub/compiled-types/src/app/pages/modelCatalog/SecurityInsightsEmptyState.d.ts -> packages/eval-hub/frontend/src/app/pages/modelCatalog/SecurityInsightsEmptyState',
      'frontend/@mf-types/@mf/evalHub/compiled-types/src/app/pages/modelCatalog/SecurityInsightsTab.d.ts -> packages/eval-hub/frontend/src/app/pages/modelCatalog/SecurityInsightsTab',
      'frontend/@mf-types/@mf/evalHub/compiled-types/src/app/pages/modelCatalog/SecurityInsightsView.d.ts -> packages/eval-hub/frontend/src/app/pages/modelCatalog/SecurityInsightsView',
      'frontend/@mf-types/@mf/evalHub/compiled-types/src/app/pages/modelCatalog/const.d.ts -> packages/eval-hub/frontend/src/app/pages/modelCatalog/const',
      'frontend/@mf-types/@mf/evalHub/compiled-types/src/app/pages/modelCatalog/securityInsightsTypes.d.ts -> packages/eval-hub/frontend/src/app/pages/modelCatalog/securityInsightsTypes',
      'frontend/@mf-types/@mf/modelRegistry/compiled-types/src/odh/pages/runtimeCatalog/RuntimeCatalogIcon.d.ts -> packages/model-registry/upstream/frontend/src/odh/pages/runtimeCatalog/RuntimeCatalogIcon',
    ]);
  });
});
