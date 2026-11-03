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

  const textAlignClass =
    textAlign === "left" ? "text-left items-start" : textAlign === "right" ? "text-right items-end" : "text-center items-center";

  return (
    <section
      className={clsx(
        "blkc-hero relative flex w-full flex-col items-center justify-center gap-6 px-4 py-16",
        textAlignClass,
        className,
      )}
      style={{
        padding,
        minHeight,
        backgroundColor: backgroundColor || undefined,
        color: textColor || undefined,
        ...style,
      }}
    >
      {image && (
        <div className="w-full max-w-5xl">
          <img
            src={image.src}
            alt={image.alt || heading}
            className="h-auto w-full rounded-lg object-cover"
          />
        </div>
      )}

      <div className="flex max-w-3xl flex-col gap-4">
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          {heading}
        </h1>
        {subheading && (
          <p className="text-lg text-muted-foreground sm:text-xl">{subheading}</p>
        )}

        {cta && (
          <a
            href={utils.normalizeUrl(cta.href)}
            className={clsx(
              "inline-flex items-center justify-center rounded-md px-6 py-3 text-base font-semibold transition-colors",
              cta.variant === "secondary"
                ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                : cta.variant === "outline"
                  ? "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
            target={cta.target || "_self"}
            rel={cta.target === "_blank" ? "noopener noreferrer" : undefined}
          >
            {cta.label}
          </a>
        )}
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

  const alignClass =
    textAlign === "left"
      ? "text-left"
      : textAlign === "right"
        ? "text-right"
        : textAlign === "center"
          ? "text-center"
          : undefined;

  // Security: If tag is not a safe element, default to div
  const safeTag = ["p", "div", "span", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)
    ? tag
    : "div";
  const SafeTag = safeTag as React.ElementType;

  return (
    <SafeTag
      className={clsx("blkc-text leading-relaxed", alignClass, className)}
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

  const alignClass =
    alignment === "left"
      ? "mr-auto"
      : alignment === "right"
        ? "ml-auto"
        : "mx-auto";
  const imageUrl = utils.normalizeUrl(src);

  const imageElement = (
    <img
      src={imageUrl}
      alt={alt}
      className="blkc-image-img block h-auto max-w-full"
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
      className="blkc-image-link inline-block"
      target="_blank"
      rel="noopener noreferrer"
    >
      {imageElement}
    </a>
  ) : (
    imageElement
  );

  return (
    <figure className={clsx("blkc-image flex w-full flex-col gap-2", alignClass, className)}>
      <div className="blkc-image-wrapper w-full">{content}</div>
      {caption && (
        <figcaption className="blkc-image-caption text-sm text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
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

  const hrefUrl = utils.normalizeUrl(href);
  const isExternal = utils.isExternalUrl(hrefUrl);

  const sizeClass =
    size === "sm" ? "px-3 py-1.5 text-sm" : size === "lg" ? "px-6 py-3 text-lg" : "px-4 py-2 text-base";
  const variantClass =
    variant === "secondary"
      ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
      : variant === "outline"
        ? "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
        : variant === "ghost"
          ? "hover:bg-accent hover:text-accent-foreground"
          : variant === "link"
            ? "text-primary underline-offset-4 hover:underline"
            : "bg-primary text-primary-foreground hover:bg-primary/90";

  return (
    <div className={clsx("flex", alignment === "left" ? "justify-start" : alignment === "right" ? "justify-end" : "justify-center")}>
      <a
        href={hrefUrl || "#"}
        className={clsx(
          "blkc-button inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
          sizeClass,
          variantClass,
          className,
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

  const widthClass =
    alignment === "wide" ? "w-full max-w-blkc" : alignment === "full" ? "w-full" : "w-full";

  return (
    <section
      className={clsx(
        "blkc-section text-foreground",
        widthClass,
        alignment === "wide" && "mx-auto",
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
      <div className="blkc-section-content mx-auto flex w-full max-w-blkc flex-col gap-6">
        {children}
      </div>
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

  // Only caller-supplied overrides are emitted, as inline custom properties.
  // The full default theme belongs in one stylesheet (getGlobalCSS, or the
  // Tailwind preset), not repeated inside every Block on the page.
  const themeStyle =
    theme && Object.keys(theme).length > 0
      ? (theme as unknown as React.CSSProperties)
      : undefined;

  try {
    const rendered = Wrapper ? (
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
    );

    const element = themeStyle ? <div style={themeStyle}>{rendered}</div> : rendered;

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

// Global CSS
// ============================================================================

/**
 * Generate the minimal stylesheet BLKC needs when Tailwind is not in use.
 *
 * The renderer styles Blocks with Tailwind utilities (see
 * `@blkc-code/tailwind-preset`), so this is not a component stylesheet: it is
 * the reset, the theme variables and the few layout defaults a page needs to be
 * readable without Tailwind. Anything Block-specific belongs in the Block's own
 * classes, not here — duplicated rules would fight the utilities instead of
 * complementing them.
 */
function getGlobalCSS(theme: ThemeVariables = DEFAULT_THEME): string {
  const mergedTheme = utils.mergeTheme(theme);

  return `
/* BLKC base styles (Tailwind-free fallback) */
*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--blkc-font-family, system-ui, sans-serif);
  font-size: var(--blkc-font-size-base, 1rem);
  line-height: 1.6;
  color: var(--blkc-color-text, #1a1a1a);
  background-color: var(--blkc-color-background, #ffffff);
}

img {
  max-width: 100%;
  height: auto;
}

.blkc-page {
  display: flex;
  flex-direction: column;
  gap: var(--blkc-spacing-md, 1rem);
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
  
  // HTML export (string output lives in @blkc-code/render-web/server)
  getGlobalCSS,
  
  // Default theme
  DEFAULT_THEME,
};
