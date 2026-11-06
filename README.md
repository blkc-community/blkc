# BLKC - Black Code Market Framework

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@blkc-code/core)](https://www.npmjs.com/package/@blkc-code/core)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-3178C6.svg)](https://www.typescriptlang.org/)

**BLKC** (Block, Kit, Circuit) is Black Code Market's open-source framework for building websites and workflow automation. It powers the BCM Sites visual builder and provides a structured way to define, compose, and render UI and capability blocks.

## Quick Start

Make something and see it in your browser. You only need Node.js 22 or newer:

```bash
mkdir my-site && cd my-site
npx @blkc-code/cli@latest new kit pixel-office
npx @blkc-code/cli@latest dev
```

`blkc dev` opens a preview at phone, tablet and desktop widths. It reloads when you save and
shows any errors in the page. It previews every Block, Kit and Circuit in the folder. Use
`--port` to pick a port and `--no-open` to skip opening the browser.

### Canvas Blocks

The `office` Block draws a living pixel-art office in a canvas, from JSON. Agents walk, work and react to their status, and tasks become quests. See [Pixel Office](https://github.com/blkc-community/kits/tree/main/pixel-office) for how to change it. On your own page, render it with `@blkc-code/render-web`, then call `mountCanvasBlocks()` from `@blkc-code/render-canvas`. `registerCanvasBlock()` adds other kinds.

### Run the office as an app

`blkc dev` on a Kit with an `office` Block opens a full-screen app at `/office`. Add and edit agents, move quests on the board, and changes save to `office-state.json` beside the Kit. Moving a quest with an owner to Doing or Done updates that agent too.

### Your project is the map

`blkc dev` builds a pixel-art office from your project, unique to it: its seed comes from the project's name, and its rooms from your folders. Folders shape their rooms too, so docs get bookshelves, API folders get server racks and assets become a garden.

The map changes as the project does. New folders add rooms, bigger folders grow and get more desks, and a deleted folder's room closes, or stays as an empty corridor if others need it to get around. Existing rooms stay where they are. Agents walk to the room for the folder they're working in.

In the app's Build tab you can draw rooms, add doors, place and move furniture, and link rooms to folders. Once you've edited a room, the generator leaves it alone. Finishing quests levels up the office and unlocks extra furniture.

```bash
npx @blkc-code/cli@latest office map            # generate or update it now
npx @blkc-code/cli@latest office map --freeze   # stop it following the project (--follow to resume)
npx @blkc-code/cli@latest office map --reset    # start again, discarding your edits
```

Only folder names and file counts are read, never file contents. The map and the office's state are saved beside the Kit, as `office-map.json` and `office-state.json`.

### Alerts and assigning work

When an agent gets stuck or finishes, you get a desktop notification and a sound while `blkc dev` runs. Use `--no-notify` to turn off the notifications.

Add quests in the app and assign them to an agent. MCP agents pick them up with `office_next_quest` and finish with `office_finish_quest`, and scripts can run `blkc office next <agent>`. Claude Code gets its quests when a session starts and with each prompt. With `office connect claude --auto-work` it also starts the next one by itself at the end of a turn. A quest another agent added is never handed out until a person assigns it.

### Connect your agents

Any agent on your machine can join. Nothing here is tied to one vendor:

```bash
npx @blkc-code/cli@latest office connect claude   # MCP, plus automatic updates through hooks
npx @blkc-code/cli@latest office connect cursor   # or vscode, or gemini: MCP
npx @blkc-code/cli@latest office connect codex    # prints the command to add the MCP server
npx @blkc-code/cli@latest office connect other    # prints the settings for any other MCP agent
```

The MCP server, `blkc office mcp`, runs on your machine over stdio and offers `office_status`, `office_leave`, `office_view`, `office_add_quest` and `office_update_quest`. Agents report when they choose to, so ask yours to use them. Claude Code's hooks report by themselves, and record only the kind of action and a file's name, never commands, prompts or contents.

Anything else can run a command:

```bash
npx @blkc-code/cli@latest office set "My Agent" working --task "Building the page"
```

### Make something your own

Blocks, Kits and Circuits can all be forked. `--from` copies one into your project under a new name, and `blkc dev` shows it:

```bash
npx @blkc-code/cli@latest new kit my-office --from pixel-office
npx @blkc-code/cli@latest new block my-hero --from hero
npx @blkc-code/cli@latest new circuit my-business --from smb-business-circuit
npx @blkc-code/cli@latest dev
```

The source is a name from [blocks](https://github.com/blkc-community/blocks), [kits](https://github.com/blkc-community/kits) or [circuits](https://github.com/blkc-community/circuits), or a local folder such as `./kits/my-kit`. Forks keep the original licence, and the README records where they came from.

A forked UI Block has its component in `render.web.tsx`. Edit it, use any Tailwind class, and save. To use it on a Kit page, list its id in the Kit's `blocks`. A Block with the same id as a built-in, such as `hero`, replaces it in the preview. On your own site, call `registerBlock("my-hero", MyHero)` from `@blkc-code/render-web`.

`blkc dev` runs your project's components on your machine, as any dev server does, so read code you did not write before you run it.

To work on BLKC itself:

```bash
# Install the core package
npm install @blkc-code/core

# Or use the workspace
cd external/blkc-community/blkc
git clone https://github.com/blkc-community/blkc.git
cd blkc
npm install
npm run build
```

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [`@blkc-code/core`](packages/core) | Zod schemas for Blocks, Kits, Circuits, Logbook | ✅ Stable |
| [`@blkc-code/render-web`](packages/render-web) | React/Next.js compatible web renderer | 🚧 In Development |
| [`@blkc-code/tailwind-preset`](packages/tailwind-preset) | Tailwind preset and theme tokens for the renderer | ✅ Stable |
| [`@blkc-code/logbook`](packages/logbook) | Hash-chained audit trail implementation | ✅ Stable |
| [`@blkc-code/cli`](packages/cli) | BLKC developer CLI tools | ✅ Stable |

## Styling

No Tailwind in your project? Add the compiled stylesheet and you are done:

```js
import "@blkc-code/render-web/styles.css";
```

The renderer emits Tailwind utility classes, so there is no bespoke CSS to maintain. Add the preset and you get BLKC's design tokens as Tailwind classes:

```ts
// tailwind.config.ts (Tailwind v3)
import blkcPreset from "@blkc-code/tailwind-preset";

export default {
  presets: [blkcPreset],
  content: ["./src/**/*.{ts,tsx}"],
};
```

```css
/* Tailwind v4 */
@import "tailwindcss";
@import "@blkc-code/tailwind-preset/blkc.css";

/* Retheme a Kit or a single site without touching component code */
:root {
  --blkc-color-primary: #0066cc;
  --blkc-radius: 0.75rem;
}
```

Every token is a CSS custom property, so a Kit or a single site can retheme the whole page by overriding variables — `primary`, `secondary`, `foreground`, `muted-foreground`, `border`, `accent`, `ring`, plus `border-radius-blkc`, `max-w-blkc` and the `p-blkc-*` spacing scale.

Blocks never take class names as props. A Block offers a small set of design choices (`tone`, `size`, `align`) and its component maps them to Tailwind classes; see [Designing a Block](docs/DESIGN.md).

### Rendering HTML (server only)

`renderPage()` renders React elements and works anywhere. Static HTML output needs `react-dom/server`, so it lives in a separate entry point:

```ts
import { renderToHTML, generateHtmlDocument } from "@blkc-code/render-web/server";

const { html, success } = renderToHTML(blocks);
const page = generateHtmlDocument(blocks, { title: "My site" });
```


## Concepts

### Block
A reusable component with a specific purpose. There are two kinds:

- **UI Block**: Page sections like hero, pricing, gallery. Defined with props schema, editor controls, and renderer references.
- **Capability Block**: Backend modules for AI/data processing, forms, checkout, booking.

### Kit
A template composed of:
- A set of Blocks
- Optional theme (WordPress theme.json compatible)
- Optional default content (pages with placed blocks)

### Circuit
A vertical solution bundle:
- Kits (templates)
- Board templates (Kanban workflows)
- Capability Blocks

### Logbook
A shared, hash-chained audit trail that records all changes across Sites, boards, MCP operations, and marketplace proof.

## Documentation

- [Designing a Block](docs/DESIGN.md) - How a Block communicates its look: design props, Tailwind classes and Kit tokens
- [v2 Specification](spec/v2.md) - Complete technical specification

## Development

### Prerequisites
- Node.js >= 22.0.0
- npm >= 10.0.0 (or bun for development)

### Setup
```bash
# Clone the repository
git clone https://github.com/blkc-community/blkc.git
cd blkc

# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm run test

# Run lint
npm run lint

# Type check
npm run typecheck
```

### Repository Structure
```
blkc/
├── packages/
│   ├── core/            # Zod schemas and types
│   ├── render-web/      # Web renderer (React/Next.js)
│   ├── tailwind-preset/ # Tailwind preset and theme tokens
│   ├── logbook/         # Audit trail implementation
│   └── cli/             # CLI tools
├── spec/
│   └── v2.md             # Complete v2 specification
├── LICENSE             # Apache-2.0
├── README.md
└── package.json        # Workspace root
```

## License

This project is licensed under the [Apache License 2.0](LICENSE).

### Content vs Framework
- **Framework packages** (`@blkc-code/*`): Apache-2.0
- **Content** (Blocks, Kits, Circuits in separate repos): MIT

## Community

- **GitHub**: [blkc-community](https://github.com/blkc-community)
- **Documentation**: [blkc.community](https://blkc.community) (coming soon)
- **Discussions**: [GitHub Discussions](https://github.com/blkc-community/blkc/discussions)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Code of Conduct

This project follows a Code of Conduct to ensure a welcoming community. Please follow these guidelines in all interactions.

## Security

Please report security vulnerabilities to security@blackcodemarket.com rather than creating a public issue.

## Acknowledgments

BLKC is built by [Black Code Enterprises LLC](https://blackcode.consulting) and the open-source community.

---

**Note**: This is a work in progress. The framework is being actively developed to support Black Code Market's Sites product. For production use, please check the latest release and documentation.
