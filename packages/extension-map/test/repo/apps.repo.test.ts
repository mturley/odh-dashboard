import { getRepoModel } from './model';
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
