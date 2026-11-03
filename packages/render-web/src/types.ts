/**
 * BLKC Render-Web - Type Definitions
 * 
 * This file contains TypeScript type definitions for the web renderer.
 * 
 * @package @blkc-code/render-web
 * @license Apache-2.0
 * @author Black Code Enterprises LLC
 */

import { UiBlockManifest } from "@blkc-code/core";
import { ReactNode } from "react";

// ============================================================================
// Component Types
// ============================================================================

/**
 * Props for a BLKC Block component.
 * Each Block receives its props and can render accordingly.
 */
export interface BlockProps<T = Record<string, unknown>> {
  /** The Block's props from the instance */
  props: T;
  /** Optional className to apply to the root element */
  className?: string;
  /** Optional style object */
  style?: React.CSSProperties;
  /** Optional children (for nested Blocks) */
  children?: ReactNode;
}

/**
 * A BLKC Block component type.
 * Must accept BlockProps and return a React element.
 */
export type BlockComponent<T = Record<string, unknown>> = React.ComponentType<BlockProps<T>>;

// ============================================================================
// Registry Types
// ============================================================================

/**
 * Block registry entry: maps Block ID to its component and manifest.
 */
export interface BlockRegistryEntry {
  /** The Block's manifest */
  manifest: UiBlockManifest;
  /** The React component that renders this Block */
  component: BlockComponent;
}

/**
 * The Block registry: maps Block IDs to their registry entries.
 */
export type BlockRegistry = Map<string, BlockRegistryEntry>;

// ============================================================================
// Render Types
// ============================================================================

/**
 * Render options for controlling how Blocks are rendered.
 */
export interface RenderOptions {
  /** Whether to include wrapper divs (default: true) */
  includeWrappers?: boolean;
  /** Custom className for Block wrappers */
  wrapperClassName?: string;
  /** Custom component for Block wrappers */
  wrapperComponent?: React.ComponentType<{ children: ReactNode; className?: string }>;
  /** Whether to pass through className prop (default: true) */
  passThroughClassName?: boolean;
  /** Theme variables to apply */
  theme?: ThemeVariables;
}

/**
 * Result of rendering a Block.
 */
export interface RenderResult {
  /** The React element representing the rendered Block */
  element: ReactNode;
  /** The Block ID that was rendered */
  blockId: string;
  /** Whether rendering was successful */
  success: boolean;
  /** Error message if rendering failed */
  error?: string;
}

/**
 * Result of rendering to HTML.
 */
export interface RenderToHtmlResult {
  /** The HTML string */
  html: string;
  /** Whether rendering was successful */
  success: boolean;
  /** Error message if rendering failed */
  error?: string;
  /** Array of Block IDs that were rendered */
  renderedBlocks: string[];
}

// ============================================================================
// Theme Types
// ============================================================================

/**
 * Theme variables for styling Blocks.
 * These map to CSS custom properties.
 */
export interface ThemeVariables {
  // Colors
  "--blkc-color-primary"?: string;
  "--blkc-color-secondary"?: string;
  "--blkc-color-background"?: string;
  "--blkc-color-text"?: string;
  "--blkc-color-text-secondary"?: string;
  "--blkc-color-border"?: string;
  
  // Typography
  "--blkc-font-family"?: string;
  "--blkc-font-size-base"?: string;
  "--blkc-font-size-sm"?: string;
  "--blkc-font-size-lg"?: string;
  "--blkc-font-weight-normal"?: string;
  "--blkc-font-weight-bold"?: string;
  
  // Spacing
  "--blkc-spacing-xs"?: string;
  "--blkc-spacing-sm"?: string;
  "--blkc-spacing-md"?: string;
  "--blkc-spacing-lg"?: string;
  "--blkc-spacing-xl"?: string;
  
  // Layout
  "--blkc-max-width"?: string;
  "--blkc-margin-auto"?: string;
  
  // Borders
  "--blkc-border-radius"?: string;
  "--blkc-border-width"?: string;
  
  // Shadows
  "--blkc-shadow-sm"?: string;
  "--blkc-shadow-md"?: string;
  "--blkc-shadow-lg"?: string;
}

/**
 * Default theme variables.
 */
