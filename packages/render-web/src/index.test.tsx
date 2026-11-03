/**
 * BLKC Render-Web - Unit Tests
 * 
 * Tests for React components and rendering functions.
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HeroBlock,
  TextBlock,
  ImageBlock,
  ButtonBlock,
  SectionBlock,
  registerBlock,
  getBlockComponent,
  renderBlock,
  renderBlocks,
  renderToHTML,
  getGlobalCSS,
  generateHtmlDocument,
  DEFAULT_THEME,
} from "./index";
import { BlockInstance } from "@blkc-code/core";

// Mock React DOM server for SSR testing
vi.mock("react-dom/server", () => ({
  renderToStaticMarkup: vi.fn(() => "<div>mocked</div>"),
}));

// ============================================================================
// Constants
// ============================================================================

describe("DEFAULT_THEME", () => {
  it("should have CSS custom properties", () => {
    expect(DEFAULT_THEME).toHaveProperty("--blkc-color-primary");
    expect(DEFAULT_THEME).toHaveProperty("--blkc-font-family");
    expect(DEFAULT_THEME).toHaveProperty("--blkc-spacing-md");
  });
});

// ============================================================================
// Block Components
// ============================================================================

describe("HeroBlock", () => {
  it("should render with required props", () => {
    const props = {
      heading: "Welcome",
    };
    const result = HeroBlock({ props, className: "test", style: {} });
    expect(result).toBeDefined();
    // Can't easily test React element content without rendering
  });

  it("should render with all props", () => {
    const props = {
      heading: "Welcome to BLKC",
      subheading: "Build amazing things",
      cta: { label: "Get Started", href: "/start" },
      backgroundColor: "#000",
      textColor: "#fff",
      textAlign: "center",
    };
    const result = HeroBlock({ props, className: "test", style: {} });
    expect(result).toBeDefined();
  });
});

describe("TextBlock", () => {
  it("should render with content", () => {
    const props = {
      content: "Hello World",
    };
    const result = TextBlock({ props, className: "test", style: {} });
    expect(result).toBeDefined();
  });

  it("should render with tag", () => {
    const props = {
      content: "Hello World",
      tag: "h1",
    };
    const result = TextBlock({ props, className: "test", style: {} });
    expect(result).toBeDefined();
  });
});

describe("ImageBlock", () => {
  it("should render with required props", () => {
    const props = {
      src: "https://example.com/image.jpg",
      alt: "Test image",
    };
    const result = ImageBlock({ props, className: "test", style: {} });
    expect(result).toBeDefined();
  });

  it("should render with caption", () => {
    const props = {
      src: "https://example.com/image.jpg",
      alt: "Test image",
      caption: "A test image",
    };
    const result = ImageBlock({ props, className: "test", style: {} });
    expect(result).toBeDefined();
  });
});

describe("ButtonBlock", () => {
  it("should render with required props", () => {
    const props = {
      label: "Click me",
      href: "https://example.com",
    };
    const result = ButtonBlock({ props, className: "test", style: {} });
    expect(result).toBeDefined();
  });

  it("should render with variant", () => {
    const props = {
      label: "Click me",
      href: "https://example.com",
      variant: "primary",
    };
    const result = ButtonBlock({ props, className: "test", style: {} });
    expect(result).toBeDefined();
  });
});

describe("SectionBlock", () => {
  it("should render with children", () => {
    const props = {};
    const children = <div>Child content</div>;
    const result = SectionBlock({ props, className: "test", style: {}, children });
    expect(result).toBeDefined();
  });
});

// ============================================================================
// Registry
// ============================================================================

describe("Block Registry", () => {
  it("should register blocks", () => {
    registerBlock("test-hero", HeroBlock);
    
    const entry = getBlockComponent("test-hero");
    expect(entry).toBeDefined();
    expect(entry?.component).toBe(HeroBlock);
  });

  it("should return undefined for unregistered blocks", () => {
    const entry = getBlockComponent("nonexistent");
    expect(entry).toBeUndefined();
  });
});

// ============================================================================
// Render Functions
// ============================================================================

describe("renderBlock", () => {
  it("should render registered block", () => {
    registerBlock("test-hero", HeroBlock);
    
    const instance: BlockInstance = {
      block: "test-hero",
      props: { heading: "Test" },
    };
    
    const result = renderBlock(instance);
    expect(result.success).toBe(true);
    expect(result.element).toBeDefined();
  });

  it("should fail for unregistered block", () => {
    const instance: BlockInstance = {
      block: "nonexistent",
      props: {},
    };
    
    const result = renderBlock(instance);
    expect(result.success).toBe(false);
    expect(result.error).toContain("not registered");
  });
});

describe("renderBlocks", () => {
  it("should render multiple blocks", () => {
    registerBlock("test-hero", HeroBlock);
    registerBlock("test-text", TextBlock);
    
    const instances: BlockInstance[] = [
      { block: "test-hero", props: { heading: "Hero" } },
      { block: "test-text", props: { content: "Text" } },
    ];
    
    const result = renderBlocks(instances);
    expect(result.results.length).toBe(2);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(true);
    expect(result.elements.length).toBe(2);
  });
});

describe("renderToHTML", () => {
  it("should render blocks to HTML", () => {
    registerBlock("test-hero", HeroBlock);
    
    const instances: BlockInstance[] = [
      { block: "test-hero", props: { heading: "Test" } },
    ];
    
    // Mock renderToStaticMarkup
    vi.mocked(renderToStaticMarkup).mockReturnValue("<div>hero</div>");
    
    const result = renderToHTML(instances);
    expect(result.success).toBe(true);
    expect(result.html).toContain("hero");
  });
});

// ============================================================================
// CSS Generation
// ============================================================================

describe("getGlobalCSS", () => {
  it("should generate CSS string", () => {
    const css = getGlobalCSS();
    expect(typeof css).toBe("string");
    expect(css).toContain(".blkc-block");
    expect(css).toContain(".blkc-hero");
    expect(css).toContain(".blkc-text");
  });

  it("should include custom theme variables", () => {
    const customTheme = {
      "--blkc-color-primary": "#ff0000",
    };
    const css = getGlobalCSS(customTheme);
    expect(css).toContain("--blkc-color-primary: #ff0000");
  });
});

// ============================================================================
// HTML Document Generation
// ============================================================================

describe("generateHtmlDocument", () => {
  it("should generate complete HTML document", () => {
    registerBlock("test-hero", HeroBlock);
    
    const instances: BlockInstance[] = [
      { block: "test-hero", props: { heading: "Test" } },
    ];
    
    // Mock renderToStaticMarkup
    vi.mocked(renderToStaticMarkup).mockReturnValue("<div>hero</div>");
    
    const html = generateHtmlDocument(instances);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("<head>");
    expect(html).toContain("<body");
    expect(html).toContain("hero");
  });

  it("should include custom title", () => {
    registerBlock("test-hero", HeroBlock);
    
    const instances: BlockInstance[] = [
      { block: "test-hero", props: { heading: "Test" } },
    ];
    
    vi.mocked(renderToStaticMarkup).mockReturnValue("<div>hero</div>");
    
    const html = generateHtmlDocument(instances, { title: "Custom Title" });
    expect(html).toContain("<title>Custom Title</title>");
  });

  it("should include custom CSS", () => {
    registerBlock("test-hero", HeroBlock);
    
    const instances: BlockInstance[] = [
      { block: "test-hero", props: { heading: "Test" } },
    ];
    
    vi.mocked(renderToStaticMarkup).mockReturnValue("<div>hero</div>");
    
    const html = generateHtmlDocument(instances);
    expect(html).toContain("<style>");
    expect(html).toContain(".blkc-block");
  });
});
