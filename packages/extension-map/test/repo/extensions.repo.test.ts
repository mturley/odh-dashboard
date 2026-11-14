import { contributors, diags, extsOf, flagNames, point, typesOf } from './model';

const LLMD_TYPES = [
  'platform/watch-deployments',
  'deployment/deploy',
  'deployment/form-data',
  'deployment/wizard-field',
  'deployments-table/start-stop-action',
  'deployed-model/serving-runtime',
  'deployment/assemble-model-resource',
  'deployment/tracking-properties',
  'deployment/wizard-field-apply',
  'deployment/wizard-field-deployment-functions',
  'deployment/wizard-field-extractor',
  'deployment/wizard-field-override',
  'platform/delete-deployment',
  'runtime-image/install-target',
].map((t) => `model-serving.${t}`);

describe('extensions on the real repo', () => {
  it('llm-d contributes exactly these model-serving types', () => {
    expect(typesOf('@odh-dashboard/llmd-serving', 'model-serving.')).toEqual(LLMD_TYPES.toSorted());
  });

  it('maas is the only contributor to model-serving.deployments/banner', () => {
    expect(contributors('model-serving.deployments/banner')).toEqual(['@odh-dashboard/maas']);
  });

  it('records model-serving extensions once, with static and federated entries', () => {
    expect(extsOf('@odh-dashboard/model-serving').every((e) => e.entries.length === 2)).toBe(true);
  });

  it('keeps readable flag names for kserve', () => {
    expect(flagNames('@odh-dashboard/kserve')).toContain('SupportedArea.K_SERVE');
  });

  it('records the kserve serving-runtime form routes as one record x3', () => {
    expect(extsOf('@odh-dashboard/kserve').filter((e) => e.multiplicity === 3)).toHaveLength(1);
  });

  it('has no contributor to model-serving.deployment/transform', () => {
    expect(contributors('model-serving.deployment/transform')).toEqual([]);
  });

  it('matches every extension to a point', () => {
    expect(diags('extension-unknown-point')).toEqual([]);
  });

  it('attaches model-serving contributions to model-registry points', () => {
    const types = typesOf('@odh-dashboard/model-serving', 'model-registry.');
    expect(types.length).toBeGreaterThan(0);
    types.forEach((t) => expect(point(t).pkg).toBe('@odh-dashboard/model-registry'));
  });
});