export const DEFAULT_THEME: ThemeVariables = {
  // Colors
  "--blkc-color-primary": "#0066cc",
  "--blkc-color-secondary": "#6c757d",
  "--blkc-color-background": "#ffffff",
  "--blkc-color-text": "#1a1a1a",
  "--blkc-color-text-secondary": "#6c757d",
  "--blkc-color-border": "#e0e0e0",
  
  // Typography
  "--blkc-font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif",
  "--blkc-font-size-base": "1rem",
  "--blkc-font-size-sm": "0.875rem",
  "--blkc-font-size-lg": "1.25rem",
  "--blkc-font-weight-normal": "400",
  "--blkc-font-weight-bold": "700",
  
  // Spacing
  "--blkc-spacing-xs": "0.25rem",
  "--blkc-spacing-sm": "0.5rem",
  "--blkc-spacing-md": "1rem",
  "--blkc-spacing-lg": "2rem",
  "--blkc-spacing-xl": "4rem",
  
  // Layout
  "--blkc-max-width": "1200px",
  "--blkc-margin-auto": "0 auto",
  
  // Borders
  "--blkc-border-radius": "8px",
  "--blkc-border-width": "1px",
  
  // Shadows
  "--blkc-shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.05)",
  "--blkc-shadow-md": "0 4px 6px rgba(0, 0, 0, 0.1)",
  "--blkc-shadow-lg": "0 10px 15px rgba(0, 0, 0, 0.1)",
};

// ============================================================================
// Alignment Types
// ============================================================================

/**
 * Text alignment options.
 */
export type TextAlign = "left" | "center" | "right";

/**
 * Block alignment options (WordPress-style).
 */
export type BlockAlign = "left" | "center" | "right" | "wide" | "full";

// ============================================================================
// Built-in Block Props
// ============================================================================

/**
 * Props for the Hero Block.
 */
export interface HeroProps {
  heading: string;
  subheading?: string;
  cta?: {
    label: string;
    href: string;
    variant?: "primary" | "secondary" | "outline";
    target?: "_blank" | "_self" | "_parent" | "_top";
  };
  image?: {
    src: string;
    alt: string;
    position?: "left" | "right" | "top" | "bottom";
  };
  backgroundColor?: string;
  textColor?: string;
  textAlign?: TextAlign;
  padding?: string;
  minHeight?: string;
}

/**
 * Props for the Text Block.
 */
export interface TextProps {
  content: string;
  tag?: "p" | "div" | "span" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  color?: string;
  backgroundColor?: string;
  fontSize?: string;
  fontWeight?: string;
  textAlign?: TextAlign;
  margin?: string;
  padding?: string;
  className?: string;
}

/**
 * Props for the Image Block.
 */
export interface ImageProps {
  src: string;
  alt: string;
  width?: string | number;
  height?: string | number;
  objectFit?: "cover" | "contain" | "fill" | "scale-down";
  borderRadius?: string;
  caption?: string;
  link?: string;
  alignment?: BlockAlign;
  className?: string;
}

/**
 * Props for the Button Block.
 */
export interface ButtonProps {
  label: string;
  href: string;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "link";
  size?: "sm" | "md" | "lg";
  alignment?: BlockAlign;
  className?: string;
  target?: "_blank" | "_self" | "_parent" | "_top";
  icon?: ReactNode;
  iconPosition?: "left" | "right";
}

/**
 * Props for the Section Block (container/wrapper).
 */
export interface SectionProps {
  children?: ReactNode;
  backgroundColor?: string;
  textColor?: string;
  padding?: string;
  margin?: string;
  minHeight?: string;
  alignment?: BlockAlign;
  className?: string;
}

// ============================================================================
// Component Props Types
// ============================================================================

/**
 * Props for the Hero component.
 */
export type HeroBlockProps = BlockProps<HeroProps>;

/**
 * Props for the Text component.
 */
export type TextBlockProps = BlockProps<TextProps>;

/**
 * Props for the Image component.
 */
export type ImageBlockProps = BlockProps<ImageProps>;

/**
 * Props for the Button component.
 */
export type ButtonBlockProps = BlockProps<ButtonProps>;

/**
 * Props for the Section component.
 */
export type SectionBlockProps = BlockProps<SectionProps>;
