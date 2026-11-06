/**
 * BLKC Render-Web - Design vocabulary tests
 *
 * A Block's design is a closed set of choices (`tone`, `size`, `align`) that the
 * component maps to Tailwind classes. These tests pin that contract: every
 * choice produces a known class, and an unknown choice can never smuggle an
 * arbitrary class into the page.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroBlock } from "./index";
import type { HeroProps } from "./types";

function render(props: HeroProps): string {
  return renderToStaticMarkup(
    <HeroBlock props={props} className="probe" style={{}} />,
  );
}

describe("tone", () => {
  it("defaults to the page colours", () => {
    const html = render({ heading: "H" });

    expect(html).toContain("bg-background");
    expect(html).toContain("text-foreground");
  });

  it("maps each tone to its own surface", () => {
    const expected: Record<string, string> = {
      default: "bg-background text-foreground",
      muted: "bg-muted text-foreground",
      accent: "bg-accent text-accent-foreground",
      inverse: "bg-foreground text-background",
    };

    for (const [tone, classes] of Object.entries(expected)) {
      const html = render({ heading: "H", tone: tone as HeroProps["tone"] });
      expect(html).toContain(classes);
    }
  });

  it("falls back instead of interpolating an unknown tone", () => {
    const html = render({
      heading: "H",
      tone: "bg-red-500 text-white" as unknown as HeroProps["tone"],
    });

    expect(html).toContain("bg-background");
    expect(html).not.toContain("bg-red-500");
  });
});

describe("size", () => {
  it("scales rhythm and type together", () => {
    const sm = render({ heading: "H", size: "sm" });
    const lg = render({ heading: "H", size: "lg" });

    expect(sm).toContain("py-10");
    expect(sm).toContain("text-3xl");
    expect(lg).toContain("py-24");
    expect(lg).toContain("text-5xl");
  });

  it("defaults to md", () => {
    expect(render({ heading: "H" })).toContain("py-16");
  });

  it("falls back instead of interpolating an unknown size", () => {
    const html = render({ heading: "H", size: "gigantic" as unknown as HeroProps["size"] });

    expect(html).toContain("py-16");
    expect(html).not.toContain("gigantic");
  });
});

describe("align", () => {
  it("aligns content and the cta row together", () => {
    const center = render({
      heading: "H",
      align: "center",
      cta: { label: "Go", href: "/go" },
    });
    const right = render({
      heading: "H",
      align: "right",
      cta: { label: "Go", href: "/go" },
    });

    expect(center).toContain("text-center");
    expect(center).toContain("justify-center");
    expect(right).toContain("text-right");
    expect(right).toContain("justify-end");
  });

  it("prefers align over the legacy textAlign prop", () => {
    const html = render({ heading: "H", align: "left", textAlign: "center" });

    expect(html).toContain("text-left");
    expect(html).not.toContain("text-center");
  });
});

describe("content", () => {
  it("renders eyebrow, both calls to action and the image alt", () => {
    const html = render({
      eyebrow: "Columbus, Ohio",
      heading: "Fresh bread",
      subheading: "Order by 8pm",
      cta: { label: "Order now", href: "/order" },
      secondaryCta: { label: "See the menu", href: "/menu" },
      image: { src: "/bread.jpg", alt: "Sourdough loaf" },
    });

    expect(html).toContain("Columbus, Ohio");
    expect(html).toContain("Order now");
    expect(html).toContain("See the menu");
    expect(html).toContain('alt="Sourdough loaf"');
    expect(html).toContain("uppercase");
  });

  it("gives the secondary cta the outline treatment by default", () => {
    const html = render({
      heading: "H",
      secondaryCta: { label: "See the menu", href: "/menu" },
    });

    expect(html).toContain("border-border");
  });
});

describe("escape hatches", () => {
  it("lets an inline prop beat the design vocabulary", () => {
    const html = render({ heading: "H", padding: "1px 2px", backgroundColor: "#123456" });

    expect(html).toContain("padding:1px 2px");
    expect(html).toContain("#123456");
  });

  it("keeps the className hook for site-level overrides", () => {
    expect(render({ heading: "H" })).toContain("probe");
  });
});
