/**
 * BLKC Render-Web - Utility Functions
 * 
 * This file contains utility functions for the web renderer.
 * 
 * @package @blkc-code/render-web
 * @license Apache-2.0
 * @author Black Code Enterprises LLC
 */

import { BlockInstance, UiBlockManifest } from "@blkc-code/core";
import type { Theme } from "@blkc-code/core";
import { ThemeVariables, DEFAULT_THEME } from "./types.js";

// ============================================================================
// Class Name Utilities
// ============================================================================

/**
 * Combine class names using clsx.
 * Falls back to simple concatenation if clsx is not available.
 */
function cx(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Generate a class name for a Block wrapper.
 */
function getBlockClassName(blockId: string, className?: string): string {
  return cx(`blkc-block`, `blkc-${blockId}`, className);
}

/**
 * Generate a class name for a Block element.
 */
function getBlockElementClassName(blockId: string, element: string, className?: string): string {
  return cx(`blkc-${blockId}-${element}`, className);
}

// ============================================================================
// Style Utilities
// ============================================================================

/**
 * Convert a hex color to RGB.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Remove # if present
  hex = hex.replace(/^#/, '');
  
  // Parse r, g, b values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Check if all values are valid
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return null;
  }
  
  return { r, g, b };
}

/**
 * Convert a hex color to RGBA string.
 */
function hexToRgba(hex: string, alpha: number = 1): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Darken a hex color.
 */
function darkenColor(hex: string, amount: number = 10): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const r = Math.max(0, rgb.r - amount);
  const g = Math.max(0, rgb.g - amount);
  const b = Math.max(0, rgb.b - amount);
  
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toLowerCase()}`;
}

/**
 * Lighten a hex color.
 */
function lightenColor(hex: string, amount: number = 10): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const r = Math.min(255, rgb.r + amount);
  const g = Math.min(255, rgb.g + amount);
  const b = Math.min(255, rgb.b + amount);
  
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toLowerCase()}`;
}

/**
 * Add alpha transparency to a hex color.
 */
function addAlpha(hex: string, alpha: number): string {
  return hexToRgba(hex, alpha);
}

// ============================================================================
// Theme Utilities
// ============================================================================

/**
 * Merge theme variables with defaults.
 */
function mergeTheme(theme?: ThemeVariables): ThemeVariables {
  return { ...DEFAULT_THEME, ...theme };
}

/**
 * Convert theme variables to CSS custom properties string.
 */
/** Colour slugs with a different name in the variable set. */
const PALETTE_ALIASES: Record<string, string> = {
  foreground: "--blkc-color-text",
  "muted-foreground": "--blkc-color-text-secondary",
};

/**
 * A theme value ends up inside a style attribute. Anything that could end the
 * declaration or fetch a URL is refused rather than escaped.
 */
