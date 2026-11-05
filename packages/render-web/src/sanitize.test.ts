import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { cleanRichText } from "./sanitize.js";

const parse = (html: string) => new JSDOM(`<div id="root">${html}</div><p id="after">after</p>`).window.document;

describe("cleanRichText: keeps what it should", () => {
  it.each([
    ["<p>Hello <strong>world</strong></p>", "<p>Hello <strong>world</strong></p>"],
    ["<p>Tom &amp; Jerry</p>", "<p>Tom &amp; Jerry</p>"],
    ["<p>&#169; 2026 &#xA9;</p>", "<p>&#169; 2026 &#xA9;</p>"],
    ["<p>a & b</p>", "<p>a &amp; b</p>"],
    ["<p>1 &lt; 2</p>", "<p>1 &lt; 2</p>"],
    ["line<br>next", "line<br />next"],
    ['<a href="https://a.test/?x=1&amp;y=2">l</a>', '<a href="https://a.test/?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">l</a>'],
    ['<a href="/about">l</a>', '<a href="/about">l</a>'],
    ['<a href="mailto:a@b.test">l</a>', '<a href="mailto:a@b.test">l</a>'],
    ['<a href="#top">l</a>', '<a href="#top">l</a>'],
    ["<ul><li>x</li></ul>", "<ul><li>x</li></ul>"],
    ["", ""],
  ])("%s", (input, output) => {
    expect(cleanRichText(input)).toBe(output);
  });
});

describe("cleanRichText: balances tags", () => {
  it("closes what was left open, so nothing leaks past the block", () => {
    const doc = parse(cleanRichText("<p><strong>bold"));
    expect(cleanRichText("<p><strong>bold")).toBe("<p><strong>bold</strong></p>");
    expect(doc.querySelector("#after")?.closest("strong")).toBeNull();
  });

  it("drops a closing tag with no open tag", () => {
    expect(cleanRichText("text</strong></p>")).toBe("text");
  });

  it("closes skipped elements for a mismatched close", () => {
    expect(cleanRichText("<em><strong>x</em>y")).toBe("<em><strong>x</strong></em>y");
  });

  it("closes a neutralised link as a span", () => {
    expect(cleanRichText('<a href="javascript:x">t</a>')).toBe("<span>t</span>");
  });
});

// Each payload is judged by parsing the output like a browser, not by string matching.
const PAYLOADS = [
  "<script>alert(1)</script>",
  "<SCRIPT SRC=//e.test/x.js></SCRIPT>",
  "<script>alert(1)",
  "<script>alert(1)</script foo>",
  "<scr<!-- -->ipt>alert(1)</script>",
  "<scr<script>ipt>alert(1)</scr</script>ipt>",
  "<img src=x onerror=alert(1)>",
  "<img src=x onerror=alert(1)",
  "<svg/onload=alert(1)>",
  "<svg><script>alert(1)</script></svg>",
  "<iframe src=javascript:alert(1)></iframe>",
  "<math><mtext><img src=x onerror=alert(1)></mtext></math>",
  "<p onclick=alert(1)>x</p>",
  '<p style="background:url(javascript:alert(1))">x</p>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href=" javascript:alert(1)">x</a>',
  '<a href="java\tscript:alert(1)">x</a>',
  '<a href="&#106;avascript:alert(1)">x</a>',
  '<a href="javascript&colon;alert(1)">x</a>',
  '<a href="data:text/html,<script>alert(1)</script>">x</a>',
  '<a href="vbscript:x">x</a>',
  '<a title="x" onmouseover="alert(1)" href="https://a.test">x</a>',
  '<a href="https://a.test" onclick="alert(1)">x</a>',
  '<a href="https://a.test"onclick="alert(1)">x</a>',
  '<a href=\'https://a.test" onclick="alert(1)\'>x</a>',
  '<p title="><script>alert(1)</script>">x</p>',
  "<form action=javascript:alert(1)><input type=submit></form>",
  "<<script>alert(1)</script>",
  "<!-- --><script>alert(1)</script>",
  "<!--><script>alert(1)</script>-->",
  "&lt;script&gt;alert(1)&lt;/script&gt;",
];

describe("cleanRichText: hostile input", () => {
  it.each(PAYLOADS)("%s", (payload) => {
    const doc = parse(cleanRichText(payload));
    expect(doc.querySelectorAll("script, img, svg, iframe, math, form, input, style")).toHaveLength(0);
    for (const element of Array.from(doc.querySelectorAll("#root *"))) {
      for (const attribute of Array.from(element.attributes)) {
        expect(attribute.name).toMatch(/^(href|target|rel)$/);
      }
      const href = element.getAttribute("href");
      if (href !== null) expect(href).toMatch(/^(https?:|mailto:|tel:|\/|#)/i);
    }
  });

  it.each([
    "//evil.test",
    "/\\evil.test",
    "/\t/evil.test",
    "/&#47;evil.test",
    "\\\\evil.test",
  ])("does not allow %s to become an off-site link", (href) => {
    expect(cleanRichText(`<a href="${href}">x</a>`)).toBe("<span>x</span>");
  });
});
