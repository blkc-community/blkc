/**
 * BLKC Render-Web - Rich text.
 *
 * `richtext` attributes hold TipTap JSON (spec Q1) or an HTML string. Both end at
 * the same allow-list: JSON is converted to HTML and then sanitised like any other.
 *
 * @package @blkc-code/render-web
 * @license Apache-2.0
 */

import { cleanRichText } from "./sanitize.js";

export interface RichTextNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichTextNode[];
}

export type RichText = string | RichTextNode;

const MARK_TAGS: Record<string, string> = {
  bold: "strong",
  italic: "em",
  underline: "u",
  strike: "s",
};

const NODE_TAGS: Record<string, string> = {
  paragraph: "p",
  bulletList: "ul",
  orderedList: "ol",
  listItem: "li",
  blockquote: "blockquote",
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function textNode(node: RichTextNode): string {
  let html = escapeHtml(node.text ?? "");
  for (const mark of node.marks ?? []) {
    if (mark.type === "link") {
      html = `<a href="${escapeHtml(String(mark.attrs?.["href"] ?? ""))}">${html}</a>`;
    } else if (MARK_TAGS[mark.type]) {
      html = `<${MARK_TAGS[mark.type]}>${html}</${MARK_TAGS[mark.type]}>`;
    }
  }
  return html;
}

function nodeToHtml(node: RichTextNode): string {
  if (node.type === "text") return textNode(node);
  if (node.type === "hardBreak") return "<br>";

  const inner = (node.content ?? []).map(nodeToHtml).join("");
  // Page headings belong to the Block, so rich text starts at h3.
  if (node.type === "heading") {
    const tag = Number(node.attrs?.["level"]) >= 4 ? "h4" : "h3";
    return `<${tag}>${inner}</${tag}>`;
  }
  const tag = NODE_TAGS[node.type];
  return tag ? `<${tag}>${inner}</${tag}>` : inner; // unknown nodes keep their text
}

/** Rich text of either form, as sanitised HTML. */
export function richTextToHtml(value: RichText | null | undefined): string {
  if (!value) return "";
  return cleanRichText(typeof value === "string" ? value : nodeToHtml(value));
}
