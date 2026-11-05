/* global document */
import { describe, it, expect } from "vitest";
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

/**
 * Runs axe against the vitest jsdom document, which is the only one axe inspects.
 * color-contrast needs real layout, so it is off here.
 */
async function violations(html: string): Promise<string[]> {
  document.documentElement.lang = "en";
  document.title = "t";
  document.body.innerHTML = `<main>${html}</main>`;
  const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.map((v) => v.id);
}

async function axeCheck(html: string): Promise<void> {
  expect(await violations(html)).toEqual([]);
}

describe("accessibility (axe)", () => {
  // If axe stops looking at the rendered HTML, every other test here would pass silently.
  it("catches broken HTML, proving the checks below are real", async () => {
    expect(await violations('<img src="x.png">')).toContain("image-alt");
    expect(await violations('<a href="/x"></a>')).toContain("link-name");
  });

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