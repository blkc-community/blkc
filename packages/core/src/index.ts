/**
 * BLKC Core - Zod schemas and TypeScript types for BLKC domain objects.
 * 
 * This package provides the foundational schemas for Blocks, Kits, Circuits, and Logbook.
 * These schemas are used throughout the BLKC ecosystem for validation and type safety.
 * 
 * @package @blkc-code/core
 * @version 0.1.0
 * @license Apache-2.0
 * @author Black Code Enterprises LLC
 */

import { createHash } from "crypto";
import { z } from "zod";

// ============================================================================
// Shared Types and Utilities
// ============================================================================

/**
 * Default license for Blocks. Content (Blocks, Kits, Circuits) is MIT, matching the
 * blkc-community/blocks, kits and circuits repos. The framework packages are Apache-2.0.
 */
export const DEFAULT_LICENSE = "MIT" as const;

/**
 * Default hash algorithm for content hashing.
 */
export const DEFAULT_ALGORITHM = "sha256" as const;

// ---------------------------------------------------------------------------
// Identifier
// ---------------------------------------------------------------------------

/**
 * Valid identifier: lowercase alphanumeric with hyphens, 3-64 characters.
 */
export const IdentifierSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9\-]+$/, "ID must be lowercase, alphanumeric, or hyphenated");

export type Identifier = z.infer<typeof IdentifierSchema>;

// ---------------------------------------------------------------------------
// Manifest Version
// ---------------------------------------------------------------------------

/**
 * Manifest version: 1 (original) or 2 (current with Block kinds, Kit themes, Circuit boards).
 * Defaults to 1 for backward compatibility.
 */
export const ManifestVersionSchema = z.union([z.literal(1), z.literal(2)]).default(1);
export type ManifestVersion = z.infer<typeof ManifestVersionSchema>;

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Compute a cryptographic hash of a value.
 */
export const computeContentHash = (value: unknown, algorithm: string = DEFAULT_ALGORITHM) => {
  const json = typeof value === "string" ? value : JSON.stringify(value);
  return createHash(algorithm).update(json).digest("hex");
};

/**
 * Generate a random identifier using cryptographic hash.
 */
export const cryptoRandomId = () =>
  createHash("sha256")
    .update(`${Date.now()}-${Math.random()}-${process.pid}`)
    .digest("hex")
    .slice(0, 12);

/**
 * Get current timestamp in ISO 8601 format.
 */
export const nowISO = () => new Date().toISOString();

/**
 * Add hash and prevHash to an entry, computing the hash from its contents.
 */
export const withHash = <T extends Record<string, unknown>>(
  payload: T,
  prevHash: string | undefined,
  algorithm: string = DEFAULT_ALGORITHM
): T & { prevHash: string | undefined; hash: string } => {
  const canonical = { ...payload, prevHash };
  const hash = computeContentHash(canonical, algorithm);
  return { ...payload, prevHash, hash };
};

/**
 * Safe parse that throws a descriptive error on failure.
 */
export const safeParse = <T,>(schema: z.ZodType<T>, data: unknown): T => {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  return parsed.data;
};

// ============================================================================
// Person
// ============================================================================

export const PersonSchema = z.object({
  name: z.string(),
  email: z.string().email().optional(),
  github: z.string().optional(),
  role: z.string().optional(),
});

export type Person = z.infer<typeof PersonSchema>;

// ============================================================================
// Usage Metrics
// ============================================================================

export const UsageMetricSchema = z.object({
  name: z.string(),
  unit: z.string(),
  description: z.string().optional(),
});

export type UsageMetric = z.infer<typeof UsageMetricSchema>;

// ============================================================================
// Changelog Entry
// ============================================================================

export const ChangelogEntrySchema = z.object({
  version: z.string(),
  date: z.string(),
  summary: z.string(),
});

export type ChangelogEntry = z.infer<typeof ChangelogEntrySchema>;

// ============================================================================
// Block Capability
// ============================================================================

export const BlockCapabilitySchema = z.object({
  id: IdentifierSchema,
  description: z.string(),
});

