/**
 * BLKC Render-Web - Theme token drift guard
 *
 * The renderer's DEFAULT_THEME and the Tailwind preset describe the same CSS
 * custom properties. If they drift, a Tailwind consumer silently gets a
 * different look from a `getGlobalCSS()` consumer, which is the kind of split
 * nobody notices until a Kit is shipped.
 */

import { describe, it, expect } from "vitest";
import { DEFAULT_THEME } from "./types";
import { blkcTokens } from "@blkc-code/tailwind-preset";

describe("theme tokens", () => {
  it("matches DEFAULT_THEME key for key", () => {
    expect(blkcTokens).toEqual(DEFAULT_THEME);
  });
});
