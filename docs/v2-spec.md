# BLKC v2 Specification

**Status:** Draft (2026-11-02)  
**Source:** `packages/core/src/index.ts`  
**Tests:** `packages/core/src/__tests__/schemas.test.ts`

This document is the executable specification for BLKC v2. The TypeScript schemas in the core package are the source of truth, and these tests enforce the rules described here.

## Overview

BLKC v1 described one thing: **backend AI/data modules (Blocks)** grouped into Kits and Circuits. Black Code Market needs the same vocabulary to describe **websites and trade bundles** too: page sections, themes, default content, and Kanban boards.

v2 adds this capability **without breaking any v1 manifest**. Every v1 Block parses unchanged as a capability Block.

| Concept | v1 | v2 |
|---------|----|----|
| **Block** | Backend module | `kind: "ui"` page section **or** `kind: "capability"` module |
| **Kit** | List of Blocks | Template: Blocks + theme (`theme.json` shape) + default content |
| **Circuit** | List of Kits | Trade bundle: Kits + board templates + capability Blocks |
| **Logbook** | Hash-chained events | Same chain, shared across Sites, boards, MCP, and marketplace proof |

---

## Compatibility Rules

1. **`manifestVersion`** is `1 | 2` and defaults to `1`. New manifests **must** declare `2`.
2. A **Block with no `kind`** is treated as a **capability** Block. Every v1 Block manifest parses unchanged.
3. Every new Kit and Circuit field is **optional**, or defaults to an empty list.
4. **Logbook entries** gain an optional `subject`. It's omitted when absent, so existing entry hashes don't change.
5. The **default license** for Blocks remains `MIT`. Content (Blocks, Kits, Circuits) is MIT, matching the `blkc-community/blocks`, `kits`, and `circuits` repos. Framework packages are Apache-2.0.
6. **`repository`** points at the item's folder in the shared content repo (e.g., `https://github.com/blkc-community/blocks/tree/main/hero`), not at a repo per item.

**Breaking changes wait for `manifestVersion: 3`.**

---

## Block

All Blocks share these fields:
- `manifestVersion` (1 or 2, default 1)
- `id` (identifier: lowercase alphanumeric with hyphens, 3-64 chars)
- `name` (string)
- `summary` (string)
- `description` (string)
- `version` (string)
- `tags` (array of strings, default empty)
- `license` (string, default "MIT")
- `authors` (array of Person, default empty)
- `homepage` (URL, optional)
- `repository` (URL, optional)
- `docs` (URL, optional)
- `metrics` (array of UsageMetric, default empty)
- `visibility` ("public" or "private", default "public")
- `changelog` (array of ChangelogEntry, default empty)

### Capability Block (`kind: "capability"`)

This is the v1 Block shape, representing backend modules:

```json
{
  "kind": "capability",
  "entryPoint": "./index.js",
  "runtime": "bun",
  "sizeMB": 42,
  "inputs": ["prompt", "context"],
  "outputs": ["response"],
  "capabilities": [
    { "id": "generate-text", "description": "Generate text from prompts" }
  ]
}
```

Fields:
- **`entryPoint`** (string, required): Path to the module's entry file
- **`runtime`** (enum: `"bun"` | `"node"` | `"python"` | `"docker"`, default `"bun"`): Execution environment
- **`sizeMB`** (number, optional): Approximate memory usage in MB (0-100)
- **`inputs`** (array of strings, default empty): Input parameter names
- **`outputs`** (array of strings, default empty): Output parameter names
- **`capabilities`** (array of BlockCapability, default empty): Named capabilities this Block provides

Use cases: AI/data processing, forms, Stripe checkout, booking, etc.

### UI Block (`kind: "ui"`)

A page section (hero, pricing, gallery, testimonials, etc.). It has three parts:

#### 1. Props Schema

Authors write props as a **zod** schema in the Block package, then emit JSON Schema:

```typescript
// In Block package
const HeroPropsSchema = z.object({
  heading: z.string(),
  subheading: z.string().optional(),
  cta: z.object({
    label: z.string(),
    href: z.string().url()
  })
});

// In manifest
manifest.props = z.toJSONSchema(HeroPropsSchema, { io: "input" });
```