export type BlockCapability = z.infer<typeof BlockCapabilitySchema>;

// ============================================================================
// Blocks
// ============================================================================

/**
 * Block kind: UI blocks are page sections, capability blocks are backend modules.
 */
export const BlockKindSchema = z.enum(["ui", "capability"]);
export type BlockKind = z.infer<typeof BlockKindSchema>;

/**
 * Fields shared by both UI and Capability Blocks.
 */
const blockBaseShape = {
  manifestVersion: ManifestVersionSchema,
  id: IdentifierSchema,
  name: z.string(),
  summary: z.string(),
  description: z.string(),
  version: z.string(),
  tags: z.array(z.string()).default([]),
  license: z.string().default(DEFAULT_LICENSE),
  authors: z.array(PersonSchema).default([]),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),
  docs: z.string().url().optional(),
  metrics: z.array(UsageMetricSchema).default([]),
  visibility: z.enum(["public", "private"]).default("public"),
  changelog: z.array(ChangelogEntrySchema).default([]),
};

// ---------------------------------------------------------------------------
// Capability Block
// ---------------------------------------------------------------------------

/**
 * A backend module: AI/data processing, forms, Stripe checkout, booking, etc.
 * This is the v1 Block shape.
 */
export const CapabilityBlockSchema = z.object({
  ...blockBaseShape,
  kind: z.literal("capability"),
  entryPoint: z.string(),
  runtime: z.enum(["bun", "node", "python", "docker"]).default("bun"),
  sizeMB: z.number().nonnegative().max(100).optional(),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  capabilities: z.array(BlockCapabilitySchema).default([]),
});

export type CapabilityBlockManifest = z.infer<typeof CapabilityBlockSchema>;

// ---------------------------------------------------------------------------
// UI Block
// ---------------------------------------------------------------------------

/**
 * JSON Schema for a UI Block's props. Authors write the props as a zod schema in the
 * Block package and emit this with `z.toJSONSchema()`.
 */
export const PropsJsonSchema = z.object({
  $schema: z.string().optional(),
  type: z.literal("object"),
  properties: z.record(z.string(), z.any()),
  required: z.array(z.string()).optional(),
  additionalProperties: z.union([z.boolean(), z.record(z.string(), z.any())]).optional(),
});

export type PropsJson = z.infer<typeof PropsJsonSchema>;

// Control types for editor UI
export const ControlTypeSchema = z.enum([
  "text",
  "textarea",
  "richtext",
  "url",
  "number",
  "range",
  "toggle",
  "select",
  "color",
  "image",
  "link",
  "repeater",
]);

export type ControlType = z.infer<typeof ControlTypeSchema>;

const controlShape = {
  /** Prop name (or dot path, e.g. `cta.label`) this control edits. */
  prop: z.string().min(1),
  control: ControlTypeSchema,
  label: z.string(),
  help: z.string().optional(),
  /** Editor sidebar panel, like WordPress's content / style / settings split. */
  group: z.enum(["content", "style", "settings"]).default("content"),
  options: z.array(z.object({ label: z.string(), value: z.union([z.string(), z.number()]) })).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  placeholder: z.string().optional(),
};

const LeafControlSchema = z.object({
  ...controlShape,
  control: ControlTypeSchema.exclude(["repeater"]),
});

/**
 * Editor control for one prop. A `repeater` edits an array prop; its `fields` are
 * relative to each item.
 */
export const ControlSchema = z
  .object({
    ...controlShape,
    fields: z.array(LeafControlSchema).optional(),
  })
  .superRefine((control, ctx) => {
    if (control.control === "select" && !control.options?.length) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "select controls need options" });
    }
    if (control.control === "repeater" && !control.fields?.length) {
      ctx.addIssue({ code: "custom", path: ["fields"], message: "repeater controls need fields" });
    }
  });

export type Control = z.infer<typeof ControlSchema>;

/**
 * Optional design-tool support, mirroring block.json `supports`.
 * When a Block supports one of these, the editor offers the matching Kit theme presets.
 */
