/**
 * BLKC Render-Web - Kit page rendering.
 *
 * `<KitPage kit page />` renders a Kit's page (by slug) to React.
 * `renderToHTML(kit, page)` (server entry) renders it to an HTML string.
 *
 * @package @blkc-code/render-web
 * @license Apache-2.0
 */

import React, { ReactNode } from "react";
import { KitManifest } from "@blkc-code/core";
import { BlockInstance } from "@blkc-code/core";
import { renderBlock, renderBlocks } from "./index.js";
import { RenderOptions } from "./types.js";
import { themeJsonToVariables } from "./utils.js";

// ============================================================================
// Kit page resolution
// ============================================================================

export interface KitPageProps {
  kit: KitManifest;
  page: string;
  options?: RenderOptions;
}

/**
 * Resolve a Kit's page (by slug) into its Block instances.
 * Returns null if the page is not found.
 */
export function resolveKitPage(kit: KitManifest, page: string): BlockInstance[] | null {
  const pages = kit.content?.pages ?? [];
  const found = pages.find((p) => p.slug === page || (page === "home" && p.slug === ""));
  if (!found) return null;
  return found.blocks ?? [];
}

/** The Kit's theme.json as CSS variables on the page wrapper. */
export function kitPageStyle(kit: KitManifest): React.CSSProperties | undefined {
  const vars = themeJsonToVariables(kit.theme);
  return Object.keys(vars).length > 0 ? (vars as React.CSSProperties) : undefined;
}

/**
 * React component that renders a Kit's page.
 */
export function KitPage({ kit, page, options }: KitPageProps): ReactNode {
  const instances = resolveKitPage(kit, page);
  if (!instances) {
    return <div className="blkc-page"><p>Page not found: {page}</p></div>;
  }

  const { elements } = renderBlocks(instances, options ?? {});
  return (
    <div className="blkc-page" style={kitPageStyle(kit)}>
      {elements.map((element, index) => (
        <React.Fragment key={index}>{element}</React.Fragment>
      ))}
    </div>
  );
}

export { renderBlock, renderBlocks };