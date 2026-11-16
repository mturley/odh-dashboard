import { getRepoModel } from './model';
import type { DiagnosticCode, ExtensionRecord, Value } from '../../src/model/types';

const model = getRepoModel();
const extsOf = (pkg: string): ExtensionRecord[] =>
  model.extensions.filter((extension) => extension.pkg === pkg);
const typesOf = (pkg: string, prefix: string): string[] =>
  [
    ...new Set(
      extsOf(pkg)
        .map((extension) => extension.type)
        .filter((type) => type.startsWith(prefix)),
    ),
  ].toSorted();
const contributors = (type: string): string[] =>
  [
    ...new Set(
      model.extensions
        .filter((extension) => extension.type === type)
        .map((extension) => extension.pkg),
    ),
  ].toSorted();
const flagNames = (pkg: string): string[] =>
  extsOf(pkg)
    .flatMap((extension) => extension.flags.required)
    .flatMap((value: Value) =>
      value.kind === 'enumMember' ? [`${value.enumName}.${value.member}`] : [],
    );
const diags = (code: DiagnosticCode) =>
  model.diagnostics.filter((diagnostic) => diagnostic.code === code);
const point = (id: string) => model.points.find((item) => item.id === id);

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
].map((type) => `model-serving.${type}`);

describe('extensions in the repo', () => {
  it('llm-d contributes exactly these model-serving types', () => {
    expect(typesOf('@odh-dashboard/llmd-serving', 'model-serving.')).toEqual(LLMD_TYPES.toSorted());
  });

  it('maas is the only contributor to model-serving.deployments/banner', () => {
    expect(contributors('model-serving.deployments/banner')).toEqual(['@odh-dashboard/maas']);
  });

  it('records model-serving extensions once, with static and federated entries', () => {
    expect(
      extsOf('@odh-dashboard/model-serving').every((extension) => extension.entries.length === 2),
    ).toBe(true);
  });

  it('keeps readable flag names for kserve', () => {
    expect(flagNames('@odh-dashboard/kserve')).toContain('SupportedArea.K_SERVE');
  });

  it('records the kserve serving-runtime form routes as one record x3', () => {
    expect(
      extsOf('@odh-dashboard/kserve').filter((extension) => extension.multiplicity === 3),
    ).toHaveLength(1);
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
    types.forEach((type) => expect(point(type)?.pkg).toBe('@odh-dashboard/model-registry'));
  });
});