export const BlockSupportsSchema = z.object({
  align: z.array(z.enum(["left", "center", "right", "wide", "full"])).optional(),
  color: z.object({ text: z.boolean().optional(), background: z.boolean().optional() }).optional(),
  spacing: z.object({ padding: z.boolean().optional(), margin: z.boolean().optional() }).optional(),
  typography: z.object({ fontSize: z.boolean().optional(), fontFamily: z.boolean().optional() }).optional(),
});

export type BlockSupports = z.infer<typeof BlockSupportsSchema>;

/**
 * Points at the component that renders a UI Block on one platform.
 */
export const RendererRefSchema = z.object({
  package: z.string().min(1),
  export: z.string().min(1),
  version: z.string().optional(),
});

export type RendererRef = z.infer<typeof RendererRefSchema>;

export const RendererTargetSchema = z.enum(["web", "native", "tv"]);
export type RendererTarget = z.infer<typeof RendererTargetSchema>;

export const RenderersSchema = z
  .object({
    web: RendererRefSchema.optional(),
    native: RendererRefSchema.optional(),
    tv: RendererRefSchema.optional(),
  })
  .refine((value) => Boolean(value.web || value.native || value.tv), {
    message: "UI Blocks need at least one renderer (web first)",
  });

export type Renderers = z.infer<typeof RenderersSchema>;

/**
 * A page section (hero, pricing, gallery...): props schema + editor controls + renderer reference.
 */
export const UiBlockSchema = z
  .object({
    ...blockBaseShape,
    kind: z.literal("ui"),
    /** Inserter category, e.g. `hero`, `content`, `commerce`. */
    category: z.string().optional(),
    props: PropsJsonSchema,
    controls: z.array(ControlSchema).default([]),
    supports: BlockSupportsSchema.optional(),
    renderers: RenderersSchema,
    /** Sample props for previews and docs. */
    example: z.record(z.string(), z.any()).optional(),
  })
  .superRefine((block, ctx) => {
    const known = new Set(Object.keys(block.props.properties));
    block.controls.forEach((control, index) => {
      const root = control.prop.split(".")[0];
      if (!known.has(root)) {
        ctx.addIssue({
          code: "custom",
          path: ["controls", index, "prop"],
          message: `Control prop "${control.prop}" is not defined in props.properties`,
        });
      }
    });

    if (block.example) {
      (block.props.required ?? []).forEach((key) => {
        if (!(key in block.example!)) {
          ctx.addIssue({
            code: "custom",
            path: ["example", key],
            message: `Example is missing required prop "${key}"`,
          });
        }
      });
    }
  });

export type UiBlockManifest = z.infer<typeof UiBlockSchema>;

/**
 * Any Block. Manifests without `kind` are v1 capability Blocks, so `kind` defaults to
 * `capability` before the discriminated union runs.
 */
export const BlockSchema = z.union([UiBlockSchema, CapabilityBlockSchema]);

export type BlockManifest = z.infer<typeof BlockSchema>;

/** Type guards for Block kinds */
export const isUiBlock = (block: BlockManifest): block is UiBlockManifest => block.kind === "ui";
export const isCapabilityBlock = (block: BlockManifest): block is CapabilityBlockManifest =>
  block.kind === "capability";

// ============================================================================
// Kits
// ============================================================================

export const KitBlockRefSchema = z.object({
  blockId: IdentifierSchema,
  version: z.string(),
  alias: z.string().optional(),
  required: z.boolean().default(true),
  config: z.record(z.string(), z.any()).optional(),
});

export type KitBlockRef = z.infer<typeof KitBlockRefSchema>;

const presetShape = { slug: IdentifierSchema, name: z.string() };

/**
 * A subset of WordPress theme.json (v3). Unknown keys are kept, so a real theme.json
 * can be dropped in; renderers read the presets listed here.
 */
