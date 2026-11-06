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
import { manifestErrorFrom } from "./errors.js";

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

// ============================================================================
// Attributes (D3) — one map, compiled to zod + JSON Schema + TypeScript
// ============================================================================

export const AttributeTypeSchema = z.enum([
  "string", "number", "boolean", "richtext", "link", "image", "color", "list",
]);

export type AttributeType = z.infer<typeof AttributeTypeSchema>;

export const AttributeSchema = z.object({
  type: AttributeTypeSchema,
  required: z.boolean().optional(),
  default: z.any().optional(),
  // constraints
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  enum: z.array(z.any()).optional(),
  // UI
  label: z.string().optional(),
  help: z.string().optional(),
  placeholder: z.string().optional(),
  control: z.string().optional(),
  group: z.enum(["content", "style", "settings"]).optional(),
  // for list type
  items: z.any().optional(),
});

export type Attribute = z.infer<typeof AttributeSchema>;

export type AttributesMap = Record<string, Attribute>;

/**
 * Compile an attributes map (D3) into a zod schema and a JSON Schema object.
 * The TypeScript type is inferred from the zod schema via z.infer.
 */
export function compileAttributes(attributes: AttributesMap): {
  zodSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
  jsonSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
} {
  const properties: Record<string, z.ZodTypeAny> = {};
  const required: string[] = [];
  const jsonProperties: Record<string, unknown> = {};

  for (const [name, attr] of Object.entries(attributes)) {
    let zodType: z.ZodTypeAny;
    let jsonType: Record<string, unknown>;

    switch (attr.type) {
      case "richtext":
        // Q1: TipTap JSON. An HTML string is accepted too; renderers sanitise both.
        zodType = z.union([z.string(), z.looseObject({ type: z.string() })]);
        jsonType = { anyOf: [{ type: "string" }, { type: "object", required: ["type"] }] };
        break;
      case "string":
      case "color":
        zodType = z.string();
        if (attr["minLength"] !== undefined) zodType = (zodType as z.ZodString).min(attr["minLength"]);
        if (attr["maxLength"] !== undefined) zodType = (zodType as z.ZodString).max(attr["maxLength"]);
        if (attr["enum"]) zodType = z.enum(attr["enum"] as [string, ...string[]]);
        jsonType = { type: "string" };
        if (attr["minLength"] !== undefined) jsonType["minLength"] = attr["minLength"];
        if (attr["maxLength"] !== undefined) jsonType["maxLength"] = attr["maxLength"];
        if (attr["enum"]) jsonType["enum"] = attr["enum"];
        break;
      case "number":
        zodType = z.number();
        if (attr["min"] !== undefined) zodType = (zodType as z.ZodNumber).min(attr["min"]);
        if (attr["max"] !== undefined) zodType = (zodType as z.ZodNumber).max(attr["max"]);
        jsonType = { type: "number" };
        if (attr["min"] !== undefined) jsonType["minimum"] = attr["min"];
        if (attr["max"] !== undefined) jsonType["maximum"] = attr["max"];
        break;
      case "boolean":
        zodType = z.boolean();
        jsonType = { type: "boolean" };
        break;
      case "link":
        zodType = z.object({ label: z.string(), href: z.string() });
        jsonType = { type: "object", properties: { label: { type: "string" }, href: { type: "string" } }, required: ["label", "href"] };
        break;
      case "image":
        zodType = z.object({ src: z.string(), alt: z.string() });
        jsonType = { type: "object", properties: { src: { type: "string" }, alt: { type: "string" } }, required: ["src", "alt"] };
        break;
      case "list":
        zodType = z.array(z.any());
        jsonType = { type: "array" };
        break;
      default:
        zodType = z.any();
        jsonType = {};
    }

    if (attr["default"] !== undefined) zodType = zodType.default(attr["default"]);
    if (!attr["required"]) zodType = zodType.optional();

    properties[name] = zodType;
    jsonProperties[name] = jsonType;

    if (attr["required"]) required.push(name);
  }

  const zodSchema = z.object(properties);
  const jsonSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] } = {
    type: "object",
    properties: jsonProperties,
  };
  if (required.length > 0) jsonSchema.required = required;

  return { zodSchema, jsonSchema };
}

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
export const CapabilityPermissionsSchema = z.object({
  network: z.boolean().default(false),
  secrets: z.array(z.string()).default([]),
});

