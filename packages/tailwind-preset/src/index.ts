/**
 * BLKC Tailwind Preset - theme tokens shared by Blocks, Kits and Circuits.
 *
 * The renderer emits Tailwind utility classes, so a consumer only needs the
 * preset (Tailwind v3) or the CSS variables block (Tailwind v4) to get a
 * consistent, themeable look instead of hand-written CSS.
 *
 * Every token is exposed as a CSS custom property with a fallback, which means
 * a Kit or a site can retheme the whole page by overriding one variable and
 * never touching component code.
 *
 * @package @blkc-code/tailwind-preset
 * @license Apache-2.0
 * @author Black Code Enterprises LLC
 */

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/**
 * CSS custom properties used by the BLKC renderer.
 * Values match `DEFAULT_THEME` in `@blkc-code/render-web`.
 */
export interface BlkcThemeTokens {
  "--blkc-color-primary": string;
  "--blkc-color-secondary": string;
  "--blkc-color-background": string;
  "--blkc-color-text": string;
  "--blkc-color-text-secondary": string;
  "--blkc-color-border": string;
  "--blkc-font-family": string;
  "--blkc-font-size-base": string;
  "--blkc-font-size-sm": string;
  "--blkc-font-size-lg": string;
  "--blkc-font-weight-normal": string;
  "--blkc-font-weight-bold": string;
  "--blkc-spacing-xs": string;
  "--blkc-spacing-sm": string;
  "--blkc-spacing-md": string;
  "--blkc-spacing-lg": string;
  "--blkc-spacing-xl": string;
  "--blkc-max-width": string;
  "--blkc-margin-auto": string;
  "--blkc-border-radius": string;
  "--blkc-border-width": string;
  "--blkc-shadow-sm": string;
  "--blkc-shadow-md": string;
  "--blkc-shadow-lg": string;
}

/**
 * Default BLKC tokens.
 */
export const blkcTokens: BlkcThemeTokens = {
  "--blkc-color-primary": "#0066cc",
  "--blkc-color-secondary": "#6c757d",
  "--blkc-color-background": "#ffffff",
  "--blkc-color-text": "#1a1a1a",
  "--blkc-color-text-secondary": "#6c757d",
  "--blkc-color-border": "#e0e0e0",
  "--blkc-font-family":
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif",
  "--blkc-font-size-base": "1rem",
  "--blkc-font-size-sm": "0.875rem",
  "--blkc-font-size-lg": "1.25rem",
  "--blkc-font-weight-normal": "400",
  "--blkc-font-weight-bold": "700",
  "--blkc-spacing-xs": "0.25rem",
  "--blkc-spacing-sm": "0.5rem",
  "--blkc-spacing-md": "1rem",
  "--blkc-spacing-lg": "2rem",
  "--blkc-spacing-xl": "4rem",
  "--blkc-max-width": "1200px",
  "--blkc-margin-auto": "0 auto",
  "--blkc-border-radius": "8px",
  "--blkc-border-width": "1px",
  "--blkc-shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.05)",
  "--blkc-shadow-md": "0 4px 6px rgba(0, 0, 0, 0.1)",
  "--blkc-shadow-lg": "0 10px 15px rgba(0, 0, 0, 0.1)",
};

/**
 * Theme shape accepted by the Tailwind preset (a partial override of the tokens).
 */
export type BlkcThemeOverrides = Partial<BlkcThemeTokens>;

/**
 * Resolve a token set, filling gaps from `blkcTokens`.
 */
export function resolveBlkcTheme(overrides: BlkcThemeOverrides = {}): BlkcThemeTokens {
  return { ...blkcTokens, ...overrides };
}

// ---------------------------------------------------------------------------
// CSS variable output (Tailwind v4 `@theme`, or a plain `:root` block)
// ---------------------------------------------------------------------------

/**
 * Render the tokens as CSS custom property declarations.
 *
 * @param overrides - tokens to replace
 * @param selector - selector to wrap the declarations in; pass an empty string
 *   to emit bare declarations (useful inside a Tailwind v4 `@theme { ... }`).
 */
export function blkcCssVariables(
  overrides: BlkcThemeOverrides = {},
  selector = ":root",
): string {
  const theme = resolveBlkcTheme(overrides);
  const declarations = Object.entries(theme)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");

  if (selector === "") {
    return `${declarations}\n`;
  }

  return `${selector} {\n${declarations}\n}\n`;
}

// ---------------------------------------------------------------------------
// Tailwind v4 theme (CSS-first)
// ---------------------------------------------------------------------------

/**
 * Utility name -> BLKC token. Tailwind v4 has no JS preset, so the semantic
 * utilities the renderer emits (`bg-primary`, `text-muted-foreground`,
 * `rounded-blkc`, ...) are declared as a `@theme inline` block instead.
 */
