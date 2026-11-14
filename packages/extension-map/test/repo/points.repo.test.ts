import { diags, point, pointIdsStartingWith, points } from './model';

describe('extension points on the real repo', () => {
  it('finds model-serving.deployment/transform with its guard', () => {
    expect(point('model-serving.deployment/transform').guards).toHaveLength(1);
  });

  it('detects app.suppress and app.patch, declared with typeof constants', () => {
    expect(point('app.suppress').guards).toHaveLength(1);
    expect(point('app.patch').guards).toHaveLength(1);
  });

  it('attributes model-registry points to model-registry at their upstream source', () => {
    const p = point('model-registry.tracking/provider');
    expect(p.pkg).toBe('@odh-dashboard/model-registry');
    expect(p.loc.file).toMatch(
      /^packages\/model-registry\/upstream\/frontend\/src\/odh\/extension-points\//,
    );
    expect(p.guards).toEqual(['isUserInteractionProviderExtension']);
  });

  it('reads the WizardFieldExtractorExtension summary', () => {
    const p = point('model-serving.deployment/wizard-field-extractor');
    expect(p.doc.summary).toMatch(/^Extension for extracting initial data/);
  });

  it('finds the four masthead points in plugin-core', () => {
    const expected = [
      'app.masthead/about',
      'app.masthead/brand',
      'app.masthead/toolbar-item',
      'app.masthead/user-menu',
    ];
    expect(pointIdsStartingWith('app.masthead/')).toEqual(expected);
    expect(point('app.masthead/brand').pkg).toBe('@odh-dashboard/plugin-core');
  });

  it('declares no point under frontend/@mf-types and no duplicate ids', () => {
    expect(points().filter((p) => p.loc.file.includes('@mf-types'))).toEqual([]);
    expect(diags('point-duplicate-id')).toEqual([]);
  });

  it('records a ComponentCodeRef property of a point', () => {
    const p = point('app.route');
    expect(p.properties.find((prop) => prop.name === 'component')?.codeRef).toBeDefined();
  });
});
