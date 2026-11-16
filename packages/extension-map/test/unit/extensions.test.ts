import fs from 'node:fs';
import path from 'node:path';
import { analyzeFixture, fixtureDir } from '../helpers/fixture';
import type { DiagnosticCode, ExtensionRecord, ExtensionMapModel } from '../../src/model/types';

const m = analyzeFixture('extension-values');
const ext = (type: string): ExtensionRecord => {
  const extension = m.extensions.find((item) => item.type === type);
  if (extension === undefined) {
    throw new Error(`Missing fixture extension ${type}`);
  }
  return extension;
};
const codes = (model: ExtensionMapModel): DiagnosticCode[] =>
  model.diagnostics.map((diagnostic) => diagnostic.code);
const fixtureSourceLine = (file: string, marker: string): number => {
  const source = fs.readFileSync(
    path.join(fixtureDir('extension-values'), 'packages/p/src', file),
    'utf8',
  );
  const line = source.split(/\r?\n/u).findIndex((sourceLine) => sourceLine.includes(marker));
  if (line < 0) {
    throw new Error(`Missing fixture marker '${marker}' in ${file}`);
  }
  return line + 1;
};

describe('extensions collector', () => {
  it('records generated extensions once with multiplicity', () => {
    expect(ext('fx.route').multiplicity).toBe(3);
    expect(ext('fx.route').mappedValues).toHaveLength(3);
  });

  it('marks unknown property spreads unresolved and drops earlier possibly-overridden values', () => {
    const extension = m.extensions.find(
      (item) =>
        item.type === 'fx.route' &&
        Object.entries(item.properties).some(
          ([name, value]) =>
            name === 'after' && value.kind === 'literal' && value.value === '/after-spread',
        ),
    );
    if (extension === undefined) {
      throw new Error('Missing extension with a spread in its properties');
    }
    expect(extension.properties.path).toBeUndefined();
    expect(
      Object.values(extension.properties).some(
        (value) => value.kind === 'unresolved' && value.reason.includes('spread'),
      ),
    ).toBe(true);
    expect(
      m.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'unresolved-value' &&
          diagnostic.loc?.file.endsWith('/entry.ts') === true &&
          diagnostic.loc.line === fixtureSourceLine('entry.ts', '...dynamicProperties()'),
      ),
    ).toBe(true);
  });

  it('keeps nested object spreads unresolved without claiming earlier values', () => {
    const { values } = ext('fx.value').properties;
    if (values.kind !== 'object') {
      throw new Error('Expected fx.value values to resolve as an object');
    }
    expect(values.props.before).toBeUndefined();
    expect(values.props.after).toEqual({ kind: 'literal', value: 'after-spread' });
    expect(
      Object.values(values.props).some(
        (value) => value.kind === 'unresolved' && value.reason.includes('spread'),
      ),
    ).toBe(true);
    expect(
      m.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'unresolved-value' &&
          diagnostic.loc?.file.endsWith('/entry.ts') === true &&
          diagnostic.loc.line === fixtureSourceLine('entry.ts', '...dynamicValues()'),
      ),
    ).toBe(true);
  });

  it('associates an excluded default-forwarding entry with proven extensions', () => {
    expect(ext('fx.shared').entries).toEqual(
      expect.arrayContaining(['@fx/extensions#./extensions', '@fx/extensions#./extensions/alias']),
    );
    expect(ext('fx.shared').entries).toHaveLength(2);
  });

  it('reports an unsupported excluded entry without inventing contributions', () => {
    expect(
      m.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'unresolved-element' &&
          diagnostic.message.includes('./extensions/unsupported'),
      ),
    ).toBe(true);
    expect(ext('fx.shared').entries).not.toContain('@fx/extensions#./extensions/unsupported');
  });

  it('reports unrecognized elements and unknown points', () => {
    expect(codes(m)).toEqual(
      expect.arrayContaining(['unresolved-element', 'extension-unknown-point']),
    );
  });

  it('reads supplies from a CodeRef target object', () => {
    const extension = m.extensions.find((item) => {
      const { field } = item.properties;
      return (
        item.type === 'fx.field' &&
        field.kind === 'codeRef' &&
        field.supplies?.externalDataHook?.kind === 'symbol'
      );
    });
    if (extension === undefined) {
      throw new Error('Missing CodeRef extension with statically resolved supplies');
    }
    expect(extension.properties.field).toMatchObject({
      kind: 'codeRef',
      supplies: { externalDataHook: { kind: 'symbol', name: 'useData' } },
    });
  });

  it('marks unknown CodeRef supply spreads unresolved and drops earlier possibly-overridden supplies', () => {
    const extension = m.extensions.find((item) => {
      const { field } = item.properties;
      return (
        item.type === 'fx.field' &&
        field.kind === 'codeRef' &&
        Object.values(field.supplies ?? {}).some(
          (value) => value.kind === 'unresolved' && value.reason.includes('spread'),
        )
      );
    });
    if (extension === undefined) {
      throw new Error('Missing CodeRef extension with spread supplies');
    }
    const { field } = extension.properties;
    if (field.kind !== 'codeRef') {
      throw new Error('Expected the extension field to resolve as a CodeRef');
    }
    expect(field.supplies?.externalDataHook).toBeUndefined();
    expect(field.supplies?.label).toEqual({ kind: 'literal', value: 'after-spread' });
    expect(
      m.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'unresolved-value' &&
          diagnostic.loc?.file.endsWith('/m.ts') === true &&
          diagnostic.loc.line === fixtureSourceLine('m.ts', '...dynamicSupplies()'),
      ),
    ).toBe(true);
  });

  it('diagnoses a CodeRef with an unsupported then callback', () => {
    expect(m.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "extension property 'values' contains a CodeRef with an unsupported then callback",
    );
  });
});