The `props` field must be a JSON Schema **object schema** with `properties`. Tests verify the manifest and zod source haven't drifted.

#### 2. Editor Controls

Modelled on WordPress `block.json`:

```json
{
  "controls": [
    {
      "prop": "heading",
      "control": "text",
      "label": "Main heading",
      "group": "content",
      "help": "The primary headline for this section"
    },
    {
      "prop": "cta.href",
      "control": "url",
      "label": "Primary button link",
      "group": "content"
    },
    {
      "prop": "backgroundColor",
      "control": "color",
      "label": "Background color",
      "group": "style"
    }
  ]
}
```

**Control types:** `text`, `textarea`, `richtext`, `url`, `number`, `range`, `toggle`, `select`, `color`, `image`, `link`, `repeater`

**Fields:**
- `prop` (string, required): Prop name or dot path. First segment must exist in `props.properties`
- `control` (ControlType, required): Type of editor control
- `group` (enum: `"content"` | `"style"` | `"settings"`, default `"content"`): Sidebar panel
- `label` (string, required): Human-readable label
- `help` (string, optional): Help text
- `placeholder` (string, optional): Placeholder text
- `min` / `max` / `step` (number, optional): For number/range controls
- `options` (array, required for `select`): Array of `{ label, value }` pairs
- `fields` (array, required for `repeater`): Leaf controls relative to array items

#### 3. Block Supports

Mirrors WordPress `block.json` `supports`:

```json
{
  "supports": {
    "align": ["left", "center", "right", "wide", "full"],
    "color": {
      "text": true,
      "background": true
    },
    "spacing": {
      "padding": true,
      "margin": true
    },
    "typography": {
      "fontSize": true,
      "fontFamily": true
    }
  }
}
```

When a Block supports these features, the editor offers **Kit theme presets** instead of free values.

#### 4. Renderer Reference

Says which component draws the Block on each platform:

```json
{
  "renderers": {
    "web": {
      "package": "@blkc-code/render-web",
      "export": "Hero",
      "version": "^0.1.0"
    }
  }
}
```

**Targets:** `web`, `native`, `tv`  
**Requirement:** At least one renderer must be specified. For now, every UI Block should ship `web`.

#### 5. Additional UI Block Fields

- **`category`** (string, optional): Inserter grouping (e.g., `"hero"`, `"content"`, `"commerce"`)
- **`example`** (object, optional): Sample props for previews. Must include every required prop.

#### Complete UI Block Example

```json
{
  "manifestVersion": 2,
  "kind": "ui",
  "id": "hero",
  "name": "Hero Section",
  "summary": "A hero section with heading, subheading, and CTA button",
  "version": "0.1.0",
  "category": "hero",
  "props": {
    "type": "object",
    "properties": {
      "heading": { "type": "string" },
      "subheading": { "type": "string" },
      "cta": {
        "type": "object",
        "properties": {
          "label": { "type": "string" },
          "href": { "type": "string", "format": "uri" }
        },
        "required": ["label", "href"]
      }
    },
    "required": ["heading", "cta"]
  },
  "controls": [
    { "prop": "heading", "control": "text", "label": "Heading" },
    { "prop": "subheading", "control": "textarea", "label": "Subheading" },
    { "prop": "cta.label", "control": "text", "label": "Button label" },
    { "prop": "cta.href", "control": "url", "label": "Button link" }
  ],
  "renderers": {
    "web": { "package": "@blkc-code/render-web", "export": "Hero" }
  },
  "example": {
    "heading": "Welcome to my site",
    "cta": { "label": "Get Started", "href": "/start" }
  }
}
```

---

## Kit = Template

A Kit is a template composed of Blocks, optional theme, and optional default content:

