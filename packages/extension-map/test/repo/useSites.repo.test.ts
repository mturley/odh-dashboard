import { getRepoModel } from './model';
import type { Diagnostic, DiagnosticCode, UseSite } from '../../src/model/types';

const SLOT =
  'packages/model-serving/src/components/deployments/DeploymentsBannerSlot.tsx#DeploymentsBannerSlot';
const WATCH = 'packages/kserve/src/deployments.ts#useWatchDeployments';

const usesBy = (consumer: string, pointId: string): UseSite[] =>
  getRepoModel().useSites.filter((u) => u.consumer === consumer && u.pointId === pointId);

const useSitesIn = (dir: string): UseSite[] =>
  getRepoModel().useSites.filter((u) => u.loc.file.startsWith(dir));

const renderedIn = (consumer: string): string[] =>
  getRepoModel()
    .consumers.find((c) => c.id === consumer)
    ?.renderedIn.map((r) => r.symbol) ?? [];

/** The point diagnostic with this code about this point. */
const diag = (code: DiagnosticCode, pointId: string): Diagnostic | undefined =>
  getRepoModel().diagnostics.find((d) => d.code === code && d.message.includes(`'${pointId}'`));

describe('use sites on the real repo', () => {
  it('renders the deployments banner through LazyCodeRefComponent', () => {
    expect(usesBy(SLOT, 'model-serving.deployments/banner').map((u) => u.kind)).toContain(
      'lazy-render',
    );
  });

  it('finds DeploymentsBannerSlot rendered in the two deployments views', () => {
    expect(renderedIn(SLOT)).toEqual(['GlobalDeploymentsView', 'ModelsProjectDetailsView']);
  });

  it('finds kserve reading excludeFromPlatform', () => {
    const uses = usesBy(WATCH, 'model-serving.platform/exclude-deployment');
    expect(uses.map((u) => u.path)).toContain('properties.excludeFromPlatform');
  });

  it('lists the lazy-render uses inside mlflow-embedded', () => {
    expect(
      useSitesIn('packages/mlflow-embedded/').filter((u) => u.kind === 'lazy-render'),
    ).toMatchSnapshot();
  });

  it('marks transform unused', () => {
    expect(diag('point-unused', 'model-serving.deployment/transform')).toBeDefined();
  });

  it('reports deployments-table as having no contributors, not as unused', () => {
    const id = 'model-serving.deployments-table';
    expect(diag('point-no-contributors', id)).toBeDefined();
    expect(diag('point-unused', id)).toBeUndefined();
    const sites = getRepoModel().querySites.filter((q) => q.pointIds.includes(id));
    expect(sites.map((q) => q.consumer.slice(q.consumer.indexOf('#') + 1))).toEqual(
      expect.arrayContaining(['GlobalDeploymentsTable', 'ProjectDeploymentsTable']),
    );
    expect(sites.find((q) => q.consumer.endsWith('#ProjectDeploymentsTable'))?.wrapper).toBe(
      'useResolvedPlatformExtension',
    );
  });

  it('does not mark app.suppress or app.patch unused: the plugin store type-checks them', () => {
    expect(diag('point-unused', 'app.suppress')).toBeUndefined();
    expect(diag('point-unused', 'app.patch')).toBeUndefined();
  });

  it('records every use as a direct, type-resolved use of a known point', () => {
    const known = new Set(getRepoModel().points.map((p) => p.id));
    getRepoModel().useSites.forEach((u) => {
      expect(known.has(u.pointId)).toBe(true);
      expect(u.provenance).toBe('type-resolved');
    });
  });
});