function isSafeCssValue(value: unknown): value is string {
  return typeof value === "string" && !/[;{}<>]|url\(|expression\(|@import/i.test(value);
}

/**
 * `theme.json` (spec Q5: colours, two font families, radius, spacing scale) as
 * CSS variables. The first font family is the body font, the second the heading.
 */
function themeJsonToVariables(theme?: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  const set = (name: string, value: unknown): void => {
    if (isSafeCssValue(value)) vars[name] = value;
  };
  const slug = (value: string): string => value.replace(/[^a-z0-9-]/gi, "");

  for (const { slug: name, color } of theme?.settings?.color?.palette ?? []) {
    set(PALETTE_ALIASES[name] ?? `--blkc-color-${slug(name)}`, color);
  }
  const families = theme?.settings?.typography?.fontFamilies ?? [];
  set("--blkc-font-family", families[0]?.fontFamily);
  set("--blkc-font-family-heading", families[1]?.fontFamily);
  for (const { slug: name, size } of theme?.settings?.spacing?.spacingSizes ?? []) {
    set(`--blkc-spacing-${slug(name)}`, size);
  }
  set("--blkc-border-radius", theme?.styles?.["radius"]);
  return vars;
}

function themeToCss(theme: ThemeVariables): string {
  return Object.entries(theme)
    .map(([key, value]) => `${key}: ${value};`)
    .join("\n");
}

/**
 * Generate a style object from theme variables.
 */
function themeToStyle(theme: ThemeVariables): React.CSSProperties {
  const style: React.CSSProperties = {};
  
  for (const [key, value] of Object.entries(theme)) {
    if (key.startsWith("--")) {
      // CSS custom property - don't add to style object
      continue;
    }
    // @ts-expect-error - Dynamic property assignment
    style[key] = value;
  }
  
  return style;
}

// ============================================================================
// Block Utilities
// ============================================================================

/**
 * Get the alignment class name for a Block.
 */
function getAlignmentClass(align?: string): string {
  if (!align) return "";
  
  const alignmentMap: Record<string, string> = {
    left: "blkc-align-left",
    center: "blkc-align-center",
    right: "blkc-align-right",
    wide: "blkc-align-wide",
    full: "blkc-align-full",
  };
  
  return alignmentMap[align] || "";
}

/**
 * Get the text alignment class name.
 */
function getTextAlignmentClass(textAlign?: string): string {
  if (!textAlign) return "";
  
  const textAlignmentMap: Record<string, string> = {
    left: "blkc-text-left",
    center: "blkc-text-center",
    right: "blkc-text-right",
  };
  
  return textAlignmentMap[textAlign] || "";
}

/**
 * Get the color class name.
 */
function getColorClass(color?: string): string {
  if (!color) return "";
  
  // Sanitize color for class name
  const safeColor = color.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return `blkc-color-${safeColor}`;
}

/**
 * Get the background color class name.
 */
function getBackgroundColorClass(backgroundColor?: string): string {
  if (!backgroundColor) return "";
  
  const safeColor = backgroundColor.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return `blkc-bg-${safeColor}`;
}

// ============================================================================
// Size Utilities
// ============================================================================

/**
 * Get the font size class name.
 */
function getFontSizeClass(size?: string): string {
  if (!size) return "";
  
  const sizeMap: Record<string, string> = {
    xs: "blkc-text-xs",
    sm: "blkc-text-sm",
    base: "blkc-text-base",
    lg: "blkc-text-lg",
    xl: "blkc-text-xl",
    "2xl": "blkc-text-2xl",
    "3xl": "blkc-text-3xl",
  };
  
  return sizeMap[size] || `blkc-text-${size}`;
}

/**
 * Get the font weight class name.
 */
function getFontWeightClass(weight?: string | number): string {
  if (!weight) return "";
  
  const weightMap: Record<string, string> = {
    normal: "blkc-font-normal",
    bold: "blkc-font-bold",
    light: "blkc-font-light",
    semibold: "blkc-font-semibold",
    100: "blkc-font-thin",
    200: "blkc-font-extralight",
    300: "blkc-font-light",
    400: "blkc-font-normal",
    500: "blkc-font-medium",
    600: "blkc-font-semibold",
    700: "blkc-font-bold",
    800: "blkc-font-extrabold",
    900: "blkc-font-black",
  };
  
  return weightMap[String(weight)] || "";
}

/**
 * Get the spacing class name.
 */
function getSpacingClass(spacing?: string, direction?: "m" | "p"): string {
  if (!spacing) return "";
  
  const directionPrefix = direction === "p" ? "p" : "m";
  const safeSpacing = spacing.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return `blkc-${directionPrefix}-${safeSpacing}`;
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate that a Block manifest is a UI Block.
 */
function isValidUiBlock(manifest: unknown): manifest is UiBlockManifest {
  // This is a runtime check - the type system ensures compile-time safety
  return (
    typeof manifest === "object" &&
    manifest !== null &&
    "kind" in manifest &&
    manifest.kind === "ui"
  );
}

/**
 * Validate that a Block instance has the required fields.
 */
function isValidBlockInstance(instance: unknown): instance is BlockInstance {
  return (
    typeof instance === "object" &&
    instance !== null &&
    "block" in instance &&
    typeof instance.block === "string"
  );
}

/**
 * Safely get a prop value with a default.
 */
function getProp<T>(props: Record<string, unknown>, key: string, defaultValue: T): T {
  return (props[key] as T) ?? defaultValue;
}

/**
 * Safely get a string prop with a default.
 */
function getStringProp(props: Record<string, unknown>, key: string, defaultValue: string): string {
  const value = props[key];
  return typeof value === "string" ? value : defaultValue;
}

/**
 * Safely get a number prop with a default.
 */
function getNumberProp(props: Record<string, unknown>, key: string, defaultValue: number): number {
  const value = props[key];
  return typeof value === "number" ? value : defaultValue;
}

/**
 * Safely get a boolean prop with a default.
 */
function getBooleanProp(props: Record<string, unknown>, key: string, defaultValue: boolean): boolean {
  const value = props[key];
  return typeof value === "boolean" ? value : defaultValue;
}

// ============================================================================
// URL Utilities
// ============================================================================

/**
 * Normalize a URL for use in href attributes.
 */
function normalizeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  
  // Add protocol if missing
  if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("/") && !url.startsWith("#") && !url.startsWith("mailto:") && !url.startsWith("tel:")) {
    return `https://${url}`;
  }
  
  return url;
}

/**
 * Check if a URL is external.
 */
function isExternalUrl(url?: string): boolean {
  if (!url) return false;
  
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("//");
}

// ============================================================================
// Accessibility Utilities
// ============================================================================

/**
 * Generate ARIA attributes for accessibility.
 */
function getAriaAttributes(props: Record<string, unknown>): Record<string, string> {
  const aria: Record<string, string> = {};
  
  // Map common prop names to ARIA attributes
  const ariaMap: Record<string, string> = {
    ariaLabel: "aria-label",
    ariaDescribedby: "aria-describedby",
    ariaHidden: "aria-hidden",
    ariaExpanded: "aria-expanded",
    ariaSelected: "aria-selected",
    ariaDisabled: "aria-disabled",
  };
  
  for (const [propKey, attrName] of Object.entries(ariaMap)) {
    if (propKey in props) {
      const value = props[propKey];
      if (value !== undefined && value !== null) {
        aria[attrName] = String(value);
      }
    }
  }
  
  // Handle special cases
  const propsRecord = props as Record<string, unknown>;
  if ("disabled" in props && propsRecord["disabled"] === true) {
    aria["aria-disabled"] = "true";
  }
  
  if ("hidden" in props && propsRecord["hidden"] === true) {
    aria["aria-hidden"] = "true";
  }
  
  return aria;
}

/**
 * Generate role attribute for semantic HTML.
 */
function getRoleAttribute(props: Record<string, unknown>): string | undefined {
  if ("role" in props) {
    const role = props["role"];
    if (typeof role === "string") {
      return role;
    }
  }
  return undefined;
}

// ============================================================================
// Exports
// ============================================================================

export {
  cx,
  getBlockClassName,
  getBlockElementClassName,
  hexToRgb,
  hexToRgba,
  darkenColor,
  lightenColor,
  addAlpha,
  mergeTheme,
  themeToCss,
  themeJsonToVariables,
  themeToStyle,
  getAlignmentClass,
  getTextAlignmentClass,
  getColorClass,
  getBackgroundColorClass,
  getFontSizeClass,
  getFontWeightClass,
  getSpacingClass,
  isValidUiBlock,
  isValidBlockInstance,
  getProp,
  getStringProp,
  getNumberProp,
  getBooleanProp,
  normalizeUrl,
  isExternalUrl,
  getAriaAttributes,
  getRoleAttribute,
};
