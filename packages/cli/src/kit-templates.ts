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
  "summary": "A free Kit: a living pixel-art office for your project, plus a landing page.",
  "description": "Your agents and tasks become characters and quests in a pixel-art office, drawn by @blkc-code/render-canvas. The rest of the Kit shows every web Block with one theme.",
  "version": "0.2.1",
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
      "version": "^0.4.0",
      "required": true
    },
    {
      "blockId": "office",
      "version": "^0.4.0",
      "required": true
    },
    {
      "blockId": "services",
      "version": "^0.4.0",
      "required": true
    },
    {
      "blockId": "values",
      "version": "^0.4.0",
      "required": true
    },
    {
      "blockId": "cta",
      "version": "^0.4.0",
      "required": true
    },
    {
      "blockId": "text",
      "version": "^0.4.0",
      "required": true
    },
    {
      "blockId": "image",
      "version": "^0.4.0",
      "required": true
    },
    {
      "blockId": "button",
      "version": "^0.4.0",
      "required": true
    },
    {
      "blockId": "section",
      "version": "^0.4.0",
      "required": true
    },
    {
      "blockId": "story",
      "version": "^0.4.0",
      "required": true
    },
    {
      "blockId": "contact",
      "version": "^0.4.0",
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
            "color": "#14142b"
          },
          {
            "slug": "foreground",
            "name": "Foreground",
            "color": "#f1f1f8"
          },
          {
            "slug": "primary",
            "name": "Primary",
            "color": "#00ff88"
          },
          {
            "slug": "accent",
            "name": "Accent",
            "color": "#ff7ab6"
          },
          {
            "slug": "muted-foreground",
            "name": "Muted text",
            "color": "#b6b6d2"
          },
          {
            "slug": "surface",
            "name": "Surface",
            "color": "#20203f"
          },
          {
            "slug": "border",
            "name": "Border",
            "color": "#38386a"
          }
        ]
      },
      "typography": {
        "fontFamilies": [
          {
            "slug": "body",
            "name": "Body",
            "fontFamily": "ui-monospace, Menlo, Consolas, monospace"
          },
          {
            "slug": "pixel",
            "name": "Pixel",
            "fontFamily": "'Press Start 2P', ui-monospace, monospace"
          }
        ]
      }
    }
  },
  "content": {
    "pages": [
      {
        "slug": "",
        "title": "Home",
        "blocks": [
          {
            "block": "office",
            "props": {
              "heading": "Pixel Office",
              "intro": "Your agents and tasks, alive in a pixel-art office. Click an agent to see what it is doing. Every agent is data: change a status and it gets up and walks to where that work happens.",
              "agents": [
                {
                  "id": "nova",
                  "name": "Nova",
                  "role": "Builder",
                  "state": "working",
                  "task": "Building the checkout page"
                },
                {
                  "id": "sage",
                  "name": "Sage",
                  "role": "Researcher",
                  "state": "thinking",
                  "task": "Comparing three ways to do search"
                },
                {
                  "id": "rex",
                  "name": "Rex",
                  "role": "Fixer",
                  "state": "blocked",
                  "task": "Waiting on a login to the staging site"
                },
                {
                  "id": "juno",
                  "name": "Juno",
                  "role": "Reviewer",
                  "state": "reviewing",
                  "task": "Reading through the pricing page"
                },
                {
                  "id": "mika",
                  "name": "Mika",
                  "role": "Writer",
                  "state": "idle",
                  "task": "Taking a break between articles"
                },
                {
                  "id": "ola",
                  "name": "Ola",
                  "role": "Designer",
                  "state": "done",
                  "task": "Finished the new logo"
                }
              ],
              "tasks": [
                {
                  "title": "Design the logo",
                  "state": "done",
                  "agent": "ola"
                },
                {
                  "title": "Write the about page",
                  "state": "done",
                  "agent": "mika"
                },
                {
                  "title": "Build the checkout page",
                  "state": "doing",
                  "agent": "nova"
                },
                {
                  "title": "Choose a search tool",
                  "state": "doing",
                  "agent": "sage"
                },
                {
                  "title": "Review the pricing page",
                  "state": "doing",
                  "agent": "juno"
                },
                {
                  "title": "Fix the staging login",
                  "state": "todo",
                  "agent": "rex"
                },
                {
                  "title": "Launch",
                  "state": "todo"
                }
              ]
            }
          },
          {
            "block": "services",
            "props": {
              "heading": "What is in the Kit",
              "intro": "A Kit is a theme, pages and Blocks you can edit. Nothing here is locked away.",
              "items": [
                {
                  "title": "A living office",
                  "text": "Agents walk, work, take breaks and raise a flag when they are stuck, all from their status."
                },
                {
                  "title": "Quests",
                  "text": "Tasks show as notes on the quest board and as a progress bar across the office."
                },
                {
                  "title": "Your layout",
                  "text": "Rooms, doors and furniture are JSON, so you can build the office you want."
                }
              ]
            }
          },
          {
            "block": "values",
            "props": {
              "heading": "Why build it this way",
              "items": [
                {
                  "title": "You own it",
                  "text": "It is a folder of files in your project. Fork it and change anything."
                },
                {
                  "title": "No lock-in",
                  "text": "Plain JSON, and a page that still reads well with no JavaScript."
                },
                {
                  "title": "Original art",
                  "text": "Every sprite is drawn in code, so you can restyle it freely."
                }
              ]
            }
          },
          {
            "block": "cta",
            "props": {
              "heading": "Make it your own",
              "text": "Fork the Kit and run it on your machine in under a minute.",
              "cta": {
                "label": "Get the Kit",
                "href": "https://github.com/blkc-community/kits/tree/main/pixel-office"
              }
            }
          }
        ]
      },
      {
        "slug": "blocks",
        "title": "Every Block",
        "blocks": [
          {
            "block": "hero",
            "props": {
              "eyebrow": "The hero Block",
              "heading": "Every Block, one theme",
              "subheading": "This page uses each web Block once, so you can see them together and take what you need.",
              "cta": {
                "label": "Primary button",
                "href": "#"
              },
              "secondaryCta": {
                "label": "Second button",
                "href": "#",
                "variant": "outline"
              },
              "align": "center",
              "size": "sm"
            }
          },
          {
            "block": "text",
            "props": {
              "content": "<p>This is the <strong>text</strong> Block. It keeps lines to a comfortable length and takes rich text, including <a href=\"https://github.com/blkc-community/blocks\">links</a>.</p><p>Everything on this page takes its colours and fonts from the Kit, so changing the theme changes all of it.</p>",
              "tag": "div"
            }
          },
          {
            "block": "image",
            "props": {
              "src": "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2032%2018%22%20shape-rendering%3D%22crispEdges%22%3E%3Crect%20width%3D%2232%22%20height%3D%2218%22%20fill%3D%22%231f1f3d%22%2F%3E%3Crect%20y%3D%2213%22%20width%3D%2232%22%20height%3D%225%22%20fill%3D%22%23a06f45%22%2F%3E%3Crect%20x%3D%224%22%20y%3D%229%22%20width%3D%2210%22%20height%3D%224%22%20fill%3D%22%238a5a33%22%2F%3E%3Crect%20x%3D%227%22%20y%3D%225%22%20width%3D%225%22%20height%3D%224%22%20fill%3D%22%23111827%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%226%22%20width%3D%223%22%20height%3D%222%22%20fill%3D%22%2300ff88%22%2F%3E%3Crect%20x%3D%2219%22%20y%3D%226%22%20width%3D%224%22%20height%3D%224%22%20fill%3D%22%23f4d3b5%22%2F%3E%3Crect%20x%3D%2219%22%20y%3D%224%22%20width%3D%224%22%20height%3D%222%22%20fill%3D%22%235a3a22%22%2F%3E%3Crect%20x%3D%2218%22%20y%3D%2210%22%20width%3D%226%22%20height%3D%225%22%20fill%3D%22%233b82f6%22%2F%3E%3Crect%20x%3D%2226%22%20y%3D%229%22%20width%3D%223%22%20height%3D%224%22%20fill%3D%22%2315803d%22%2F%3E%3Crect%20x%3D%2226%22%20y%3D%2213%22%20width%3D%223%22%20height%3D%222%22%20fill%3D%22%2392400e%22%2F%3E%3C%2Fsvg%3E",
              "alt": "A pixel-art person at a desk with a computer and a plant",
              "caption": "The image Block, with a caption.",
              "width": "480px"
            }
          },
          {
            "block": "button",
            "props": {
              "label": "The button Block",
              "href": "#",
              "variant": "primary",
              "size": "lg"
            }
          },
          {
            "block": "section",
            "props": {
              "backgroundColor": "#20203f",
              "heading": "The section Block",
              "content": "<p>A band of colour that holds its own words, or other Blocks in code.</p>"
            }
          },
          {
            "block": "services",
            "props": {
              "heading": "The services Block",
              "intro": "A heading, an intro and a grid of cards.",
              "items": [
                {
                  "title": "First",
                  "text": "Each card has a title and some text.",
                  "link": {
                    "label": "And a link",
                    "href": "#"
                  }
                },
                {
                  "title": "Second",
                  "text": "The grid adapts to the width of the screen."
                },
                {
                  "title": "Third",
                  "text": "Hover over a card to lift it."
                }
              ]
            }
          },
          {
            "block": "story",
            "props": {
              "heading": "The story Block",
              "body": "<p>Words on one side and a picture on the other. On a phone they stack.</p><p>Use <strong>imageSide</strong> to swap them over.</p>",
              "image": {
                "src": "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2032%2018%22%20shape-rendering%3D%22crispEdges%22%3E%3Crect%20width%3D%2232%22%20height%3D%2218%22%20fill%3D%22%231f1f3d%22%2F%3E%3Crect%20y%3D%2213%22%20width%3D%2232%22%20height%3D%225%22%20fill%3D%22%23a06f45%22%2F%3E%3Crect%20x%3D%224%22%20y%3D%229%22%20width%3D%2210%22%20height%3D%224%22%20fill%3D%22%238a5a33%22%2F%3E%3Crect%20x%3D%227%22%20y%3D%225%22%20width%3D%225%22%20height%3D%224%22%20fill%3D%22%23111827%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%226%22%20width%3D%223%22%20height%3D%222%22%20fill%3D%22%2300ff88%22%2F%3E%3Crect%20x%3D%2219%22%20y%3D%226%22%20width%3D%224%22%20height%3D%224%22%20fill%3D%22%23f4d3b5%22%2F%3E%3Crect%20x%3D%2219%22%20y%3D%224%22%20width%3D%224%22%20height%3D%222%22%20fill%3D%22%235a3a22%22%2F%3E%3Crect%20x%3D%2218%22%20y%3D%2210%22%20width%3D%226%22%20height%3D%225%22%20fill%3D%22%233b82f6%22%2F%3E%3Crect%20x%3D%2226%22%20y%3D%229%22%20width%3D%223%22%20height%3D%224%22%20fill%3D%22%2315803d%22%2F%3E%3Crect%20x%3D%2226%22%20y%3D%2213%22%20width%3D%223%22%20height%3D%222%22%20fill%3D%22%2392400e%22%2F%3E%3C%2Fsvg%3E",
                "alt": "A pixel-art office scene"
              },
              "imageSide": "right"
            }
          },
          {
            "block": "values",
            "props": {
              "heading": "The values Block",
              "items": [
                {
                  "title": "One",
                  "text": "Cards on a tinted band."
                },
                {
                  "title": "Two",
                  "text": "Good for what you stand for."
                },
                {
                  "title": "Three",
                  "text": "Or for how you work."
                }
              ]
            }
          },
          {
            "block": "cta",
            "props": {
              "heading": "The call to action Block",
              "text": "One clear thing to do next.",
              "cta": {
                "label": "Do the thing",
                "href": "#"
              }
            }
          },
          {
            "block": "contact",
            "props": {
              "heading": "The contact Block",
              "intro": "Contact details, each on its own card.",
              "email": "hello@example.com",
              "phone": "+1 555 010 0199",
              "address": "1 Pixel Street, Tile City"
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
  "A free, MIT-licensed BLKC Kit: a living pixel-art office for your project. Your agents and tasks become characters and quests.",
  "",
  "## Run it",
  "",
  "```bash",
  "npx @blkc-code/cli@latest dev",
  "```",
  "",
  "This opens a preview in your browser and reloads when you save. Click an agent in the office to see what it is doing. The Every Block page shows each web Block with this theme.",
  "",
  "## Make it your own",
  "",
  "Everything is in `kit.json`:",
  "",
  "- **Colours and fonts:** `theme`.",
  "- **Words and sections:** `content.pages`.",
  "- **The team and quests:** the `office` Block's `agents` and `tasks`.",
  "- **The building:** give the `office` Block `cols`, `rows`, `rooms`, `doors` and `furniture`. Leave them out for the standard layout.",
  "",
  "An agent's `state` is one of `working`, `thinking`, `blocked`, `reviewing`, `idle`, `done` or `away`. Furniture types are `desk`, `coffee`, `water`, `sofa`, `plant`, `board`, `shelf`, `server`, `table` and `rug`.",
  "",
  "## Use it as an app",
  "",
  "`blkc dev` opens a full-screen app at `/office`. Add agents, move quests on the board, and changes save to `office-state.json`. Adding that file to `.gitignore` keeps your day-to-day status out of the repo.",
  "",
  "## Your project is the map",
  "",
  "`blkc dev` builds the office from your project, so it's unique to it, and it changes as your project does: new folders add rooms, and bigger folders grow. Agents walk to the room for the folder they're working in. Use the app's Build tab to draw rooms, add doors and place furniture. A room you've edited stays as you left it.",
  "",
  "## Alerts and quests",
  "",
  "You get a desktop notification and a sound when an agent is stuck or finishes. Assign quests in the app, and agents pick them up with `office_next_quest` over MCP or `blkc office next` from a script. Claude Code gets them automatically.",
  "",
  "## Connect your agents",
  "",
  "Any agent on your machine can join:",
  "",
  "```bash",
  "npx @blkc-code/cli@latest office connect claude   # MCP, plus automatic updates",
  "npx @blkc-code/cli@latest office connect cursor   # or vscode, or gemini",
  "npx @blkc-code/cli@latest office connect codex",
  "npx @blkc-code/cli@latest office connect other    # any other MCP agent",
  "```",
  "",
  "Then restart the agent. MCP agents report when they choose to, so ask yours to use the office tools. Anything else can run a command:",
  "",
  "```bash",
  "npx @blkc-code/cli@latest office set \"My Agent\" working --task \"Building the page\"",
  "```",
  "",
  "## Put it on your own site",
  "",
  "```js",
  "import { readFileSync } from \"node:fs\";",
  "import { renderToHTML } from \"@blkc-code/render-web/server\";",
  "",
  "const kit = JSON.parse(readFileSync(\"kits/pixel-office/kit.json\", \"utf8\"));",
  "const { html } = renderToHTML(kit, \"home\");",
  "```",
  "",
  "Then, on the page, add `@blkc-code/render-web/styles.css` and call `mountCanvasBlocks()` from `@blkc-code/render-canvas`, or load its `runtime.js` in a script tag.",
  "",
  "## Credits",
  "",
  "Inspired by [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) by Pablo De Lucca, MIT licensed. See [NOTICE](./NOTICE). The art here is original.",
].join("\n") + "\n";

const PIXEL_OFFICE_NOTICE = [
  "Pixel Office Kit",
  "Copyright (c) 2026 BLKC contributors. MIT licensed.",
  "",
  "Inspired by Pixel Agents",
  "https://github.com/pixel-agents-hq/pixel-agents",
  "Copyright (c) 2026 Pablo De Lucca. MIT licensed.",
  "",
  "Asset provenance: all characters, furniture, floors and walls are original work, drawn",
  "in code in @blkc-code/render-canvas. No Pixel Agents code or art is included. Anything",
  "imported from it later must keep that project's copyright and licence notice here.",
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
    "world.json": JSON.stringify({
      $schema: "https://blkc.blackcode.space/schemas/v2/world.json",
      skin: "office",
      applications: { markers: [] },
      include: [],
      ignore: [],
    }, null, 2) + "\n",
    "kit.test.mjs": PIXEL_OFFICE_TEST,
    "README.md": PIXEL_OFFICE_README,
    NOTICE: PIXEL_OFFICE_NOTICE,
  },
};
