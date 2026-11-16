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

  // Known answer disputed (see task-10-report.md): two consumers query this point, at
  // GlobalDeploymentsTable.tsx:70 and ProjectDeploymentsTable.tsx:15 (through
  // useResolvedPlatformExtension), and call `properties.columns()`. It has no contributors, so it
  // is reported as `point-no-contributors`, not `point-unused`. Awaiting a ruling.
  it.skip('marks deployments-table unused', () => {
    expect(diag('point-unused', 'model-serving.deployments-table')).toBeDefined();
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
