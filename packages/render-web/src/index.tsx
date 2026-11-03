/**
 * BLKC Render-Web - React/Next.js compatible web renderer for BLKC UI Blocks.
 * 
 * This package provides React components and utilities for rendering BLKC UI Blocks.
 * It is framework-agnostic (no Next.js dependencies) and supports:
 * - Server-side rendering (SSR)
 * - Static site generation (SSG) via renderToHTML
 * - Client-side rendering
 * - Type-safe props
 * - WCAG 2.1 AA accessibility
 * 
 * @package @blkc-code/render-web
 * @version 0.1.0
 * @license Apache-2.0
 * @author Black Code Enterprises LLC
 */

import React, { ReactNode } from "react";
import { BlockInstance, UiBlockManifest } from "@blkc-code/core";
import { clsx } from "./clsx.js";
import { 
  BlockRegistry, 
  BlockRegistryEntry,
  BlockComponent, 
  BlockProps, 
  RenderOptions, 
  RenderResult, 
  RenderToHtmlResult,
  ThemeVariables,
  DEFAULT_THEME,
  HeroProps,
  TextProps,
  ImageProps,
  ButtonProps,
  SectionProps,
} from "./types.js";
import * as utils from "./utils.js";

// Re-export types and utilities
export * from "./types.js";
export * from "./utils.js";
export { clsx };

// ============================================================================
// Default Block Components
// ============================================================================

/**
 * Hero Block component.
 * Renders a hero section with heading, subheading, CTA button, and optional image.
 */