export const ThemeSchema = z.object({
  $schema: z.string().optional(),
  version: z.number().int().positive().default(3),
  settings: z
    .object({
      color: z
        .object({
          palette: z.array(z.object({ ...presetShape, color: z.string() })).optional(),
          gradients: z.array(z.object({ ...presetShape, gradient: z.string() })).optional(),
        })
        .optional(),
      typography: z
        .object({
          fontFamilies: z.array(z.object({ ...presetShape, fontFamily: z.string() })).optional(),
          fontSizes: z.array(z.object({ ...presetShape, size: z.string() })).optional(),
        })
        .optional(),
      spacing: z
        .object({
          spacingSizes: z.array(z.object({ ...presetShape, size: z.string() })).optional(),
          units: z.array(z.string()).optional(),
        })
        .optional(),
      layout: z
        .object({ contentSize: z.string().optional(), wideSize: z.string().optional() })
        .optional(),
    })
    .optional(),
  styles: z.record(z.string(), z.any()).optional(),
});

export type Theme = z.infer<typeof ThemeSchema>;

/** One placed UI Block on a page. `block` is a Kit block ref's alias or blockId. */
export const BlockInstanceSchema = z.object({
  block: z.string(),
  props: z.record(z.string(), z.any()).default({}),
});

export type BlockInstance = z.infer<typeof BlockInstanceSchema>;

export const KitPageSchema = z.object({
  slug: z.string().regex(/^[a-z0-9\-\/]*$/, "Page slug must be a lowercase path"),
  title: z.string(),
  blocks: z.array(BlockInstanceSchema).default([]),
});

export type KitPage = z.infer<typeof KitPageSchema>;

export const KitContentSchema = z.object({
  pages: z.array(KitPageSchema).default([]),
});

export type KitContent = z.infer<typeof KitContentSchema>;

/**
 * A template: blocks + optional theme (theme.json shape) + optional default content.
 */
