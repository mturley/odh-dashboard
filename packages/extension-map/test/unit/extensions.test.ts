import { analyzeFixture } from '../helpers/fixture';
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

describe('extensions collector', () => {
  it('records generated extensions once with multiplicity', () => {
    expect(ext('fx.route').multiplicity).toBe(3);
    expect(ext('fx.route').mappedValues).toHaveLength(3);
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
    expect(ext('fx.field').properties.field).toMatchObject({
      kind: 'codeRef',
      supplies: { externalDataHook: { kind: 'symbol', name: 'useData' } },
    });
  });

  it('diagnoses a CodeRef with an unsupported then callback', () => {
    expect(m.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "extension property 'values' contains a CodeRef with an unsupported then callback",
    );
  });
});
