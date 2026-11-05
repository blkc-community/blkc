import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import axe from "axe-core";
import { renderToHTML } from "./server.js";
import { cleanRichText } from "./sanitize.js";
import type { KitManifest } from "@blkc-code/core";

const kit = {
  manifestVersion: 2 as const,
  id: "a11y-kit",
  name: "A11y Kit",
  summary: "s",
  description: "d",
  version: "0.1.0",
  blocks: [],
  content: {
    pages: [
      {
        slug: "",
        title: "Home",
        blocks: [
          { block: "hero", props: { heading: "Accessible hero", subheading: "Sub", cta: { label: "Go", href: "/go" } } },
          { block: "text", props: { content: "<p>Hello <strong>world</strong></p>" } },
        ],
      },
    ],
  },
};

async function axeCheck(html: string): Promise<void> {
  const dom = new JSDOM(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>${html}</body></html>`, {
    resources: "usable",
  });
  const results = await axe.run(dom.window.document.body);
  const componentViolations = results.violations.filter(
    (v) => v.id !== "document-title" && v.id !== "html-has-lang",
  );
  expect(componentViolations).toEqual([]);
}

describe("accessibility (axe)", () => {
  it("hero + text page has no axe violations", async () => {
    const result = renderToHTML(kit as KitManifest, "home");
    expect(result.success).toBe(true);
    await axeCheck(result.html);
  });

  it("sanitised rich text has no axe violations", async () => {
    const html = cleanRichText("<p>Hello <strong>world</strong></p><a href=\"https://example.com\">link</a>");
    await axeCheck(html);
  });
});