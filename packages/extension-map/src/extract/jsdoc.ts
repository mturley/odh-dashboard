import ts from 'typescript';
import { makeDiagnostic } from '../model/diagnostics';
import type { Diagnostic, Doc } from '../model/types';

/**
 * JSDoc reading for extension point declarations (spec §5.4): the summary,
 * the documented tags, inline `{@link X}` names, and a diagnostic for `@param`
 * on a type. Returned diagnostics carry no location — the caller owns the
 * declaration and attaches it.
 */
export type ReadDocResult = { doc: Doc; diagnostics: Diagnostic[] };

/** Inline `{@link X}` names, matching either comment representation. */
const LINK_PATTERN = /\{@link\s+([^}\s]+)[^}]*\}/g;

/** Text of a (possibly qualified) JSDoc link target name. */
const nameText = (name: ts.EntityName | ts.JSDocMemberName): string =>
  ts.isIdentifier(name) ? name.text : `${nameText(name.left)}.${name.right.text}`;

/**
 * One JSDoc comment part as flat text. Link parts are rendered back to their
 * `{@link …}` source form: TypeScript only parses a comment into parts when a
 * link is present, and the link's name lives on the part, not in its text.
 */
const partText = (part: ts.JSDocComment): string => {
  if (part.kind === ts.SyntaxKind.JSDocText) {
    return part.text;
  }
  const name = part.name === undefined ? part.text : nameText(part.name);
  const form = ts.isJSDocLink(part)
    ? '{@link'
    : ts.isJSDocLinkCode(part)
    ? '{@linkcode'
    : '{@linkplain';
  return `${form} ${name}}`;
};

/** A JSDoc comment value ('' when absent) as flat text. */
const commentText = (comment: ts.JSDocTag['comment']): string => {
  if (comment === undefined) {
    return '';
  }
  return typeof comment === 'string' ? comment : comment.map(partText).join('');
};

/** The declaration's name node, when it has one. */
const declarationName = (node: ts.Node): ts.DeclarationName | undefined => {
  if (
    ts.isTypeAliasDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isVariableDeclaration(node)
  ) {
    return node.name;
  }
  return undefined;
};

/**
 * Reads the JSDoc attached to `node`. The checker resolves `node`'s symbol so
 * JSDoc attached to any declaration of the same symbol (interfaces can merge)
 * is found; the passed node covers the plain single-declaration case.
 */
export const readDoc = (node: ts.Node, checker: ts.TypeChecker): ReadDocResult => {
  const doc: Doc = { see: [], links: [], extensionData: [] };
  const diagnostics: Diagnostic[] = [];

  const name = declarationName(node);
  const symbol = name === undefined ? undefined : checker.getSymbolAtLocation(name);
  const jsdocSources: readonly ts.Node[] = symbol?.declarations ?? [node];
  const jsdocs: ts.JSDoc[] = [];
  for (const source of jsdocSources) {
    for (const part of ts.getJSDocCommentsAndTags(source)) {
      if (ts.isJSDoc(part) && !jsdocs.includes(part)) {
        jsdocs.push(part);
      }
    }
  }

  const summary = commentText(jsdocs[0]?.comment).trim();
  if (summary !== '') {
    doc.summary = summary;
  }

  for (const jsdoc of jsdocs) {
    for (const tag of jsdoc.tags ?? []) {
      const text = commentText(tag.comment).trim();
      switch (tag.tagName.text) {
        case 'remarks':
          if (text !== '') {
            doc.remarks = text;
          }
          break;
        case 'deprecated':
          doc.deprecated = text !== '' ? text : true;
          break;
        case 'see':
          {
            // `@see` targets parse into the tag's name reference; the comment
            // is the marker asterisk or link parts when a `{@link}` follows.
            const reference = ts.isJSDocSeeTag(tag) ? tag.name?.name : undefined;
            const seeText = (
              reference === undefined ? commentText(tag.comment) : nameText(reference)
            ).trim();
            if (seeText !== '') {
              doc.see.push(seeText);
            }
          }
          break;
        case 'category':
          if (text !== '') {
            doc.category = text;
          }
          break;
        case 'extensionData':
          if (text !== '') {
            doc.extensionData.push(text);
          }
          break;
        case 'param':
          diagnostics.push(
            makeDiagnostic(
              'jsdoc-param-on-type',
              '@param on a type declaration belongs on functions',
            ),
          );
          break;
        default:
          break;
      }
    }
  }

  const linkedText = [doc.summary, doc.remarks]
    .filter((text): text is string => text !== undefined)
    .join('\n');
  for (const match of linkedText.matchAll(LINK_PATTERN)) {
    doc.links.push(match[1]);
  }

  return { doc, diagnostics };
};
