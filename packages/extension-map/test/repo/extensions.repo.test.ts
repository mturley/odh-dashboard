import { contributors, diags, extsOf, flagNames, getRepoModel, pkg, point, typesOf } from './model';
import { renderPackagePage } from '../../src/render/packagePage';

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

  it('reads every array element of every entry', () => {
    expect(diags('unresolved-element')).toEqual([]);
    expect(diags('multiplicity-unknown')).toEqual([]);
  });

  it('merges the nim-serving form-data extension declared by spreading kserve', () => {
    const found = extsOf('@odh-dashboard/nim-serving').filter(
      (e) =>
        e.type === 'model-serving.deployment/form-data' &&
        e.loc.file === 'packages/nim-serving/extensions/nim-kserve.ts',
    );
    expect(found).toHaveLength(1);
    const [extension] = found;
    expect(extension.loc.line).toBe(113);
    // Overridden by the spreading element.
    expect(extension.properties.priority).toEqual({ kind: 'literal', value: 50 });
    expect(extension.properties.isActive).toMatchObject({
      kind: 'codeRef',
      module: 'packages/nim-serving/src/nimKServe/extractFormData.ts',
      export: 'isNIMKServeDeployment',
    });
    expect(extension.flags.required).toEqual([
      {
        kind: 'enumMember',
        enumName: 'SupportedArea',
        member: 'NIM_WIZARD',
        value: 'nim-wizard',
      },
    ]);
    // Inherited from the kserve object the element spreads.
    expect(extension.properties.platform).toEqual({
      kind: 'constant',
      name: 'KSERVE_ID',
      value: 'kserve',
    });
  });

  it('attaches model-serving contributions to model-registry points', () => {
    const types = typesOf('@odh-dashboard/model-serving', 'model-registry.');
    expect(types.length).toBeGreaterThan(0);
    types.forEach((t) => expect(point(t).pkg).toBe('@odh-dashboard/model-registry'));
  });

  it('records the const the nim-kserve form-data extension is bound to, and labels it so', () => {
    const [extension] = extsOf('@odh-dashboard/nim-serving').filter(
      (e) =>
        e.type === 'model-serving.deployment/form-data' &&
        e.loc.file === 'packages/nim-serving/extensions/nim-kserve.ts' &&
        e.loc.line === 113,
    );
    expect(extension.binding).toBe('nimKServeFormDataExtension');
    const { content } = renderPackagePage(getRepoModel(), pkg('@odh-dashboard/nim-serving'));
    expect(content).toContain(
      '[nimKServeFormDataExtension](#contributes-to-model-servingdeploymentform-data)',
    );
    expect(content).toContain('| nimKServeFormDataExtension | hardwareProfilePaths →');
    // The binding, not the first CodeRef export, names the contribution.
    expect(content).not.toContain('[extractDeploymentStrategy](#contributes-to');
  });

  it('names the declaring file of a re-exported CodeRef target, and the module it imports', () => {
    const [extension] = extsOf('@odh-dashboard/kserve').filter(
      (e) =>
        e.type === 'model-serving.deployment/form-data' &&
        e.loc.file === 'packages/kserve/extensions.ts',
    );
    expect(extension.binding).toBe('kserveFormDataExtension');
    expect(extension.properties.hardwareProfilePaths).toMatchObject({
      kind: 'codeRef',
      module: 'packages/kserve/src/hardware.ts',
      target: { file: 'packages/hardware-profiles/shared/const.ts' },
    });
    const { content } = renderPackagePage(getRepoModel(), pkg('@odh-dashboard/kserve'));
    expect(content).toMatch(
      /\[const#INFERENCE_SERVICE_HARDWARE_PROFILE_PATHS\]\([^)]*\) \(via `hardware`\)/,
    );
  });

  it('names the timeout field validation schema as a code reference', () => {
    const { content } = renderPackagePage(getRepoModel(), pkg('@odh-dashboard/kserve'));
    expect(content).toMatch(
      /\| kserveTimeoutFieldExtension \| reducerFunctions \| .*validationSchema: timeoutFieldSchema/,
    );
    expect(content).not.toContain(
      '| kserveTimeoutFieldExtension | field → reducerFunctions.validationSchema |',
    );
  });
});
