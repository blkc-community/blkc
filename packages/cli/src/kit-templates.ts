/**
 * Kits that `blkc new kit <id>` writes in full instead of a blank scaffold.
 * This is a copy of the published Kit, so it works offline. Keep it in step with
 * github.com/blkc-community/kits, whose folder of the same name is the source.
 */

const pixelOfficeKit = {
  "$schema": "https://blkc.blackcode.space/schemas/v2/kit.json",
  "manifestVersion": 2,
  "id": "pixel-office",
  "name": "Pixel Office",
  "summary": "A free Kit: the landing page for a pixel-art office for your project.",
  "description": "The first release of Pixel Office: a themed landing page you can render with @blkc-code/render-web. The pixel-art office itself is not built yet. It needs the reserved canvas renderer.",
  "version": "0.1.0",
  "category": "showcase",
  "tags": [
    "pixel",
    "office",
    "agents",
    "gamification",
    "free"
  ],
  "license": "MIT",
  "blocks": [
    {
      "blockId": "hero",
      "version": "^0.2.0",
      "required": true
    },
    {
      "blockId": "text",
      "version": "^0.2.0",
      "required": true
    }
  ],
  "theme": {
    "version": 3,
    "settings": {
      "color": {
        "palette": [
          {
            "slug": "background",
            "name": "Background",
            "color": "#1a1a2e"
          },
          {
            "slug": "foreground",
            "name": "Foreground",
            "color": "#e0e0e0"
          },
          {
            "slug": "primary",
            "name": "Primary",
            "color": "#00ff88"
          },
          {
            "slug": "accent",
            "name": "Accent",
            "color": "#ff6b6b"
          },
          {
            "slug": "muted-foreground",
            "name": "Muted text",
            "color": "#a0a0b8"
          },
          {
            "slug": "surface",
            "name": "Surface",
            "color": "#16213e"
          }
        ]
      },
      "typography": {
        "fontFamilies": [
          {
            "slug": "pixel",
            "name": "Pixel",
            "fontFamily": "'Press Start 2P', monospace"
          }
        ]
      }
    }
  },
  "content": {
    "pages": [
      {
        "slug": "",
        "title": "Pixel Office",
        "blocks": [
          {
            "block": "hero",
            "props": {
              "eyebrow": "Free and MIT licensed",
              "heading": "Pixel Office",
              "subheading": "A pixel-art office for your project, on its way. This Kit is the first piece: its theme and landing page.",
              "cta": {
                "label": "View on GitHub",
                "href": "https://github.com/blkc-community/kits/tree/main/pixel-office"
              },
              "secondaryCta": {
                "label": "Read the docs",
                "href": "https://blkc.blackcode.space/docs"
              },
              "tone": "inverse",
              "size": "lg",
              "align": "center"
            }
          },
          {
            "block": "text",
            "props": {
              "content": "<p>Pixel Office will turn a BLKC project into a playful pixel-art office, with your AI coding agents as animated characters. It is inspired by <a href=\"https://github.com/pixel-agents-hq/pixel-agents\">Pixel Agents</a> (MIT).</p><p>Today this Kit is a landing page and a theme. The office needs a canvas renderer, which BLKC has reserved in its format but not built yet.</p>",
              "tag": "div",
              "textAlign": "center"
            }
          }
        ]
      }
    ]
  },
  "maintainers": [
    {
      "name": "BLKC Core Team",
      "role": "Platform"
    }
  ],
  "visibility": "public",
  "repository": "https://github.com/blkc-community/kits/tree/main/pixel-office",
  "documentation": "https://blkc.blackcode.space/kits/pixeloffice"
};

const PIXEL_OFFICE_README = [
  "# Pixel Office",
  "",
  "A free, MIT-licensed BLKC Kit. The goal is a pixel-art office for your project, with",
  "your AI coding agents as animated characters.",
  "",
  "## Status",
  "",
  "This first release is a **theme and a landing page**. The office is not built yet: it",
  "needs the `canvas` renderer target, which the BLKC format reserves but no renderer",
  "implements.",
  "",
  "## Run it",
  "",
  "```bash",
  "npx @blkc-code/cli@latest dev",
  "```",
  "",
  "This opens a preview in your browser and reloads when you save. Edit `kit.json`: the",
  "colours and font are under `theme`, and the words and sections under `content.pages`.",
  "",
  "To render it inside your own site instead:",
  "",
  "```js",
  "import { readFileSync } from \"node:fs\";",
  "import { renderToHTML } from \"@blkc-code/render-web/server\";",
  "",
  "const kit = JSON.parse(readFileSync(\"kits/pixel-office/kit.json\", \"utf8\"));",
  "const { html } = renderToHTML(kit, \"home\");",
  "```",
  "",
  "The markup uses Tailwind classes. If your site has no Tailwind, add",
  "`@blkc-code/render-web/styles.css`.",
  "",
  "## Credits",
  "",
  "Inspired by [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) by Pablo De",
  "Lucca, MIT licensed. See [NOTICE](./NOTICE). No Pixel Agents code or art is included yet.",
].join("\n") + "\n";

const PIXEL_OFFICE_NOTICE = [
  "Pixel Office Kit",
  "Copyright (c) 2026 BLKC contributors. MIT licensed.",
  "",
  "Inspired by Pixel Agents",
  "https://github.com/pixel-agents-hq/pixel-agents",
  "Copyright (c) 2026 Pablo De Lucca. MIT licensed.",
  "",
  "No Pixel Agents code or art is included in this Kit yet. Anything imported from it",
  "later must keep that project's copyright and licence notice here.",
].join("\n") + "\n";

const PIXEL_OFFICE_TEST = `import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const kit = JSON.parse(readFileSync(new URL("./kit.json", import.meta.url), "utf8"));

test("kit.json declares pixel-office", () => {
  assert.equal(kit.id, "pixel-office");
  assert.equal(kit.manifestVersion, 2);
});

test("every block on a page is declared by the Kit", () => {
  const declared = new Set(kit.blocks.map((block) => block.blockId));
  for (const page of kit.content.pages) {
    for (const { block } of page.blocks) assert.ok(declared.has(block), block);
  }
});
`;

export const KIT_TEMPLATES: Record<string, Record<string, string>> = {
  "pixel-office": {
    "kit.json": JSON.stringify(pixelOfficeKit, null, 2) + "\n",
    "kit.test.mjs": PIXEL_OFFICE_TEST,
    "README.md": PIXEL_OFFICE_README,
    NOTICE: PIXEL_OFFICE_NOTICE,
  },
};