const utilityTheme: ReadonlyArray<readonly [utility: string, token: keyof BlkcThemeTokens]> = [
  ["--color-primary", "--blkc-color-primary"],
  ["--color-primary-foreground", "--blkc-color-background"],
  ["--color-secondary", "--blkc-color-secondary"],
  ["--color-secondary-foreground", "--blkc-color-background"],
  ["--color-background", "--blkc-color-background"],
  ["--color-foreground", "--blkc-color-text"],
  ["--color-muted", "--blkc-color-background"],
  ["--color-muted-foreground", "--blkc-color-text-secondary"],
  ["--color-border", "--blkc-color-border"],
  ["--color-input", "--blkc-color-border"],
  ["--color-accent", "--blkc-color-primary"],
  ["--color-accent-foreground", "--blkc-color-background"],
  ["--color-ring", "--blkc-color-primary"],
  ["--radius-blkc", "--blkc-border-radius"],
  ["--container-blkc", "--blkc-max-width"],
  ["--font-blkc", "--blkc-font-family"],
  ["--shadow-blkc", "--blkc-shadow-md"],
  ["--shadow-blkc-sm", "--blkc-shadow-sm"],
  ["--shadow-blkc-lg", "--blkc-shadow-lg"],
  ["--spacing-blkc-xs", "--blkc-spacing-xs"],
  ["--spacing-blkc-sm", "--blkc-spacing-sm"],
  ["--spacing-blkc-md", "--blkc-spacing-md"],
  ["--spacing-blkc-lg", "--blkc-spacing-lg"],
  ["--spacing-blkc-xl", "--blkc-spacing-xl"],
];

/**
 * Render the Tailwind v4 `@theme inline` block.
 *
 * `inline` matters: it makes each utility resolve through the CSS variable
 * instead of copying the value, so overriding a token in `:root` rethemes the
 * utilities too.
 */
export function blkcThemeCss(overrides: BlkcThemeOverrides = {}): string {
  const theme = resolveBlkcTheme(overrides);
  const declarations = utilityTheme
    .map(([utility, token]) => `  ${utility}: var(${token}, ${theme[token]});`)
    .join("\n");

  return `@theme inline {\n${declarations}\n}\n`;
}

// ---------------------------------------------------------------------------
// Tailwind preset
// ---------------------------------------------------------------------------

/**
 * A Tailwind theme extension. Typed structurally so this package stays free of
 * a Tailwind dependency and works with v3 presets and v4 `@config`.
 */
export interface BlkcTailwindPreset {
  theme: {
    extend: {
      colors: Record<string, string>;
      borderRadius: Record<string, string>;
      maxWidth: Record<string, string>;
      fontFamily: Record<string, string[]>;
      spacing: Record<string, string>;
      boxShadow: Record<string, string>;
    };
  };
}

/**
 * Tailwind preset for BLKC. Every value reads a CSS variable, so a Kit themes
 * the page by overriding variables rather than replacing the preset.
 *
 * @example Tailwind v3
 * ```ts
 * // tailwind.config.ts
 * import blkcPreset from "@blkc-code/tailwind-preset";
 * export default { presets: [blkcPreset], content: ["./src/**\/*.{ts,tsx}"] };
 * ```
 */
export const blkcPreset: BlkcTailwindPreset = {
  theme: {
    extend: {
      colors: {
        primary: "var(--blkc-color-primary, #0066cc)",
        "primary-foreground": "var(--blkc-color-background, #ffffff)",
        secondary: "var(--blkc-color-secondary, #6c757d)",
        "secondary-foreground": "var(--blkc-color-background, #ffffff)",
        background: "var(--blkc-color-background, #ffffff)",
        foreground: "var(--blkc-color-text, #1a1a1a)",
        muted: "var(--blkc-color-background, #ffffff)",
        "muted-foreground": "var(--blkc-color-text-secondary, #6c757d)",
        border: "var(--blkc-color-border, #e0e0e0)",
        input: "var(--blkc-color-border, #e0e0e0)",
        accent: "var(--blkc-color-primary, #0066cc)",
        "accent-foreground": "var(--blkc-color-background, #ffffff)",
        ring: "var(--blkc-color-primary, #0066cc)",
      },
      borderRadius: {
        blkc: "var(--blkc-border-radius, 8px)",
      },
      maxWidth: {
        blkc: "var(--blkc-max-width, 1200px)",
      },
      fontFamily: {
        blkc: ["var(--blkc-font-family, system-ui, sans-serif)"],
      },
      spacing: {
        "blkc-xs": "var(--blkc-spacing-xs, 0.25rem)",
        "blkc-sm": "var(--blkc-spacing-sm, 0.5rem)",
        "blkc-md": "var(--blkc-spacing-md, 1rem)",
        "blkc-lg": "var(--blkc-spacing-lg, 2rem)",
        "blkc-xl": "var(--blkc-spacing-xl, 4rem)",
      },
      boxShadow: {
        "blkc-sm": "var(--blkc-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05))",
        blkc: "var(--blkc-shadow-md, 0 4px 6px rgba(0, 0, 0, 0.1))",
        "blkc-lg": "var(--blkc-shadow-lg, 0 10px 15px rgba(0, 0, 0, 0.1))",
      },
    },
  },
};

export default blkcPreset;