export const KitSchema = z
  .object({
    manifestVersion: ManifestVersionSchema,
    id: IdentifierSchema,
    name: z.string(),
    summary: z.string(),
    description: z.string(),
    version: z.string(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    license: z.string().default(DEFAULT_LICENSE),
    blocks: z.array(KitBlockRefSchema),
    theme: ThemeSchema.optional(),
    content: KitContentSchema.optional(),
    maintainers: z.array(PersonSchema).default([]),
    documentation: z.string().url().optional(),
    repository: z.string().url().optional(),
    pricing: z
      .object({
        model: z.enum(["free", "one-time", "subscription", "usage"]),
        amount: z.number().nonnegative().optional(),
        currency: z.string().default("USD"),
      })
      .optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    visibility: z.enum(["public", "private"]).default("public"),
  })
  .superRefine((kit, ctx) => {
    if (!kit.content) return;
    const refs = new Set(kit.blocks.flatMap((ref) => [ref.blockId, ref.alias].filter(Boolean)));
    kit.content.pages.forEach((page, pageIndex) => {
      page.blocks.forEach((instance, blockIndex) => {
        if (!refs.has(instance.block)) {
          ctx.addIssue({
            code: "custom",
            path: ["content", "pages", pageIndex, "blocks", blockIndex, "block"],
            message: `Block "${instance.block}" is not listed in the Kit's blocks`,
          });
        }
      });
    });
  });

export type KitManifest = z.infer<typeof KitSchema>;

// ============================================================================
// Circuits
// ============================================================================

export const CircuitKitRefSchema = z.object({
  kitId: IdentifierSchema,
  version: z.string(),
});

export type CircuitKitRef = z.infer<typeof CircuitKitRefSchema>;

/** A Kanban board template. Transitions mirror the board's `transition()` rules; empty = any move allowed. */
export const BoardTemplateSchema = z
  .object({
    id: IdentifierSchema,
    name: z.string(),
    description: z.string().optional(),
    columns: z
      .array(
        z.object({
          id: IdentifierSchema,
          name: z.string(),
          wipLimit: z.number().int().positive().optional(),
        })
      )
      .min(1),
    transitions: z.array(z.object({ from: IdentifierSchema, to: IdentifierSchema })).default([]),
  })
  .superRefine((board, ctx) => {
    const columns = new Set(board.columns.map((column) => column.id));
    board.transitions.forEach((transition, index) => {
      (["from", "to"] as const).forEach((end) => {
        if (!columns.has(transition[end])) {
          ctx.addIssue({
            code: "custom",
            path: ["transitions", index, end],
            message: `Unknown column "${transition[end]}"`,
          });
        }
      });
    });
  });

export type BoardTemplate = z.infer<typeof BoardTemplateSchema>;

export const CircuitCapabilityRefSchema = z.object({
  blockId: IdentifierSchema,
  version: z.string(),
  required: z.boolean().default(true),
  config: z.record(z.string(), z.any()).optional(),
});

export type CircuitCapabilityRef = z.infer<typeof CircuitCapabilityRefSchema>;

/** A trade bundle: Kits + board templates + capability Blocks. */
export const CircuitSchema = z.object({
  manifestVersion: ManifestVersionSchema,
  id: IdentifierSchema,
  name: z.string(),
  summary: z.string(),
  description: z.string(),
  version: z.string(),
  verticals: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  license: z.string().default(DEFAULT_LICENSE),
  kits: z.array(CircuitKitRefSchema),
  boards: z.array(BoardTemplateSchema).default([]),
  capabilities: z.array(CircuitCapabilityRefSchema).default([]),
  maintainers: z.array(PersonSchema).default([]),
  repository: z.string().url().optional(),
  status: z.enum(["draft", "released", "deprecated"]).default("draft"),
  launchDate: z.string().optional(),
});

export type CircuitManifest = z.infer<typeof CircuitSchema>;

// ============================================================================
// Usage + Logbook
// ============================================================================

export const UsageReportSchema = z.object({
  blockId: IdentifierSchema.optional(),
  kitId: IdentifierSchema.optional(),
  circuitId: IdentifierSchema.optional(),
  periodStart: z.string(),
  periodEnd: z.string(),
  metrics: z.record(z.string(), z.number()),
  eco: z
    .object({
      carbonKg: z.number().optional(),
      waterLiters: z.number().optional(),
    })
    .optional(),
});

export type UsageReport = z.infer<typeof UsageReportSchema>;

/** What a Logbook entry is about. Optional, so v1 entries (and their hashes) are unchanged. */
export const LogbookSubjectSchema = z.object({
  type: z.enum(["block", "kit", "circuit", "site", "page", "board", "card", "mcp"]),
  id: z.string(),
  tenant: z.string().optional(),
});

export type LogbookSubject = z.infer<typeof LogbookSubjectSchema>;

/** A single Logbook entry: hash-chained and optionally signed. */
export const LogbookEntrySchema = z.object({
  id: IdentifierSchema.default(() => cryptoRandomId()),
  timestamp: z.string(),
  actor: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    role: z.string().optional(),
  }),
  event: z.string(),
  subject: LogbookSubjectSchema.optional(),
  data: z.record(z.string(), z.any()).default({}),
  prevHash: z.string().optional(),
  hash: z.string().optional(),
  signature: z.string().optional(),
  proof: z
    .object({
      workUnits: z.number().optional(),
      stateId: z.string().optional(),
    })
    .optional(),
});

export type LogbookEntry = z.infer<typeof LogbookEntrySchema>;

// ============================================================================
// Registries
// ============================================================================

export const BlockRegistrySchema = z.object({
  updatedAt: z.string(),
  blocks: z.array(BlockSchema),
});

export type BlockRegistry = z.infer<typeof BlockRegistrySchema>;

export const KitRegistrySchema = z.object({
  updatedAt: z.string(),
  kits: z.array(KitSchema),
});

export type KitRegistry = z.infer<typeof KitRegistrySchema>;

export const CircuitRegistrySchema = z.object({
  updatedAt: z.string(),
  circuits: z.array(CircuitSchema),
});

export type CircuitRegistry = z.infer<typeof CircuitRegistrySchema>;

export type RegistryBundle = {
  blocks: BlockRegistry;
  kits: KitRegistry;
  circuits: CircuitRegistry;
};
