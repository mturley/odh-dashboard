import { diags, getRepoModel } from './model';
import type { QuerySite, UseSite } from '../../src/model/types';

const site = (consumer: string, pointId: string): QuerySite | undefined =>
  getRepoModel().querySites.find((q) => q.consumer === consumer && q.pointIds.includes(pointId));

const sitesOf = (pointId: string): QuerySite[] =>
  getRepoModel().querySites.filter((q) => q.pointIds.includes(pointId));

const consumerFilesOf = (pointId: string): string[] =>
  [...new Set(sitesOf(pointId).map((q) => q.loc.file))].toSorted();

const usesOf = (pointId: string): UseSite[] =>
  getRepoModel().useSites.filter((u) => u.pointId === pointId);

describe('query sites on the real repo', () => {
  it('finds kserve useWatchDeployments querying exclude-deployment', () => {
    const s = site(
      'packages/kserve/src/deployments.ts#useWatchDeployments',
      'model-serving.platform/exclude-deployment',
    );
    expect(s).toMatchObject({ hook: 'useResolvedExtensions', resolved: true, loc: { line: 45 } });
  });

  it('finds the masthead points queried in distributions/base ShellHeader', () => {
    expect(consumerFilesOf('app.masthead/toolbar-item')).toContain(
      'distributions/base/src/ShellHeader.tsx',
    );
  });

  it('finds no query site for model-serving.deployment/transform', () => {
    expect(sitesOf('model-serving.deployment/transform')).toEqual([]);
  });

  it('sees the plugin store type-checking app.suppress and app.patch', () => {
    const resolution = 'packages/plugin-core/src/core/extensionResolution.ts';
    for (const pointId of ['app.suppress', 'app.patch']) {
      expect(
        usesOf(pointId).filter((u) => u.kind === 'type-check' && u.loc.file === resolution),
      ).not.toEqual([]);
    }
  });

  it('lists every guard that reaches an unknown callee', () => {
    expect(diags('guard-unknown-callee').map((d) => d.loc?.file)).toMatchSnapshot();
  });

  it('records the wrapper a query goes through', () => {
    expect(
      getRepoModel()
        .querySites.filter((q) => q.wrapper !== undefined)
        .every((q) => q.provenance === 'type-resolved'),
    ).toBe(true);
    expect(
      getRepoModel().querySites.some((q) => q.wrapper === 'useResolvedDeploymentExtension'),
    ).toBe(true);
  });
});