```json
{
  "manifestVersion": 2,
  "id": "bakery-site",
  "name": "Bakery Website",
  "summary": "A complete website template for bakeries",
  "description": "Includes hero, menu, about, and contact sections with a bakery-themed design.",
  "version": "0.1.0",
  "category": "food",
  "tags": ["bakery", "food", "restaurant"],
  "blocks": [
    { "blockId": "hero", "version": "^0.1.0", "alias": "main-hero" },
    { "blockId": "menu", "version": "^0.1.0" },
    { "blockId": "about", "version": "^0.1.0" }
  ],
  "theme": {
    "version": 3,
    "settings": {
      "color": {
        "palette": [
          { "slug": "primary", "name": "Primary", "color": "#E85A4F" },
          { "slug": "secondary", "name": "Secondary", "color": "#2E4A66" }
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
          { "block": "main-hero", "props": { "heading": "Fresh Bread Daily" } },
          { "block": "menu", "props": {} }
        ]
      }
    ]
  }
}
```

### Kit Fields

- **`blocks`** (array of KitBlockRef, required): Blocks this Kit uses
  - `blockId` (Identifier, required): Block identifier
  - `version` (string, required): Version constraint
  - `alias` (string, optional): Alternative name for this Block in the Kit
  - `required` (boolean, default true): Whether this Block must be present
  - `config` (object, optional): Block-specific configuration

- **`theme`** (Theme, optional): WordPress theme.json v3 subset
  - Validated parts: `settings.color.palette`, `settings.color.gradients`, `settings.typography.fontFamilies`, `settings.typography.fontSizes`, `settings.spacing.spacingSizes`, `settings.spacing.units`, `settings.layout`, `styles`
  - Unknown keys are preserved, so a real `theme.json` can be dropped in
  - Renderers turn presets into CSS custom properties (`--wp--preset--color--<slug>`)

- **`content`** (KitContent, optional): Default pages
  - `pages` (array of KitPage): Array of page definitions
    - `slug` (string, required): URL slug (lowercase path format)
    - `title` (string, required): Page title
    - `blocks` (array of BlockInstance): Ordered list of placed Blocks
      - `block` (string, required): Block ID or alias from Kit's blocks
      - `props` (object, default empty): Props for this Block instance

**Validation:** Every `block` in a page's blocks must match the `blockId` or `alias` of one of the Kit's blocks.

---

## Circuit = Trade Bundle

A Circuit is a vertical solution composed of Kits, board templates, and capability Blocks:

```json
{
  "manifestVersion": 2,
  "id": "local-service-business",
  "name": "Local Service Business",
  "summary": "Complete solution for local service businesses",
  "description": "Includes website template, job management board, and booking capability.",
  "version": "0.1.0",
  "verticals": ["service", "local"],
  "tags": ["business", "service", "local"],
  "kits": [
    { "kitId": "service-site", "version": "^0.1.0" }
  ],
  "boards": [
    {
      "id": "jobs",
      "name": "Jobs",
      "description": "Track service jobs from lead to completion",
      "columns": [
        { "id": "lead", "name": "Lead", "wipLimit": 10 },
        { "id": "booked", "name": "Booked", "wipLimit": 5 },
        { "id": "in-progress", "name": "In Progress" },
        { "id": "done", "name": "Done" }
      ],
      "transitions": [
        { "from": "lead", "to": "booked" },
        { "from": "booked", "to": "in-progress" },
        { "from": "in-progress", "to": "done" }
      ]
    }
  ],
  "capabilities": [
    { "blockId": "stripe-checkout", "version": "^0.1.0" },
    { "blockId": "booking-form", "version": "^0.1.0" }
  ]
}
```

### Circuit Fields

- **`kits`** (array of CircuitKitRef): Kits this Circuit includes
  - `kitId` (Identifier, required): Kit identifier
  - `version` (string, required): Version constraint

- **`boards`** (array of BoardTemplate, default empty): Kanban board templates
  - `id` (Identifier, required): Board identifier
  - `name` (string, required): Board name
  - `description` (string, optional): Board description
  - `columns` (array of Column, required, min 1): Board columns
    - `id` (Identifier, required): Column identifier
    - `name` (string, required): Column name
    - `wipLimit` (number, optional): Work in progress limit
  - `transitions` (array of Transition, default empty): Allowed column transitions
    - `from` (Identifier, required): Source column
    - `to` (Identifier, required): Target column

