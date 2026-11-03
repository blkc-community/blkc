# Designing a Block

How a Block expresses its look, and why it works the way it does.

The short version:

> **Content says what. A Block's manifest offers a small set of design choices.
> The component — in code, not in JSON — maps those choices to Tailwind classes.
> A Kit supplies the tokens those classes resolve to.**

Three layers, three owners:

| Layer | Lives in | Owns | Example |
|---|---|---|---|
| Content | the page's Block instance JSON | words, links, images | `"heading": "Fresh bread"` |
| Design surface | the Block manifest (`props` + `controls`) | closed choices | `"tone": "accent"`, `"size": "lg"` |
| Presentation | the Block's renderer component | Tailwind classes and layout | `bg-accent text-accent-foreground` |
| Tokens | the Kit theme (`theme.json`) / `@blkc-code/tailwind-preset` | colours, type, spacing | `--blkc-color-primary` |

## Why not just put class names in the Block?

Because a class name in JSON produces no CSS.

```jsonc
// Do NOT do this
{ "block": "hero", "props": { "className": "bg-blue-600 text-white px-12" } }
```

Tailwind generates classes by scanning source files at build time. A string that
only exists in content — a database row, a CMS field, a user's page JSON — was
never seen by the scanner, so `.bg-blue-600` is never emitted. The page renders
with the class and no styles. You only find out in production, and only on the
pages someone happened to edit.

Even when it does work (a safelist, or a JIT that scans the database), it costs
you:

- **No theme.** A hard-coded `bg-blue-600` ignores the Kit, so the same Block
  cannot look at home in two different sites.
- **No design system.** Every page invents its own spacing scale, and nothing
  stops eleven slightly different blues.
- **No validation.** `props` is a JSON Schema with enums. `"tone": "accent"` can
  be validated and offered as a dropdown; `"className": "bg-accent/80"` cannot.

## The design surface

Design choices are ordinary props, but they are **closed enums** and they are
grouped as `style` in the inspector:

| Prop | Values | What it decides |
|---|---|---|
| `tone` | `default` · `muted` · `accent` · `inverse` | surface colour, from theme tokens |
| `size` | `sm` · `md` · `lg` | vertical rhythm **and** type scale, together |
| `align` | `left` · `center` · `right` | text alignment and where the CTA row sits |

`size` is the important one. A Block that offers `headingSize` and `padding` and
`gap` separately asks the author to make a design decision three times and get
it wrong twice. One `size` keeps the scale coherent.

Anything that is not in this table is **content**, and belongs in the content
props.

## Worked example: the hero Block

### 1. The manifest declares the choices

`blocks/hero/manifest.json` (abridged):

```jsonc
{
  "kind": "ui",
  "id": "hero",
  "props": {
    "type": "object",
    "properties": {
      "heading":    { "type": "string", "minLength": 1, "maxLength": 120 },
      "subheading": { "type": "string", "maxLength": 280 },
      "cta": {
        "type": "object",
        "properties": {
          "label": { "type": "string", "minLength": 1, "maxLength": 40 },
          "href":  { "type": "string", "minLength": 1 }
        },
        "required": ["label", "href"]
      },

      // the design surface — closed, validated, themed
      "tone":  { "type": "string", "enum": ["default", "muted", "accent", "inverse"], "default": "default" },
      "size":  { "type": "string", "enum": ["sm", "md", "lg"], "default": "md" },
      "align": { "type": "string", "enum": ["left", "center", "right"], "default": "left" }
    },
    "required": ["heading"]
  },

  "controls": [
    { "prop": "heading", "control": "text", "label": "Heading", "group": "content" },
    { "prop": "tone",    "control": "select", "label": "Tone",    "group": "style",
      "options": [
        { "label": "Default", "value": "default" },
        { "label": "Muted",   "value": "muted" },
        { "label": "Accent",  "value": "accent" },
        { "label": "Inverse", "value": "inverse" }
      ] }
  ],

  "renderers": { "web": { "package": "@blkc-code/render-web", "export": "HeroBlock" } }
}
```

Note what is **absent**: no `className`, no `style`, no `padding`. The frame is
the Block's business, not the author's.

### 2. The component owns the mapping

`@blkc-code/render-web`, `HeroBlock`:

```tsx
const HERO_TONE_CLASSES: Record<BlockTone, string> = {
  default: "bg-background text-foreground",
  muted: "bg-muted text-foreground",
  accent: "bg-accent text-accent-foreground",
  inverse: "bg-foreground text-background",
};

const HERO_SIZE_CLASSES = {
  sm: { section: "py-10", gap: "gap-3", heading: "text-3xl sm:text-4xl", subheading: "text-base sm:text-lg" },
  md: { section: "py-16", gap: "gap-4", heading: "text-4xl sm:text-5xl", subheading: "text-lg sm:text-xl" },
  lg: { section: "py-24", gap: "gap-6", heading: "text-5xl sm:text-6xl", subheading: "text-xl sm:text-2xl" },
};

function HeroBlock({ props: p, className }: BlockProps<HeroProps>) {
  const { heading, subheading, cta, tone = "default", size = "md", align = "left" } = p;

  const toneClass = HERO_TONE_CLASSES[tone] ?? HERO_TONE_CLASSES.default;
  const scale = HERO_SIZE_CLASSES[size] ?? HERO_SIZE_CLASSES.md;

  return (
    <section className={clsx("blkc-hero flex w-full flex-col px-4", scale.section, toneClass, className)}>
      <h1 className={clsx("font-bold tracking-tight", scale.heading)}>{heading}</h1>
      {subheading && <p className={clsx("text-muted-foreground", scale.subheading)}>{subheading}</p>}
      {cta && <a className="bg-primary text-primary-foreground" href={cta.href}>{cta.label}</a>}
    </section>
  );
}
```

Two rules are doing the work here:

1. **Every class is a literal in this file.** `HERO_TONE_CLASSES.accent` is a
   string constant, so Tailwind sees it and generates it. Never
   `` `bg-${tone}-500` ``.
2. **An unknown value falls back; it is never interpolated.** The
   `?? HERO_TONE_CLASSES.default` is not defensive noise — it is what stops a
   hand-edited page JSON from putting arbitrary text into a class attribute.
   `design.test.tsx` asserts exactly that.

### 3. The Kit supplies the tokens

`tone` resolves to `bg-accent`, which the Tailwind preset defines as
`var(--blkc-color-primary, …)`. So the theme, not the Block, decides what
"accent" looks like:

```css
/* a Kit, or a single site */
:root {
  --blkc-color-primary: #b45309;
  --blkc-border-radius: 0px;
}
```

The same hero instance — the same JSON — now renders warm and square in one Kit
and blue and rounded in another. Nothing about the Block changed.

### 4. What the page actually stores

```json
{
  "block": "hero",
  "props": {
    "eyebrow": "Columbus, Ohio",
    "heading": "Fresh bread, baked before sunrise",
    "subheading": "Order by 8pm for next-morning pickup.",
    "cta": { "label": "Order now", "href": "/order" },
    "secondaryCta": { "label": "See the menu", "href": "/menu" },
    "tone": "default",
    "size": "lg",
    "align": "left"
  }
}
```

Read it out loud and you can tell what the page is and how loud it is. No
implementation detail leaked into the content, and a redesign is a theme change,
not a content migration.

## Escape hatches (use them, sparingly)

Some Blocks accept raw style props — `backgroundColor`, `textColor`, `padding`,
`minHeight`. They are inline values that deliberately beat the design vocabulary
when one Block must differ from its Kit. They are documented as escape hatches
because a page built entirely from them is a page that has opted out of theming.

At the site level, every Block component also takes `className` (passed by the
renderer's `wrapperClassName` option), so a project can restyle a Block without
forking it.

## Adding a design prop — checklist

1. Add the enum to the Block's zod schema in its repo (`blocks/<id>/src/props.ts`).
2. Regenerate the manifest's `props` JSON Schema and add a `group: "style"` control.
3. Add the enum member to the component's class map in the renderer. Literal
   strings only.
4. Make the fallback explicit (`?? DEFAULT`) so bad JSON cannot inject classes.
5. Add a test proving each value produces its class, and that an unknown value
   falls back.
6. If the new choice needs a token the theme does not have, add it to
   `@blkc-code/tailwind-preset` first — do not hard-code a colour in the Block.
