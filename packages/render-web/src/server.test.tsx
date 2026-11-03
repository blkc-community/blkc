/**
 * BLKC Render-Web - Server Rendering Tests
 *
 * These tests render for real. An earlier version mocked `react-dom/server`
 * while the implementation reached for it through `require()`, so the mock
 * never applied and the assertions passed on whatever the real renderer
 * happened to emit — including a class name that has since been replaced.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { BlockInstance } from "@blkc-code/core";
import { HeroBlock, TextBlock, registerBlock } from "./index";
import {
  renderBlockToHTML,
  renderBlocksToHTML,
  renderToHTML,
  generateHtmlDocument,
} from "./server";

beforeAll(() => {
  registerBlock("server-hero", HeroBlock);
  registerBlock("server-text", TextBlock);
});

describe("renderBlockToHTML", () => {
  it("renders the block's real markup", () => {
    const instance: BlockInstance = {
      block: "server-hero",
      props: { heading: "Ship it", subheading: "Today" },
    };

    const result = renderBlockToHTML(instance);

    expect(result.success).toBe(true);
    expect(result.html).toContain("Ship it");
    expect(result.html).toContain("Today");
    expect(result.html).toContain("<h1");
    expect(result.renderedBlocks).toEqual(["server-hero"]);
  });

  it("fails without markup for an unregistered block", () => {
    const result = renderBlockToHTML({ block: "server-missing", props: {} });

    expect(result.success).toBe(false);
    expect(result.html).toBe("");
    expect(result.error).toContain("not registered");
  });
});

describe("renderToHTML", () => {
  it("renders every block into one page", () => {
    const instances: BlockInstance[] = [
      { block: "server-hero", props: { heading: "Welcome" } },
      { block: "server-text", props: { content: "Body copy" } },
    ];

    const result = renderToHTML(instances);

    expect(result.success).toBe(true);
    expect(result.html).toContain("Welcome");
    expect(result.html).toContain("Body copy");
    expect(result.html).toContain('class="blkc-page"');
    expect(result.renderedBlocks).toEqual(["server-hero", "server-text"]);
  });

  it("returns no partial page when any block fails", () => {
    const instances: BlockInstance[] = [
      { block: "server-hero", props: { heading: "Welcome" } },
      { block: "server-missing", props: {} },
    ];

    const result = renderBlocksToHTML(instances);

    expect(result.success).toBe(false);
    expect(result.html).toBe("");
    expect(result.error).toContain("not registered");
  });
});

describe("generateHtmlDocument", () => {
  const instances: BlockInstance[] = [
    { block: "server-hero", props: { heading: "Document heading" } },
  ];

  it("emits a complete document with the rendered body", () => {
    const html = generateHtmlDocument(instances);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<title>BLKC Page</title>");
    expect(html).toContain("<style>");
    expect(html).toContain(".blkc-page");
    expect(html).toContain("Document heading");
  });

  it("honours title, lang and head overrides", () => {
    const html = generateHtmlDocument(instances, {
      title: "Custom Title",
      lang: "fr",
      head: '<meta name="robots" content="noindex" />',
    });

    expect(html).toContain('<html lang="fr">');
    expect(html).toContain("<title>Custom Title</title>");
    expect(html).toContain('content="noindex"');
  });

  it("reports render errors instead of emitting a broken page", () => {
    const html = generateHtmlDocument([{ block: "server-missing", props: {} }]);

    expect(html).toContain("Error:");
    expect(html).toContain("not registered");
  });
});