function HeroBlock({ props: p, className, style }: BlockProps<HeroProps>): ReactNode {
  const {
    heading,
    subheading,
    cta,
    image,
    backgroundColor,
    textColor,
    textAlign = "center",
    padding = "4rem 1rem",
    minHeight,
  } = p;

  const alignClass = utils.getTextAlignmentClass(textAlign);
  const textColorClass = utils.getColorClass(textColor);
  const bgColorClass = utils.getBackgroundColorClass(backgroundColor);

  return (
    <section
      className={clsx("blkc-hero", alignClass, textColorClass, bgColorClass, className)}
      style={{
        padding,
        minHeight,
        backgroundColor: backgroundColor || undefined,
        color: textColor || undefined,
        ...style,
      }}
    >
      <div className="blkc-hero-content">
        {image && (
          <div
            className={clsx("blkc-hero-image", `blkc-hero-image-${image.position || "top"}`)}
          >
            <img
              src={image.src}
              alt={image.alt || heading}
              className="blkc-hero-img"
            />
          </div>
        )}
        
        <div className="blkc-hero-text">
          <h1 className="blkc-hero-heading">{heading}</h1>
          {subheading && (
            <p className="blkc-hero-subheading">{subheading}</p>
          )}
          
          {cta && (
            <a
              href={utils.normalizeUrl(cta.href)}
              className={clsx(
                "blkc-button",
                `blkc-button-${cta.variant || "primary"}`
              )}
              target={cta.target || "_self"}
              rel={cta.target === "_blank" ? "noopener noreferrer" : undefined}
            >
              {cta.label}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Text Block component.
 * Renders a text element with configurable tag and styling.
 */
function TextBlock({ props: p, className, style }: BlockProps<TextProps>): ReactNode {
  const {
    content,
    tag = "p",
    color,
    backgroundColor,
    fontSize,
    fontWeight,
    textAlign,
    margin,
    padding,
  } = p;

  const textColorClass = utils.getColorClass(color);
  const bgColorClass = utils.getBackgroundColorClass(backgroundColor);
  const fontSizeClass = utils.getFontSizeClass(fontSize);
  const fontWeightClass = utils.getFontWeightClass(fontWeight);
  const alignClass = utils.getTextAlignmentClass(textAlign);

  // Security: If tag is not a safe element, default to div
  const safeTag = ["p", "div", "span", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)
    ? tag
    : "div";
  const SafeTag = safeTag as React.ElementType;

  return (
    <SafeTag
      className={clsx(
        "blkc-text",
        textColorClass,
        bgColorClass,
        fontSizeClass,
        fontWeightClass,
        alignClass,
        className
      )}
      style={{
        margin,
        padding,
        color: color || undefined,
        backgroundColor: backgroundColor || undefined,
        fontSize: fontSize || undefined,
        fontWeight: fontWeight || undefined,
        textAlign: textAlign || undefined,
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}

/**
 * Image Block component.
 * Renders an image with optional caption and link.
 */
function ImageBlock({ props: p, className, style }: BlockProps<ImageProps>): ReactNode {
  const {
    src,
    alt,
    width,
    height,
    objectFit = "cover",
    borderRadius,
    caption,
    link,
    alignment = "center",
  } = p;

  const alignClass = utils.getAlignmentClass(alignment);
  const imageUrl = utils.normalizeUrl(src);

  const imageElement = (
    <img
      src={imageUrl}
      alt={alt}
      className="blkc-image-img"
      style={{
        width: width || "100%",
        height: height || "auto",
        objectFit,
        borderRadius: borderRadius || undefined,
        ...style,
      }}
    />
  );

  const content = link ? (
    <a
      href={utils.normalizeUrl(link)}
      className="blkc-image-link"
      target="_blank"
      rel="noopener noreferrer"
    >
      {imageElement}
    </a>
  ) : (
    imageElement
  );

  return (
    <div
      className={clsx("blkc-image", alignClass, className)}
    >
      <div className="blkc-image-wrapper">
        {content}
      </div>
      {caption && (
        <figcaption className="blkc-image-caption">{caption}</figcaption>
      )}
    </div>
  );
}

/**
 * Button Block component.
 * Renders a button or link with configurable styling.
 */
function ButtonBlock({ props: p, className, style }: BlockProps<ButtonProps>): ReactNode {
  const {
    label,
    href,
    variant = "primary",
    size = "md",
    alignment = "center",
    target = "_self",
    icon,
    iconPosition = "left",
  } = p;

  const alignClass = utils.getAlignmentClass(alignment);
  const hrefUrl = utils.normalizeUrl(href);
  const isExternal = utils.isExternalUrl(hrefUrl);

  return (
    <div className={clsx("blkc-button-wrapper", alignClass)}>
      <a
        href={hrefUrl || "#"}
        className={clsx(
          "blkc-button",
          `blkc-button-${variant}`,
          `blkc-button-${size}`,
          className
        )}
        style={style}
        target={target}
        rel={isExternal ? "noopener noreferrer" : undefined}
      >
        {icon && iconPosition === "left" && (
          <span className="blkc-button-icon blkc-button-icon-left">{icon}</span>
        )}
        <span className="blkc-button-label">{label}</span>
        {icon && iconPosition === "right" && (
          <span className="blkc-button-icon blkc-button-icon-right">{icon}</span>
        )}
      </a>
    </div>
  );
}

/**
 * Section Block component.
 * Renders a container/wrapper for other Blocks.
 */
function SectionBlock({ props: p, className, style, children }: BlockProps<SectionProps>): ReactNode {
  const {
    backgroundColor,
    textColor,
    padding,
    margin,
    minHeight,
    alignment = "center",
  } = p;

  const alignClass = utils.getAlignmentClass(alignment);
  const textColorClass = utils.getColorClass(textColor);
  const bgColorClass = utils.getBackgroundColorClass(backgroundColor);

  return (
    <section
      className={clsx(
        "blkc-section",
        alignClass,
        textColorClass,
        bgColorClass,
        className
      )}
      style={{
        padding,
        margin,
        minHeight,
        backgroundColor: backgroundColor || undefined,
        color: textColor || undefined,
        ...style,
      }}
    >
      <div className="blkc-section-content">{children}</div>
    </section>
  );
}

// ============================================================================
// Block Registry
// ============================================================================

/**
 * Default Block registry with built-in Blocks.
 */
const defaultRegistry: BlockRegistry = new Map();

/**
 * Register a Block component.
 */
function registerBlock(blockId: string, component: BlockComponent, manifest?: UiBlockManifest): void {
  defaultRegistry.set(blockId, {
    component: component as BlockComponent<Record<string, unknown>>,
    manifest: manifest || { kind: "ui", id: blockId, name: blockId, summary: "", description: "", version: "0.0.0" } as UiBlockManifest,
  });
}

/**
 * Get a Block component from the registry.
 */
function getBlockComponent(blockId: string): BlockRegistryEntry | undefined {
  return defaultRegistry.get(blockId);
}

/**
 * Get all registered Blocks.
 */
function getRegisteredBlocks(): string[] {
  return Array.from(defaultRegistry.keys());
}

/**
 * Check if a Block is registered.
 */
function isBlockRegistered(blockId: string): boolean {
  return defaultRegistry.has(blockId);
}

// Register default Blocks
registerBlock("hero", HeroBlock as unknown as BlockComponent);
registerBlock("text", TextBlock as unknown as BlockComponent);
registerBlock("image", ImageBlock as unknown as BlockComponent);
registerBlock("button", ButtonBlock as unknown as BlockComponent);
registerBlock("section", SectionBlock as unknown as BlockComponent);

// ============================================================================
// Render Functions
// ============================================================================

/**
 * Render a single Block instance.
 */
function renderBlock(
  instance: BlockInstance,
  options: RenderOptions = {}
): RenderResult {
  const { block: blockId, props = {} } = instance;
  const { wrapperClassName, wrapperComponent: Wrapper, passThroughClassName = true, theme } = options;

  const entry = getBlockComponent(blockId);
  
  if (!entry) {
    return {
      element: null,
      blockId,
      success: false,
      error: `Block "${blockId}" is not registered`,
    };
  }

  const { component: Component } = entry;
  const mergedTheme = utils.mergeTheme(theme);

  try {
    const element = (
      <React.Fragment>
        {/* Theme CSS variables */}
        <style>{`
          ${utils.themeToCss(mergedTheme)}
        `}</style>
        
        {Wrapper ? (
          <Wrapper className={wrapperClassName}>
            <Component
              props={props}
              className={passThroughClassName ? wrapperClassName : undefined}
            />
          </Wrapper>
        ) : (
          <div className={wrapperClassName}>
            <Component
              props={props}
              className={passThroughClassName ? wrapperClassName : undefined}
            />
          </div>
        )}
      </React.Fragment>
    );

    return {
      element,
      blockId,
      success: true,
    };
  } catch (error) {
    return {
      element: null,
      blockId,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Render multiple Block instances.
 */
function renderBlocks(
  instances: BlockInstance[],
  options: RenderOptions = {}
): { elements: ReactNode[]; results: RenderResult[] } {
  const { includeWrappers = true, ...restOptions } = options;
  
  const elements: ReactNode[] = [];
  const results: RenderResult[] = [];

  for (const instance of instances) {
    const result = renderBlock(instance, { ...restOptions, includeWrappers });
    results.push(result);
    
    if (result.success && result.element) {
      elements.push(result.element);
    }
  }

  return { elements, results };
}

/**
 * Render a page (array of Block instances).
 */
function renderPage(
  instances: BlockInstance[],
  options: RenderOptions = {}
): ReactNode {
  const { elements } = renderBlocks(instances, options);
  
  return <div className="blkc-page">{elements.map((element, index) => (
    <React.Fragment key={index}>{element}</React.Fragment>
  ))}</div>;
}

// ============================================================================
// HTML Rendering (for SSG and static export)
// ============================================================================

/**
 * Render a Block to HTML string.
 * Uses React's renderToStaticMarkup for static HTML generation.
 */
function renderBlockToHTML(
  instance: BlockInstance,
  options: RenderOptions = {}
): RenderToHtmlResult {
  // Import dynamically to avoid SSR issues
  const ReactDOMServer = require("react-dom/server");
  
  const result = renderBlock(instance, options);
  
  if (!result.success || !result.element) {
    return {
      html: "",
      success: false,
      error: result.error,
      renderedBlocks: [],
    };
  }

  try {
    const html = ReactDOMServer.renderToStaticMarkup(result.element);
    return {
      html,
      success: true,
      renderedBlocks: [result.blockId],
    };
  } catch (error) {
    return {
      html: "",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      renderedBlocks: [],
    };
  }
}

/**
 * Render multiple Blocks to HTML string.
 */
function renderBlocksToHTML(
  instances: BlockInstance[],
  options: RenderOptions = {}
): RenderToHtmlResult {
  // Import dynamically to avoid SSR issues
  const ReactDOMServer = require("react-dom/server");
  
  const { elements, results } = renderBlocks(instances, options);
  const renderedBlocks = results.map((r) => r.blockId);
  const hasErrors = results.some((r) => !r.success);

  if (hasErrors) {
    const errorMessages = results
      .filter((r) => !r.success)
      .map((r) => r.error)
      .join("; ");
    
    return {
      html: "",
      success: false,
      error: errorMessages,
      renderedBlocks,
    };
  }

  try {
    const html = ReactDOMServer.renderToStaticMarkup(
      <div className="blkc-page">{elements.map((element, index) => (
        <React.Fragment key={index}>{element}</React.Fragment>
      ))}</div>
    );
    return {
      html,
      success: true,
      renderedBlocks,
    };
  } catch (error) {
    return {
      html: "",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      renderedBlocks,
    };
  }
}

/**
 * Render a page (array of Block instances) to HTML string.
 * This is the primary function for static site generation (NFR17-18).
 */
function renderToHTML(
  instances: BlockInstance[],
  options: RenderOptions = {}
): RenderToHtmlResult {
  return renderBlocksToHTML(instances, options);
}

// ============================================================================
// Global CSS
// ============================================================================

/**
 * Generate global CSS for BLKC Blocks.
 * This can be included in the head of the HTML document.
 */
function getGlobalCSS(theme: ThemeVariables = DEFAULT_THEME): string {
  const mergedTheme = utils.mergeTheme(theme);
  
  return `
/* BLKC Reset and Base Styles */
.blkc-block {
  box-sizing: border-box;
}

.blkc-page {
  display: flex;
  flex-direction: column;
  gap: var(--blkc-spacing-md, 1rem);
}

/* Alignment */
.blkc-align-left { align-self: flex-start; }
.blkc-align-center { align-self: center; }
.blkc-align-right { align-self: flex-end; }
.blkc-align-wide { max-width: var(--blkc-max-width, 1200px); margin-left: auto; margin-right: auto; }
.blkc-align-full { width: 100%; }

.blkc-text-left { text-align: left; }
.blkc-text-center { text-align: center; }
.blkc-text-right { text-align: right; }

/* Hero */
.blkc-hero {
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
}

.blkc-hero-content {
  display: flex;
  flex-direction: column;
  max-width: var(--blkc-max-width, 1200px);
  margin: 0 auto;
  width: 100%;
}

.blkc-hero-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--blkc-spacing-md, 1rem);
  padding: var(--blkc-spacing-md, 1rem);
}

.blkc-hero-heading {
  font-size: var(--blkc-font-size-3xl, 2.5rem);
  font-weight: var(--blkc-font-weight-bold, 700);
  line-height: 1.2;
  margin: 0;
}

.blkc-hero-subheading {
  font-size: var(--blkc-font-size-lg, 1.25rem);
  opacity: 0.8;
  margin: 0;
}

.blkc-hero-image {
  width: 100%;
}

.blkc-hero-image-top { order: -1; }
.blkc-hero-image-bottom { order: 1; }
.blkc-hero-image-left { align-self: flex-start; max-width: 50%; }
.blkc-hero-image-right { align-self: flex-end; max-width: 50%; }

.blkc-hero-img {
  width: 100%;
  height: auto;
  object-fit: cover;
  border-radius: var(--blkc-border-radius, 8px);
}

/* Text */
.blkc-text {
  line-height: 1.6;
}

.blkc-text-xs { font-size: var(--blkc-font-size-xs, 0.75rem); }
.blkc-text-sm { font-size: var(--blkc-font-size-sm, 0.875rem); }
.blkc-text-base { font-size: var(--blkc-font-size-base, 1rem); }
.blkc-text-lg { font-size: var(--blkc-font-size-lg, 1.25rem); }
.blkc-text-xl { font-size: var(--blkc-font-size-xl, 1.5rem); }
.blkc-text-2xl { font-size: var(--blkc-font-size-2xl, 2rem); }
.blkc-text-3xl { font-size: var(--blkc-font-size-3xl, 2.5rem); }

.blkc-font-normal { font-weight: var(--blkc-font-weight-normal, 400); }
.blkc-font-bold { font-weight: var(--blkc-font-weight-bold, 700); }

/* Buttons */
.blkc-button-wrapper {
  display: flex;
  justify-content: center;
}

.blkc-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--blkc-spacing-sm, 0.5rem);
  padding: 0.75rem 1.5rem;
  font-size: var(--blkc-font-size-base, 1rem);
  font-weight: var(--blkc-font-weight-bold, 700);
  line-height: 1;
  border-radius: var(--blkc-border-radius, 8px);
  border: 2px solid transparent;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.2s ease;
}

.blkc-button:focus {
  outline: 2px solid var(--blkc-color-primary, #0066cc);
  outline-offset: 2px;
}

.blkc-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.blkc-button-primary {
  background-color: var(--blkc-color-primary, #0066cc);
  color: white;
}

.blkc-button-primary:hover {
  background-color: ${utils.darkenColor("#0066cc", 10)};
}

.blkc-button-secondary {
  background-color: var(--blkc-color-secondary, #6c757d);
  color: white;
}

.blkc-button-secondary:hover {
  background-color: ${utils.darkenColor("#6c757d", 10)};
}

.blkc-button-outline {
  background-color: transparent;
  color: var(--blkc-color-primary, #0066cc);
  border-color: var(--blkc-color-primary, #0066cc);
}

.blkc-button-outline:hover {
  background-color: ${utils.addAlpha("#0066cc", 0.1)};
}

.blkc-button-ghost {
  background-color: transparent;
  color: var(--blkc-color-primary, #0066cc);
}

.blkc-button-ghost:hover {
  background-color: ${utils.addAlpha("#0066cc", 0.1)};
}

.blkc-button-link {
  background-color: transparent;
  color: var(--blkc-color-primary, #0066cc);
  padding: 0;
  border: none;
}

.blkc-button-link:hover {
  text-decoration: underline;
}

.blkc-button-sm { padding: 0.5rem 1rem; font-size: var(--blkc-font-size-sm, 0.875rem); }
.blkc-button-lg { padding: 1rem 2rem; font-size: var(--blkc-font-size-lg, 1.25rem); }

.blkc-button-icon {
  display: flex;
  align-items: center;
}

.blkc-button-icon-left { margin-right: var(--blkc-spacing-xs, 0.25rem); }
.blkc-button-icon-right { margin-left: var(--blkc-spacing-xs, 0.25rem); }

/* Image */
.blkc-image {
  display: flex;
  flex-direction: column;
  gap: var(--blkc-spacing-sm, 0.5rem);
}

.blkc-image-wrapper {
  position: relative;
  overflow: hidden;
}

.blkc-image-img {
  display: block;
  width: 100%;
  height: auto;
}

.blkc-image-caption {
  font-size: var(--blkc-font-size-sm, 0.875rem);
  color: var(--blkc-color-text-secondary, #6c757d);
  text-align: center;
}

.blkc-image-link {
  display: block;
  text-decoration: none;
}

/* Section */
.blkc-section {
  width: 100%;
}

.blkc-section-content {
  max-width: var(--blkc-max-width, 1200px);
  margin: 0 auto;
  width: 100%;
}

/* Theme Variables */
${utils.themeToCss(mergedTheme)}
`;
}

// ============================================================================
// Static HTML Export (for SSG)
// ============================================================================

/**
 * Generate a complete HTML document with rendered Blocks.
 * This is useful for static site generation where you need a full HTML page.
 */
function generateHtmlDocument(
  instances: BlockInstance[],
  options: {
    title?: string;
    lang?: string;
    head?: string;
    bodyClassName?: string;
    theme?: ThemeVariables;
  } = {}
): string {
  const { title = "BLKC Page", lang = "en", head = "", bodyClassName = "", theme } = options;
  const mergedTheme = utils.mergeTheme(theme);
  
  // Render Blocks to HTML
  const renderResult = renderToHTML(instances, { theme: mergedTheme });
  
  if (!renderResult.success) {
    return `<html><body>Error: ${renderResult.error}</body></html>`;
  }

  // Generate CSS
  const css = getGlobalCSS(mergedTheme);

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>${css}</style>
  ${head}
</head>
<body class="${bodyClassName}">
  ${renderResult.html}
</body>
</html>`;
}

// ============================================================================
// Exports
// ============================================================================

export {
  // Components (for custom Block development)
  HeroBlock,
  TextBlock,
  ImageBlock,
  ButtonBlock,
  SectionBlock,
  
  // Registry functions
  registerBlock,
  getBlockComponent,
  getRegisteredBlocks,
  isBlockRegistered,
  
  // Render functions
  renderBlock,
  renderBlocks,
  renderPage,
  renderBlockToHTML,
  renderBlocksToHTML,
  renderToHTML,
  
  // HTML export
  generateHtmlDocument,
  getGlobalCSS,
  
  // Default theme
  DEFAULT_THEME,
};