**Validation:** Every transition must reference real columns.

- **`capabilities`** (array of CircuitCapabilityRef, default empty): Capability Blocks the trade needs
  - `blockId` (Identifier, required): Block identifier
  - `version` (string, required): Version constraint
  - `required` (boolean, default true): Whether this capability is required
  - `config` (object, optional): Block-specific configuration

---

## Logbook = Shared Audit Trail

The Logbook is a hash-chained sequence of events that records all changes across the BLKC ecosystem.

### Entry Schema

```json
{
  "id": "abc123def456",
  "timestamp": "2026-11-02T12:00:00.000Z",
  "actor": {
    "name": "Austin",
    "email": "austin@example.com",
    "role": "owner"
  },
  "event": "site.publish",
  "subject": {
    "type": "site",
    "id": "my-site-123",
    "tenant": "acme-corp"
  },
  "data": {
    "revisionId": "rev-abc123",
    "contentHash": "sha256:abc123..."
  },
  "prevHash": "sha256:def456...",
  "hash": "sha256:ghi789...",
  "signature": "...",
  "proof": {
    "workUnits": 5,
    "stateId": "state-123"
  }
}
```

### Entry Fields

- **`id`** (Identifier, auto-generated): Unique entry identifier
- **`timestamp`** (string, ISO 8601): When the event occurred
- **`actor`** (object, required): Who performed the action
  - `name` (string, required): Actor name
  - `email` (string, optional): Actor email
  - `role` (string, optional): Actor role
- **`event`** (string, required): Event type
- **`subject`** (LogbookSubject, optional): What the event is about
  - `type` (enum: `"block"` | `"kit"` | `"circuit"` | `"site"` | `"page"` | `"board"` | `"card"` | `"mcp"`)
  - `id` (string, required): Subject identifier
  - `tenant` (string, optional): Tenant identifier for multi-tenant systems
- **`data`** (object, default empty): Event-specific data (not the content itself, just references)
- **`prevHash`** (string, optional): Hash of previous entry
- **`hash`** (string, optional): Hash of this entry
- **`signature`** (string, optional): Digital signature for non-repudiation
- **`proof`** (object, optional): Proof data for marketplace/ai work
  - `workUnits` (number, optional): Amount of work performed
  - `stateId` (string, optional): State identifier

### Event Namespaces

| Event | Subject | Data | Notes |
|-------|---------|------|-------|
| `site.revision` | `site` or `page` | `{ revisionId, contentHash }` | Revision created |
| `site.publish` | `site` | `{ revisionId, contentHash }` | Site published |
| `board.transition` | `card` | `{ from, to }` | Card moved between columns |
| `mcp.write` | `mcp` | `{ tool, target }` | MCP tool execution | Never includes secrets |
| `market.proof` | `block`, `kit`, or `circuit` | Uses `proof.workUnits`, `proof.stateId` | Marketplace work proof |
| `block.publish` | `block` | `{ version }` | Block published to registry |
| `kit.publish` | `kit` | `{ version }` | Kit published to registry |
| `circuit.publish` | `circuit` | `{ version }` | Circuit published to registry |

### Chain Integrity

- Each entry's `hash` is computed from the entry data **excluding** `hash`, `prevHash`, and `signature`
- The `prevHash` field points to the previous entry's `hash`
- This creates a **tamper-evident chain**: changing any entry invalidates all subsequent hashes
- **Multi-tenant:** Keep one chain per tenant when `subject.tenant` is set

### Verification

The Logbook can be verified by:
1. Recomputing each entry's hash and comparing with stored hash
2. Verifying each `prevHash` matches the previous entry's `hash`
3. Checking digital signatures (if present)

---

## Renderers

Renderers are platform-specific packages that render UI Blocks:

| Target | Package | Status |
|--------|---------|--------|
| Web | `@blkc-code/render-web` | In development |
| Native | `@blkc-code/render-native` | Planned |
| TV | `@blkc-code/render-tv` | Planned |

