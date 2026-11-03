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
| [`@blkc-code/logbook`](packages/logbook) | Hash-chained audit trail implementation | ✅ Stable |
| [`@blkc-code/cli`](packages/cli) | BLKC developer CLI tools | ✅ Stable |

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

- [v2 Specification](docs/v2-spec.md) - Complete technical specification
- [Architecture](docs/ARCHITECTURE.md) - Design decisions and rationale
- [API Reference](docs/API.md) - Public API documentation

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
│   ├── core/           # Zod schemas and types
│   ├── render-web/     # Web renderer (React/Next.js)
│   ├── logbook/        # Audit trail implementation
│   └── cli/            # CLI tools
├── docs/
│   ├── v2-spec.md      # Complete v2 specification
│   ├── ARCHITECTURE.md # Architecture decisions
│   └── API.md          # API documentation
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
