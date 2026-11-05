/**
 * BLKC Render-Web - HTML sanitiser for rich text.
 *
 * Safe by construction: the output is rebuilt from an allow-list, so no input
 * attribute or tag is ever copied through. Only `href` survives, and only after
 * its scheme is checked. All other text is escaped.
 *
 * @package @blkc-code/render-web
 * @license Apache-2.0
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "a",
  "ul", "ol", "li", "h3", "h4", "blockquote",
]);

/** Dropped with their contents. Everything else disallowed keeps its text. */
const DROP_WITH_CONTENT = new Set(["script", "style"]);

/** A same-site path may not become protocol-relative once a browser normalises it. */
const SAFE_SCHEME = /^(https?:|mailto:|tel:|\/(?![/\\&])|#)/i;
const HTTP_SCHEME = /^https?:/i;
/** Browsers strip these inside URLs, so `/<tab>/evil.com` would become `//evil.com`. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Escape `&` unless it already starts an entity, so `&amp;` stays `&amp;`. */
const BARE_AMPERSAND = /&(?!(?:[a-z][a-z0-9]*|#\d+|#x[0-9a-f]+);)/gi;

function escapeText(text: string): string {
  return text.replace(BARE_AMPERSAND, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

function hrefOf(tag: string): string | undefined {
  const match = /[\s/"']href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : undefined;
}

function isSafeHref(href: string): boolean {
  return SAFE_SCHEME.test(href) && !CONTROL_CHARS.test(href);
}

export function cleanRichText(html: string): string {
  if (!html || !html.trim()) return "";

  // Comments first, so a tag split by a comment is still seen as a tag below.
  const source = html.replace(/<!--[\s\S]*?-->/g, "");
  const lower = source.toLowerCase();

  const result: string[] = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  /** Open elements as written, each with the tag that was emitted for it. */
  const stack: { name: string; emitted: string }[] = [];

  while ((match = tagRegex.exec(source)) !== null) {
    if (match.index > lastIndex) {
      result.push(escapeText(source.slice(lastIndex, match.index)));
    }

    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const isClosing = fullTag.startsWith("</");
    lastIndex = match.index + fullTag.length;

    if (!ALLOWED_TAGS.has(tagName)) {
      if (!isClosing && DROP_WITH_CONTENT.has(tagName)) {
        const closeIdx = lower.indexOf(`</${tagName}`, lastIndex);
        const closeEnd = closeIdx === -1 ? -1 : source.indexOf(">", closeIdx);
        // Unterminated: a browser would treat the rest as script, so drop the rest.
        lastIndex = closeEnd === -1 ? source.length : closeEnd + 1;
        tagRegex.lastIndex = lastIndex;
      }
      continue;
    }

    if (tagName === "br") {
      if (!isClosing) result.push("<br />");
      continue;
    }

    if (isClosing) {
      // A closing tag with no matching open is dropped. One that skips over open
      // elements closes them first, so the output stays balanced.
      let open = stack.length - 1;
      while (open >= 0 && stack[open].name !== tagName) open--;
      if (open < 0) continue;
      while (stack.length > open) result.push(`</${stack.pop()!.emitted}>`);
      continue;
    }

    let emitted = tagName;
    let attrs = "";
    if (tagName === "a") {
      const href = (hrefOf(fullTag) ?? "").trim();
      if (isSafeHref(href)) {
        attrs = ` href="${escapeAttr(href)}"`;
        if (HTTP_SCHEME.test(href)) attrs += ' target="_blank" rel="noopener noreferrer"';
      } else {
        emitted = "span"; // unsafe or missing link: keep the text
      }
    }
    result.push(`<${emitted}${attrs}>`);
    stack.push({ name: tagName, emitted });
  }

  if (lastIndex < source.length) {
    result.push(escapeText(source.slice(lastIndex)));
  }

  // Close anything left open, or it would leak formatting into the rest of the page.
  while (stack.length > 0) result.push(`</${stack.pop()!.emitted}>`);

  return result.join("").replace(/<p>\s*<\/p>/g, "").trim();
}
