import { diags, getRepoModel, point, pointIdsStartingWith, points } from './model';
import type { ExtensionPoint } from '../../src/model/types';

const prop = (id: string, name: string): ExtensionPoint['properties'][number] => {
  const found = point(id).properties.find((p) => p.name === name);
  if (!found) {
    throw new Error(`No property ${name} on point ${id}`);
  }
  return found;
};

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

  it('carries the inner type of a CodeRef property to its declaration', () => {
    expect(prop('model-serving.deployment/wizard-field', 'field').codeRef).toEqual({
      inner: 'WizardFieldType',
      innerKey: expect.stringMatching(
        /^packages\/model-serving\/src\/shared\/types\/form-data\.ts:\d+$/,
      ),
    });
  });

  it('resolves a ComponentCodeRef to the component it carries, with no carried-type key', () => {
    const { codeRef } = prop('app.route', 'component');
    expect(codeRef?.inner).toContain('ComponentType');
    expect(codeRef?.innerKey).toBeUndefined();
  });

  it('declares no extension guard in packages/k8s-core and no guard without a point', () => {
    expect(
      getRepoModel().guards.filter((g) => g.loc.file.startsWith('packages/k8s-core/')),
    ).toEqual([]);
    expect(diags('guard-no-point')).toEqual([]);
  });
});
