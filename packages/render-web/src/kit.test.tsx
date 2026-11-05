import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KitPage, resolveKitPage } from "./kit.js";
import { cleanRichText } from "./sanitize.js";
import { renderToHTML, generateHtmlDocument } from "./server.js";
import type { KitManifest } from "@blkc-code/core";

const kit = {
  manifestVersion: 2 as const,
  id: "test-kit",
  name: "Test Kit",
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
          { block: "hero", props: { heading: "Hello from KitPage", tone: "accent", size: "lg" } },
          { block: "text", props: { content: "<p>Rich <strong>text</strong></p><script>alert(1)</script>" } },
        ],
      },
      { slug: "about", title: "About", blocks: [{ block: "hero", props: { heading: "About page" } }] },
    ],
  },
};

describe("KitPage", () => {
  it("renders a page by slug", () => {
    const html = renderToStaticMarkup(<KitPage kit={kit as KitManifest} page="home" />);
    expect(html).toContain("Hello from KitPage");
    expect(html).toContain("bg-accent");
  });

  it("returns not-found for unknown page", () => {
    const html = renderToStaticMarkup(<KitPage kit={kit as KitManifest} page="nope" />);
    expect(html).toContain("Page not found");
  });

  it("resolveKitPage returns instances", () => {
    const instances = resolveKitPage(kit as KitManifest, "home");
    expect(instances).toHaveLength(2);
  });

  it("resolveKitPage returns null for unknown", () => {
    expect(resolveKitPage(kit as KitManifest, "nope")).toBeNull();
  });
});

describe("renderToHTML(kit, page)", () => {
  it("renders home page", () => {
    const result = renderToHTML(kit as KitManifest, "home");
    expect(result.success).toBe(true);
    expect(result.html).toContain("Hello from KitPage");
  });

  it("renders about page", () => {
    const result = renderToHTML(kit as KitManifest, "about");
    expect(result.success).toBe(true);
    expect(result.html).toContain("About page");
  });

  it("returns error for unknown page", () => {
    const result = renderToHTML(kit as KitManifest, "nope");
    expect(result.success).toBe(false);
  });

  it("generateHtmlDocument works with kit page instances", () => {
    const instances = resolveKitPage(kit as KitManifest, "home")!;
    const doc = generateHtmlDocument(instances, { title: "Test" });
    expect(doc).toContain("<!DOCTYPE html>");
    expect(doc).toContain("Hello from KitPage");
  });
});

describe("cleanRichText", () => {
  it("keeps allowed tags", () => {
    const out = cleanRichText("<p>Hello <strong>world</strong></p>");
    expect(out).toContain("<p>");
    expect(out).toContain("<strong>world</strong>");
  });

  it("strips script tags", () => {
    const out = cleanRichText("<p>Hi</p><script>alert(1)</script>");
    expect(out).not.toContain("script");
    expect(out).not.toContain("alert");
  });

  it("sanitises unsafe links", () => {
    const out = cleanRichText('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain("javascript:");
    expect(out).toContain("<span>");
  });

  it("keeps safe links with target/rel", () => {
    const out = cleanRichText('<a href="https://example.com">link</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("returns empty for empty input", () => {
    expect(cleanRichText("")).toBe("");
    expect(cleanRichText("   ")).toBe("");
  });

  it("removes empty paragraphs", () => {
    const out = cleanRichText("<p></p><p>hi</p>");
    expect(out).not.toContain("<p></p>");
    expect(out).toContain("hi");
  });
});