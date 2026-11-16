import { getRepoModel } from './model';
import type { DiagnosticCode } from '../../src/model/types';

const point = (id: string) => getRepoModel().points.find((p) => p.id === id);
const points = () => getRepoModel().points;
const pointIdsStartingWith = (prefix: string): string[] =>
  points()
    .filter((p) => p.id.startsWith(prefix))
    .map((p) => p.id);
const diags = (code: DiagnosticCode) => getRepoModel().diagnostics.filter((d) => d.code === code);

describe('extension points in the repo', () => {
  it('finds model-serving.deployment/transform with its guard', () => {
    expect(point('model-serving.deployment/transform')?.guards).toHaveLength(1);
  });

  it('detects app.suppress and app.patch, declared with typeof constants', () => {
    expect(point('app.suppress')?.guards).toHaveLength(1);
    expect(point('app.patch')?.guards).toHaveLength(1);
  });

  it('attributes model-registry points to model-registry at their upstream source', () => {
    const p = point('model-registry.tracking/provider');
    expect(p?.pkg).toBe('@odh-dashboard/model-registry');
    expect(p?.loc.file).toMatch(
      /^packages\/model-registry\/upstream\/frontend\/src\/odh\/extension-points\//,
    );
  });

  it('marks plugin-core ComponentCodeRef properties with the inner type and its keys', () => {
    const component = point('model-registry.tracking/provider')?.properties.find(
      (p) => p.name === 'component',
    );
    expect(component?.codeRef).toEqual({ inner: 'UserInteractionProviderProps' });
    expect(component?.innerDeclKeys?.[0]).toMatch(
      /^packages\/model-registry\/upstream\/frontend\/src\/odh\/extension-points\/user-interaction\.ts:\d+$/,
    );
  });

  it('reads the WizardFieldExtractorExtension summary', () => {
    const p = point('model-serving.deployment/wizard-field-extractor');
    expect(p?.doc.summary).toMatch(/^Extension for extracting initial data/);
  });

  it('finds the four masthead points in plugin-core', () => {
    const expected = [
      'app.masthead/about',
      'app.masthead/brand',
      'app.masthead/toolbar-item',
      'app.masthead/user-menu',
    ];
    expect(pointIdsStartingWith('app.masthead/')).toEqual(expected);
  });

  it('declares no point under frontend/@mf-types and no duplicate ids', () => {
    expect(points().filter((p) => p.loc.file.includes('@mf-types'))).toEqual([]);
    expect(diags('point-duplicate-id')).toEqual([]);
  });

  it('does not report a literal mismatch for the connection-type exclusion guard', () => {
    // packages/k8s-core/src/connectionTypeUtils.ts excludes a field kind with
    // `field.type !== ConnectionTypeFieldType.Section`; an exclusion cannot
    // prove a literal disagrees with the predicate.
    const guard = getRepoModel().guards.find((g) => g.name === 'isConnectionTypeDataField');
    expect(guard).toBeDefined();
    expect(diags('guard-literal-mismatch')).toEqual([]);
  });
});
