/* global document */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { JSDOM } from "jsdom";
import { parseAnyKit, type KitManifest } from "@blkc-code/core";
import { renderToStaticMarkup } from "react-dom/server";
import { KitPage } from "./kit.js";
import { richTextToHtml } from "./richtext.js";
import { renderToHTML } from "./server.js";
import { themeJsonToVariables } from "./utils.js";

const url = (file: string) => path.join(process.cwd(), "fixtures", file);
const fixture = JSON.parse(readFileSync(url("kit-basic.json"), "utf8")) as KitManifest;

describe("shared snapshot: fixtures/kit-basic", () => {
  it("the fixture is a valid Kit", () => {
    expect(parseAnyKit(fixture).value.id).toBe("fixture-kit");
  });

  it("renderToHTML matches the checked-in HTML (UPDATE_FIXTURES=1 to refresh)", () => {
    const result = renderToHTML(fixture, "home");
    expect(result.success, result.error).toBe(true);
    if (process.env["UPDATE_FIXTURES"]) writeFileSync(url("kit-basic.html"), result.html + "\n");
    expect(result.html + "\n").toBe(readFileSync(url("kit-basic.html"), "utf8"));
  });

  it("React and HTML output agree", () => {
    expect(renderToStaticMarkup(<KitPage kit={fixture} page="home" />)).toBe(renderToHTML(fixture, "home").html);
  });

  it("applies the theme as CSS variables", () => {
    const { html } = renderToHTML(fixture, "home");
    expect(html).toContain("--blkc-color-primary:#7a1f3d");
    expect(html).toContain("--blkc-color-text:#1b1b1f");
    expect(html).toContain("--blkc-font-family-heading:Inter, sans-serif");
    expect(html).toContain("--blkc-border-radius:0.75rem");
  });

  it("has no axe violations and one h1", async () => {
    document.documentElement.lang = "en";
    document.title = "t";
    document.body.innerHTML = `<main>${renderToHTML(fixture, "home").html}</main>`;
    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });
});

describe("themeJsonToVariables", () => {
  it("refuses values that could break out of a declaration", () => {
    const vars = themeJsonToVariables({
      version: 3,
      settings: {
        color: {
          palette: [
            { slug: "primary", name: "P", color: "red; background: url(https://evil.test)" },
            { slug: "secondary", name: "S", color: "</style><script>" },
            { slug: "accent", name: "A", color: "#123456" },
          ],
        },
      },
    });
    expect(vars).toEqual({ "--blkc-color-accent": "#123456" });
  });

  it("maps palette slugs to the variables the utilities read", () => {
    const vars = themeJsonToVariables({
      version: 3,
      settings: {
        color: {
          palette: [
            { slug: "foreground", name: "F", color: "#111111" },
            { slug: "muted-foreground", name: "M", color: "#222222" },
            { slug: "muted", name: "S", color: "#333333" },
          ],
        },
      },
    });
    expect(vars["--blkc-color-text"]).toBe("#111111");
    expect(vars["--blkc-color-text-secondary"]).toBe("#222222");
    expect(vars["--blkc-color-muted"]).toBe("#333333");
  });

  it("returns nothing for no theme", () => {
    expect(themeJsonToVariables(undefined)).toEqual({});
  });
});

describe("richTextToHtml", () => {
  it("converts TipTap JSON", () => {
    expect(
      richTextToHtml({
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
          { type: "paragraph", content: [{ type: "text", text: "a" }, { type: "hardBreak" }, { type: "text", text: "b", marks: [{ type: "italic" }] }] },
          { type: "bulletList", content: [{ type: "listItem", content: [{ type: "text", text: "x" }] }] },
        ],
      }),
    ).toBe("<h3>Title</h3><p>a<br /><em>b</em></p><ul><li>x</li></ul>");
  });

  it("escapes text in JSON, so it can't become markup", () => {
    expect(richTextToHtml({ type: "text", text: "<script>alert(1)</script>" })).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("refuses an unsafe link in JSON", () => {
    const html = richTextToHtml({ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] });
    expect(html).toBe("<span>x</span>");
  });

  it("can't break out of href through a quote in JSON", () => {
    const html = richTextToHtml({ type: "text", text: "x", marks: [{ type: "link", attrs: { href: 'https://a.test" onclick="alert(1)' } }] });
    const link = new JSDOM(html).window.document.querySelector("a");
    expect(link?.hasAttribute("onclick")).toBe(false);
  });

  it("accepts an HTML string and empty values", () => {
    expect(richTextToHtml("<p>x</p>")).toBe("<p>x</p>");
    expect(richTextToHtml(undefined)).toBe("");
  });
});
