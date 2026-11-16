import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const TYPES_FILE = path.join(__dirname, '..', '..', 'src', 'model', 'types.ts');

/** The text of the JSDoc comments attached to a node, empty when it has none. */
const jsDocText = (node: ts.Node): string =>
  ts
    .getJSDocCommentsAndTags(node)
    .filter(ts.isJSDoc)
    .map((doc) => ts.getTextOfJSDocComment(doc.comment) ?? '')
    .join('\n')
    .trim();

/** Every property signature inside a type node, however deeply nested. */
const propertySignatures = (node: ts.Node): ts.PropertySignature[] => {
  const found: ts.PropertySignature[] = [];
  const walk = (current: ts.Node): void => {
    if (ts.isPropertySignature(current)) {
      found.push(current);
    }
    current.forEachChild(walk);
  };
  walk(node);
  return found;
};

const isExported = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** `Type` or `Type.path.to.property`, so a failure names what lacks a comment. */
const undocumented = (source: ts.SourceFile): string[] =>
  source.statements.filter(ts.isTypeAliasDeclaration).flatMap((alias) => {
    const name = alias.name.text;
    const missing = isExported(alias) && jsDocText(alias) === '' ? [name] : [];
    const props = propertySignatures(alias.type)
      .filter((prop) => jsDocText(prop) === '')
      .map(
        (prop) =>
          `${name}.${prop.name.getText(source)} (line ${
            source.getLineAndCharacterOfPosition(prop.getStart(source)).line + 1
          })`,
      );
    return [...missing, ...props];
  });

describe('model documentation', () => {
  const source = ts.createSourceFile(
    TYPES_FILE,
    fs.readFileSync(TYPES_FILE, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

  it('declares the model only as type aliases', () => {
    expect(source.statements.filter(ts.isInterfaceDeclaration)).toEqual([]);
  });

  it('documents every exported type and every property inside one', () => {
    expect(undocumented(source)).toEqual([]);
  });

  it('detects a property without a comment, including inside a union member', () => {
    const probe = ts.createSourceFile(
      'probe.ts',
      [
        '/** Documented. */',
        'export type V =',
        '  | {',
        '      /** Kind. */',
        "      kind: 'a';",
        '      loose: string;',
        '    }',
        '  | {',
        '      /** Kind. */',
        "      kind: 'b';",
        '      nested: {',
        '        /** Ok. */',
        '        ok: number;',
        '        bare: string;',
        '      }[];',
        '    };',
        'export type Bare = {',
        '  /** Ok. */',
        '  ok: string;',
        '};',
      ].join('\n'),
      ts.ScriptTarget.Latest,
      true,
    );
    expect(undocumented(probe)).toEqual([
      'V.loose (line 6)',
      'V.nested (line 11)',
      'V.bare (line 14)',
      'Bare',
    ]);
  });
});