export type CapabilityPermissions = z.infer<typeof CapabilityPermissionsSchema>;

export const CapabilityBlockSchema = z.object({
  ...blockBaseShape,
  kind: z.literal("capability"),
  entryPoint: z.string(),
  runtime: z.enum(["bun", "node", "python", "docker"]).default("bun"),
  sizeMB: z.number().nonnegative().max(100).optional(),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  capabilities: z.array(BlockCapabilitySchema).default([]),
  // D5: typed contract as MCP tool (input/output in attribute format, §3).
  input: z.record(z.string(), z.any()).default({}),
  output: z.record(z.string(), z.any()).default({}),
  permissions: CapabilityPermissionsSchema.default({ network: false, secrets: [] }),
  // Reserved (format only, not implemented): runtime placement for AI/gamification.
  placement: z.enum(["server", "browser"]).default("server"),
  models: z.array(z.object({ id: z.string(), source: z.string().optional(), license: z.string().optional() })).default([]),
  assets: z.array(z.string()).default([]),
  game: z.object({
    xpCost: z.number().optional(),
    unlockCondition: z.string().optional(),
    icon: z.string().optional(),
    visualization: z.string().optional(),
  }).optional(),
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

// "canvas" is reserved for gamification/pixel rendering (Pixel Office Kit and friends).
// It is declared here so the format is stable; no renderer implements it yet.
export const RendererTargetSchema = z.enum(["web", "native", "tv", "canvas"]);
export type RendererTarget = z.infer<typeof RendererTargetSchema>;

export const RenderersSchema = z
  .object({
    web: RendererRefSchema.optional(),
    native: RendererRefSchema.optional(),
    tv: RendererRefSchema.optional(),
    canvas: RendererRefSchema.optional(),
  })
  .refine((value) => Boolean(value.web || value.native || value.tv || value.canvas), {
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
    /** D3: the one map authors write. parseAny derives `props` and `controls` from it. */
    attributes: z.record(z.string(), AttributeSchema).optional(),
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

// Preset slugs follow theme.json, where short names such as "md" are normal.
const presetShape = { slug: z.string().regex(/^[a-z0-9-]+$/), name: z.string() };

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
// v2 schemas (manifestVersion: 2 required)
// ============================================================================

/**
 * A UI Block as authors write it (D3, D4): one `attributes` map, with `props` and
 * `controls` derived and `renderers` optional because `render.web.tsx` is found by
 * folder convention.
 */
export const UiBlockAuthoringSchema = z.object({
  ...blockBaseShape,
  $schema: z.string().optional(),
  manifestVersion: z.literal(2),
  kind: z.literal("ui"),
  category: z.string().optional(),
  attributes: z.record(z.string(), AttributeSchema),
  supports: BlockSupportsSchema.optional(),
  renderers: RenderersSchema.optional(),
  example: z.record(z.string(), z.any()).optional(),
});

export const BlockV2Schema = z.union([
  UiBlockAuthoringSchema,
  UiBlockSchema.safeExtend({ manifestVersion: z.literal(2) }),
  CapabilityBlockSchema.extend({ manifestVersion: z.literal(2) }),
]);
export type BlockV2Manifest = z.infer<typeof BlockV2Schema>;

export const KitV2Schema = KitSchema.safeExtend({ manifestVersion: z.literal(2) });
export type KitV2Manifest = z.infer<typeof KitV2Schema>;

export const CircuitV2Schema = CircuitSchema.safeExtend({ manifestVersion: z.literal(2) });
export type CircuitV2Manifest = z.infer<typeof CircuitV2Schema>;

export const ThemeV2Schema = ThemeSchema;

const ProjectPathSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^(?![\\/])(?!.*(^|[\\/])\.\.([\\/]|$)).+$/, "A path inside the project, with no .. and no leading slash");

/**
 * world.json, beside a Kit's kit.json: how a project becomes a world. It's data, so anyone
 * can tailor it to their own stack without writing code.
 */
export const WorldConfigSchema = z
  .object({
    $schema: z.string().optional(),
    /** Which skin to draw. Falls back to the office if it isn't installed. */
    skin: IdentifierSchema.optional(),
    applications: z
      .object({
        /** File names that mark a folder as an application, such as "go.mod" or "*.xydsf". */
        markers: z.array(z.string().min(1).max(100).regex(/^[^\\/]+$/, "A file name, not a path")).max(50).default([]),
        /** Use only these markers, not the built-in ones as well. */
        replaceDefaults: z.boolean().default(false),
      })
      .strict()
      .optional(),
    /** Folders that get a building even with no marker, such as "docs". */
    include: z.array(ProjectPathSchema).max(50).optional(),
    /** Folders that never get a building. A folder name, or a path from the top of the project. */
    ignore: z.array(ProjectPathSchema).max(100).optional(),
    /** Folders to walk even if gitignored or separate repos, such as "external/". */
    roads: z.array(ProjectPathSchema).max(50).optional(),
    /** File-name patterns for grouping loose files: { "Docs": ["*.md"] }. Added to, or replacing, the built-in groups. */
    fileGroups: z.record(z.string().min(1).max(24), z.array(z.string().min(1).max(100)).max(50)).optional(),
    /** Folder names that become an item in a building: { "Server rack": ["api", "billing/queue"] }. */
    partTypes: z.record(z.string().min(1).max(24), z.array(ProjectPathSchema).max(50)).optional(),
  })
  .strict();

export type WorldConfig = z.infer<typeof WorldConfigSchema>;
export type ThemeV2 = z.infer<typeof ThemeV2Schema>;

export const PageV2Schema = KitPageSchema;
export type PageV2 = z.infer<typeof PageV2Schema>;

export const BoardV2Schema = BoardTemplateSchema;
export type BoardV2 = z.infer<typeof BoardV2Schema>;

// ============================================================================
// parseAny — accept v1 manifests and upgrade them in memory to v2, with warnings
// ============================================================================

export interface ParseAnyResult<T> {
  value: T;
  warnings: string[];
  upgraded: boolean;
}

/** Alias for parseAnyBlock, matching the plan's parseAny() naming. */
export const parseAny = parseAnyBlock;

const DEFAULT_CONTROL: Record<AttributeType, ControlType> = {
  string: "text",
  number: "number",
  boolean: "toggle",
  richtext: "richtext",
  link: "link",
  image: "image",
  color: "color",
  list: "repeater",
};

/** Derive the editor controls an `attributes` map implies (spec section 3). */
function controlsFromAttributes(attributes: AttributesMap): unknown[] {
  return Object.entries(attributes).flatMap(([prop, attr]) => {
    const control = (attr.control as ControlType | undefined) ?? (attr.enum ? "select" : DEFAULT_CONTROL[attr.type]);
    // A list has no item fields to edit until `items` describes them.
    if (control === "repeater") return [];
    return [{
      prop,
      control,
      label: attr.label ?? prop,
      ...(attr.help ? { help: attr.help } : {}),
      ...(attr.group ? { group: attr.group } : {}),
      ...(attr.placeholder ? { placeholder: attr.placeholder } : {}),
      ...(attr.min !== undefined ? { min: attr.min } : {}),
      ...(attr.max !== undefined ? { max: attr.max } : {}),
      ...(attr.enum ? { options: attr.enum.map((value) => ({ label: String(value), value })) } : {}),
    }];
  });
}

export function parseAnyBlock(input: unknown): ParseAnyResult<BlockManifest> {
  const warnings: string[] = [];
  let upgraded = false;
  const raw = (input && typeof input === "object" ? { ...(input as Record<string, unknown>) } : {}) as Record<string, unknown>;

  if (raw["manifestVersion"] === undefined) {
    raw["manifestVersion"] = 2;
    warnings.push("manifestVersion missing; upgraded to 2");
    upgraded = true;
  }
  if (raw["manifestVersion"] === 1) {
    raw["manifestVersion"] = 2;
    warnings.push("manifestVersion 1 upgraded to 2");
    upgraded = true;
  }
  if (raw["kind"] === undefined) {
    raw["kind"] = "capability";
    warnings.push("kind missing; treated as capability Block (v1 shape)");
    upgraded = true;
  }

  if (raw["kind"] === "ui" && raw["attributes"] !== undefined) {
    const attributes = z.record(z.string(), AttributeSchema).safeParse(raw["attributes"]);
    if (!attributes.success) {
      throw manifestErrorFrom(attributes.error.issues.map((i) => ({ ...i, path: ["attributes", ...i.path] })));
    }
    if (raw["props"] !== undefined) warnings.push("both attributes and props declared; attributes wins");
    raw["props"] = compileAttributes(attributes.data).jsonSchema;
    if (raw["controls"] === undefined) raw["controls"] = controlsFromAttributes(attributes.data);
    // D4: render.web.tsx is found by folder convention, so renderers is optional.
    if (raw["renderers"] === undefined) {
      raw["renderers"] = { web: { package: "./render.web.tsx", export: "default" } };
    }
  }

  // Parse the matching member directly: a union reports only "Invalid input".
  const result = raw["kind"] === "ui" ? UiBlockSchema.safeParse(raw) : CapabilityBlockSchema.safeParse(raw);
  if (!result.success) throw manifestErrorFrom(result.error.issues);
  return { value: result.data, warnings, upgraded };
}

export function parseAnyKit(input: unknown): ParseAnyResult<KitManifest> {
  const warnings: string[] = [];
  let upgraded = false;
  const raw = (input && typeof input === "object" ? { ...(input as Record<string, unknown>) } : {}) as Record<string, unknown>;

  if (raw["manifestVersion"] === undefined) {
    raw["manifestVersion"] = 2;
    warnings.push("manifestVersion missing; upgraded to 2");
    upgraded = true;
  }
  if (raw["manifestVersion"] === 1) {
    raw["manifestVersion"] = 2;
    warnings.push("manifestVersion 1 upgraded to 2");
    upgraded = true;
  }

  const result = KitSchema.safeParse(raw);
  if (!result.success) throw manifestErrorFrom(result.error.issues);
  return { value: result.data, warnings, upgraded };
}

export function parseAnyCircuit(input: unknown): ParseAnyResult<CircuitManifest> {
  const warnings: string[] = [];
  let upgraded = false;
  const raw = (input && typeof input === "object" ? { ...(input as Record<string, unknown>) } : {}) as Record<string, unknown>;

  if (raw["manifestVersion"] === undefined) {
    raw["manifestVersion"] = 2;
    warnings.push("manifestVersion missing; upgraded to 2");
    upgraded = true;
  }
  if (raw["manifestVersion"] === 1) {
    raw["manifestVersion"] = 2;
    warnings.push("manifestVersion 1 upgraded to 2");
    upgraded = true;
  }

  const result = CircuitSchema.safeParse(raw);
  if (!result.success) throw manifestErrorFrom(result.error.issues);
  return { value: result.data, warnings, upgraded };
}
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

// ============================================================================
// Deploy schema (shared with Story 10.2, BCM API)
// ============================================================================

export const DeployEnvironmentSchema = z.enum(["development", "staging", "production"]);
export type DeployEnvironment = z.infer<typeof DeployEnvironmentSchema>;

export const DeployRequestSchema = z.object({
  projectId: z.string().min(1),
  siteId: z.string().min(1),
  environment: DeployEnvironmentSchema.default("development"),
  message: z.string().optional(),
});

export type DeployRequest = z.infer<typeof DeployRequestSchema>;

export const DeployResponseSchema = z.object({
  deployId: z.string().min(1),
  status: z.enum(["queued", "building", "deployed", "failed"]),
  url: z.string().url().optional(),
});

export type DeployResponse = z.infer<typeof DeployResponseSchema>;

// ============================================================================
// Re-exports: errors
// ============================================================================

export * from "./errors.js";
