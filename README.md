# BLKC - Black Code Market Framework

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@blkc-code/core)](https://www.npmjs.com/package/@blkc-code/core)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-3178C6.svg)](https://www.typescriptlang.org/)

**BLKC** (Block, Kit, Circuit) is Black Code Market's open-source framework for building websites and workflow automation. It powers the BCM Sites visual builder and provides a structured way to define, compose, and render UI and capability blocks.

## Quick Start

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
