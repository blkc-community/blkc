/**
 * BLKC Render-Web - Server rendering entry point.
 *
 * Static HTML generation needs `react-dom/server`, which resolves to a
 * different implementation in the browser and would otherwise be pulled into
 * every client bundle that imports the renderer. Keeping it behind
 * `@blkc-code/render-web/server` keeps the main entry client-safe and lets the
 * SSG helpers work in plain Node ESM (a bare `require()` does not exist there).
 *
 * @package @blkc-code/render-web
 * @license Apache-2.0
 * @author Black Code Enterprises LLC
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BlockInstance, KitManifest } from "@blkc-code/core";
import { renderBlock, renderBlocks, getGlobalCSS, resolveKitPage } from "./index.js";
import {
  RenderOptions,
  RenderToHtmlResult,
  ThemeVariables,
} from "./types.js";
import * as utils from "./utils.js";
import { kitPageStyle } from "./kit.js";
import { ManifestPreview } from "./preview.js";

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
    const html = renderToStaticMarkup(result.element);
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
  options: RenderOptions = {},
  pageStyle?: React.CSSProperties
): RenderToHtmlResult {
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
    const html = renderToStaticMarkup(
      <div className="blkc-page" style={pageStyle}>{elements.map((element, index) => (
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
 * Render a page (array of Block instances, or a Kit + page slug) to HTML string.
 * This is the primary function for static site generation (NFR17-18).
 */
function renderToHTML(
  instancesOrKit: BlockInstance[] | KitManifest,
  pageOrOptions?: string | RenderOptions,
  options: RenderOptions = {}
): RenderToHtmlResult {
  if (Array.isArray(instancesOrKit)) {
    return renderBlocksToHTML(instancesOrKit, (pageOrOptions as RenderOptions) ?? {});
  }
  const kit = instancesOrKit as KitManifest;
  const page = (pageOrOptions as string) ?? "home";
  const instances = resolveKitPage(kit, page);
  if (!instances) {
    return { html: "", success: false, error: `Page not found: ${page}`, renderedBlocks: [] };
  }
  return renderBlocksToHTML(instances, options, kitPageStyle(kit));
}

// ============================================================================

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

// ============================================================================
// Manifest preview (blkc dev and the playground)
// ============================================================================

/** Draw a Block, a Kit page or a Circuit to an HTML fragment. */
function renderManifestToHTML(manifest: unknown, options: { page?: string } = {}): string {
  return renderToStaticMarkup(<ManifestPreview manifest={manifest} page={options.page} />);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`).replace(/&#38;/g, "&amp;");
}

/** The web fonts a Kit names in quotes, as Google Fonts links. */
function themeFontLinks(manifest: unknown): string {
  const theme = (manifest as { theme?: { settings?: { typography?: { fontFamilies?: { fontFamily?: unknown }[] } } } } | null)?.theme;
  return (theme?.settings?.typography?.fontFamilies ?? []).slice(0, 2).map(({ fontFamily }) => {
    const name = typeof fontFamily === "string" ? /^\s*['"]([^'"]+)['"]/.exec(fontFamily)?.[1] : undefined;
    return name ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${escapeHtml(encodeURIComponent(name))}&amp;display=swap">` : "";
  }).join("");
}

/**
 * Locks a preview down when the host can't set headers: the one script with this nonce
 * runs, and nothing can reach the network except images and web fonts.
 */
function previewPolicy(nonce: string): string {
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src * data:; base-uri 'self'">`;
}

/**
 * A complete HTML page for a manifest. Pass the stylesheet in `head`, as a
 * <style> holding @blkc-code/render-web/styles.css or a <link> to it. `head` is
 * trusted markup; everything taken from the manifest is escaped.
 */
function renderManifestDocument(
  manifest: unknown,
  options: {
    page?: string;
    head?: string;
    lang?: string;
    /** @blkc-code/render-canvas/runtime.txt. Runs only if the page has a canvas Block. */
    canvasRuntime?: string;
    /** Adds a policy to the page itself: for previews on hosts that can't send a header. */
    nonce?: string;
  } = {},
): string {
  const name = (manifest as { name?: unknown } | null)?.name;
  const title = typeof name === "string" ? name : "BLKC preview";
  const body = renderManifestToHTML(manifest, options);
  const nonce = options.nonce ? ` nonce="${escapeHtml(options.nonce)}"` : "";
  const runtime = options.canvasRuntime && body.includes("data-blkc-canvas=")
    ? `<script${nonce}>${options.canvasRuntime.replace(/<\/script/gi, "<\\/script")}</script>`
    : "";
  return `<!doctype html>
<html lang="${escapeHtml(options.lang ?? "en")}">
<head>
<meta charset="utf-8">
${options.nonce ? previewPolicy(escapeHtml(options.nonce)) : ""}
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${themeFontLinks(manifest)}
${options.head ?? ""}
</head>
<body style="margin:0">${body}${runtime}</body>
</html>
`;
}

export {
  renderManifestToHTML,
  renderManifestDocument,
  renderBlockToHTML,
  renderBlocksToHTML,
  renderToHTML,
  generateHtmlDocument,
};
