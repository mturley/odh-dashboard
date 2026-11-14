import ts from 'typescript';
import { pkgForFile } from '../discovery/workspace';
import { makeDiagnostic } from '../model/diagnostics';
import type { Diagnostic, Doc } from '../model/types';
import { locOf } from '../programs/identity';
import type { ProgramCtx } from '../programs/stream';

export type DocResult = { doc: Doc; diagnostics: Diagnostic[] };

type LinkTag = ts.JSDocLink | ts.JSDocLinkCode | ts.JSDocLinkPlain;

const isLink = (part: ts.JSDocComment): part is LinkTag =>
  ts.isJSDocLink(part) || ts.isJSDocLinkCode(part) || ts.isJSDocLinkPlain(part);

const entityName = (name: ts.EntityName | ts.JSDocMemberName): string =>
  ts.isIdentifier(name) ? name.text : name.getText();

/** The symbol or URL an inline `{@link …}` points at, without any display label. */
const linkTarget = (part: LinkTag): string =>
  part.name ? entityName(part.name) : part.text.trim().split(/[\s|]/)[0];

/**
 * Renders a JSDoc comment as text, keeping `{@link X}` inline (so a renderer can turn it into a
 * cross-link) and appending every linked name to `links`.
 */
const commentText = (
  comment: string | ts.NodeArray<ts.JSDocComment> | undefined,
  links: string[],
): string => {
  if (comment === undefined) {
    return '';
  }
  if (typeof comment === 'string') {
    return comment;
  }
  return comment
    .map((part) => {
      if (!isLink(part)) {
        return part.text;
      }
      const target = linkTarget(part);
      if (target) {
        links.push(target);
      }
      const raw = part.name ? `${entityName(part.name)}${part.text}` : part.text;
      return `{@link ${raw.trim()}}`;
    })
    .join('');
};

const seeText = (tag: ts.JSDocTag, links: string[]): string => {
  const named = ts.isJSDocSeeTag(tag) && tag.name ? entityName(tag.name.name) : '';
  return [named, commentText(tag.comment, links).trim()].filter(Boolean).join(' ');
};

const emptyDoc = (): Doc => ({ see: [], links: [], extensionData: [] });

/** True when a declaration carries no documentation the map can show. */
export const isEmptyDoc = (doc: Doc): boolean =>
  doc.summary === undefined &&
  doc.remarks === undefined &&
  doc.deprecated === undefined &&
  doc.category === undefined &&
  doc.see.length === 0 &&
  doc.links.length === 0 &&
  doc.extensionData.length === 0;

/**
 * Reads the JSDoc of a declaration: its summary, the tags the map renders, and the names of its
 * inline `{@link …}` references. `@param` belongs on a function, so finding one on a type is
 * reported rather than ignored.
 */
export const readDoc = (node: ts.Node, ctx: ProgramCtx): DocResult => {
  const doc = emptyDoc();
  const diagnostics: Diagnostic[] = [];
  const comments = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc);
  const summary = comments
    .map((comment) => commentText(comment.comment, doc.links).trim())
    .filter(Boolean)
    .join('\n\n');
  if (summary) {
    doc.summary = summary;
  }
  const tags = comments.flatMap((comment) => (comment.tags ? [...comment.tags] : []));
  for (const tag of tags) {
    const text = commentText(tag.comment, doc.links).trim();
    switch (tag.tagName.text) {
      case 'remarks':
        doc.remarks = doc.remarks === undefined ? text : `${doc.remarks}\n\n${text}`;
        break;
      case 'deprecated':
        doc.deprecated = text === '' ? true : text;
        break;
      case 'see':
        doc.see.push(seeText(tag, doc.links));
        break;
      case 'category':
        doc.category = text;
        break;
      case 'extensionData':
        doc.extensionData.push(text);
        break;
      case 'param': {
        const loc = locOf(node, ctx);
        diagnostics.push(
          makeDiagnostic(
            'jsdoc-param-on-type',
            `@param belongs on a function, not on the type declaration it documents.`,
            loc,
            pkgForFile(loc.file, ctx.ws),
          ),
        );
        break;
      }
      default:
        break;
    }
  }
  return { doc, diagnostics };
};
