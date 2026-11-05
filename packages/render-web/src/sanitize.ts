/**
 * BLKC Render-Web - Lightweight HTML sanitiser for rich text.
 *
 * @package @blkc-code/render-web
 * @license Apache-2.0
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "a",
  "ul", "ol", "li", "h3", "h4", "blockquote",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
};

const SAFE_SCHEME = /^(https?:|mailto:|tel:|\/(?!\/)|#)/i;
const HTTP_SCHEME = /^https?:/i;

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(tag)) !== null) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

export function cleanRichText(html: string): string {
  if (!html || !html.trim()) return "";

  const result: string[] = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  // stack tracks whether an <a> was converted to <span>
  const stack: string[] = [];

  while ((match = tagRegex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      result.push(escapeText(html.slice(lastIndex, match.index)));
    }

    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const isClosing = fullTag.startsWith("</");

    if (!ALLOWED_TAGS.has(tagName)) {
      // Drop script/style entirely (tag + content), not just the tag.
      if (tagName === "script" || tagName === "style") {
        const closeTag = `</${tagName}>`;
        const closeIdx = html.toLowerCase().indexOf(closeTag, match.index);
        if (closeIdx !== -1) {
          lastIndex = closeIdx + closeTag.length;
          tagRegex.lastIndex = lastIndex;
          continue;
        }
      }
      lastIndex = match.index + fullTag.length;
      continue;
    }

    if (isClosing) {
      // if the matching open was converted to span, close as span
      const converted = stack.pop();
      if (converted === "span") {
        result.push("</span>");
      } else {
        result.push(`</${tagName}>`);
      }
    } else if (tagName === "br") {
      result.push("<br />");
    } else {
      const attrs = parseAttributes(fullTag);
      const allowed = ALLOWED_ATTRS[tagName] ?? new Set();
      const safeAttrs: string[] = [];
      let emitTag = tagName;

      if (tagName === "a" && allowed.has("href")) {
        const href = (attrs["href"] ?? "").trim();
        if (SAFE_SCHEME.test(href)) {
          safeAttrs.push(`href="${escapeAttr(href)}"`);
          if (HTTP_SCHEME.test(href)) {
            safeAttrs.push('target="_blank"', 'rel="noopener noreferrer"');
          }
        } else {
          // unsafe scheme: render as span, keep text
          emitTag = "span";
        }
      }

      const attrStr = safeAttrs.length ? " " + safeAttrs.join(" ") : "";
      result.push(`<${emitTag}${attrStr}>`);
      stack.push(emitTag === "span" && tagName === "a" ? "span" : tagName);
    }

    lastIndex = match.index + fullTag.length;
  }

  if (lastIndex < html.length) {
    result.push(escapeText(html.slice(lastIndex)));
  }

  let cleaned = result.join("");
  cleaned = cleaned.replace(/<p>\s*<\/p>/g, "");
  return cleaned.trim();
}