### Web Renderer Requirements

- **Framework agnostic**: Works with React, Next.js, and other frameworks
- **Zero Next.js dependencies**: Consumers choose their framework
- **Server and client components**: Support both rendering models
- **Static HTML export**: Must support `renderToHTML()` for static site generation
- **CSS-in-JS or utility classes**: Flexible styling approach
- **Accessibility**: WCAG 2.1 AA compliant
- **Performance**: Bundle size < 50KB gzipped

---

## Registries

BLKC maintains registries of Blocks, Kits, and Circuits:

### Block Registry

```json
{
  "updatedAt": "2026-11-02T12:00:00.000Z",
  "blocks": [
    { "kind": "ui", "id": "hero", "name": "Hero", ... },
    { "kind": "capability", "id": "stripe-checkout", "name": "Stripe Checkout", ... }
  ]
}
```

### Kit Registry

```json
{
  "updatedAt": "2026-11-02T12:00:00.000Z",
  "kits": [
    { "id": "bakery-site", "name": "Bakery Site", ... },
    { "id": "portfolio", "name": "Portfolio", ... }
  ]
}
```

### Circuit Registry

```json
{
  "updatedAt": "2026-11-02T12:00:00.000Z",
  "circuits": [
    { "id": "local-service-business", "name": "Local Service Business", ... }
  ]
}
```

---

## File Format

All BLKC manifests are JSON files with the following conventions:

- **Encoding**: UTF-8
- **Line endings**: LF (Unix-style)
- **Indentation**: 2 spaces
- **File extension**: `.json` (or `.jsonc` for comments during development)

### Example File Structure

```
blocks/
  hero/
    manifest.json          # Block manifest
    props.ts               # Zod props schema (source)
    index.tsx              # Renderer component
    README.md              # Documentation
kits/
  bakery-site/
    manifest.json          # Kit manifest
    theme.json             # Theme definition
    pages/                 # Optional: page templates
      home.json
circuits/
  local-service/
    manifest.json          # Circuit manifest
```

---

## Validation

All manifests must:
1. Parse against their respective schemas
2. Follow the compatibility rules
3. Pass validation tests in `packages/core/src/__tests__/`

### Running Validation

```bash
# Validate a single manifest
npm run validate -- blocks/hero/manifest.json

# Validate all manifests in a directory
npm run validate -- blocks/**/manifest.json
```

---

## Versioning

BLKC follows [Semantic Versioning](https://semver.org/):

- **PATCH**: Backward-compatible bug fixes
- **MINOR**: Backward-compatible new features  
- **MAJOR**: Breaking changes

### Version Constraints

- Use **caret ranges** (`^0.1.0`) for dependencies that can accept minor updates
- Use **exact versions** (`0.1.0`) for dependencies that must match exactly
- Use **range expressions** (`>=0.1.0 <0.2.0`) for more complex constraints

---

## Open Questions & Future Work

### v2 Open Items

1. **Instance validation**: Should Kit content block instances be validated against their Block's props schema? This needs the registry, so it belongs in `blkc kit publish` CLI.
2. **Theme validation**: Should we validate theme.json files against a stricter schema?
3. **Rendering validation**: Should we validate that every UI Block has a corresponding renderer?

### v3 Roadmap

- **Breaking changes**: Any changes that would break v1 or v2 manifests
- **New Block kinds**: Additional block types beyond ui/capability
- **Enhanced type safety**: Stronger typing for props and controls
- **Performance optimizations**: Faster validation and rendering
- **Internationalization**: Support for localized content

---

## References

- [BCM Suite Plan](../../../docs/BCM_SUITE_PLAN.md) - Overall product strategy
- [BCM Suite Architecture](../../../_bmad-output/planning-artifacts/bcm-suite-architecture.md) - Technical architecture
- [BLKC v1 Documentation](https://github.com/black-code-market/BLKC-MVP) - Original BLKC repo
- [WordPress theme.json](https://developer.wordpress.org/themes/block/themes/theme-json/) - Theme format reference
