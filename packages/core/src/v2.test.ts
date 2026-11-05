/**
 * BLKC Core - v2 Specification Tests
 *
 * Each describe names the spec section it covers (per Step 1 acceptance criteria).
 */

import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import {
  AttributeSchema,
  AttributeTypeSchema,
  compileAttributes,
  parseAny,
  ManifestError,
  parseAnyBlock,
  parseAnyKit,
  parseAnyCircuit,
  BlockV2Schema,
  KitV2Schema,
  CircuitV2Schema,
  ThemeV2Schema,
  PageV2Schema,
  BoardV2Schema,
  RendererTargetSchema,
  CapabilityBlockSchema,
  DeployRequestSchema,
  DeployResponseSchema,
  BLKC_ERROR_CODES,
  findErrorCode,
  errorCodeDocsUrl,
  ManifestVersionSchema,
} from "./index";

const ajv = new Ajv({ allErrors: true });

// ============================================================================
// §3 attributes
// ============================================================================

describe("§3 attributes", () => {
  it("compiles an attributes map to zod and JSON Schema", () => {
    const attrs = {
      heading: { type: "string" as const, required: true, maxLength: 120 },
      count: { type: "number" as const, min: 0, max: 10 },
      enabled: { type: "boolean" as const, default: false },
      cta: { type: "link" as const },
    };

    const { zodSchema, jsonSchema } = compileAttributes(attrs);

    const sample = { heading: "Hello", count: 3, enabled: true, cta: { label: "Go", href: "/go" } };

    // zod validates
    const zodResult = zodSchema.safeParse(sample);
    expect(zodResult.success).toBe(true);

    // JSON Schema validates the same input (ajv)
    const validate = ajv.compile(jsonSchema);
    expect(validate(sample)).toBe(true);
  });

  it("rejects invalid input in both zod and JSON Schema", () => {
    const attrs = {
      heading: { type: "string" as const, required: true, maxLength: 5 },
    };
    const { zodSchema, jsonSchema } = compileAttributes(attrs);
    const bad = { heading: "too long heading" };

    expect(zodSchema.safeParse(bad).success).toBe(false);
    const validate = ajv.compile(jsonSchema);
    expect(validate(bad)).toBe(false);
  });

  it("AttributeTypeSchema lists the eight built-in types", () => {
    const types = AttributeTypeSchema.options;
    expect(types).toEqual(["string", "number", "boolean", "richtext", "link", "image", "color", "list"]);
  });

  it("AttributeSchema parses a valid attribute", () => {
    const result = AttributeSchema.safeParse({ type: "string", required: true, maxLength: 10 });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// §10 parseAny (v1 -> v2 upgrade)
// ============================================================================

describe("§10 parseAny", () => {
  it("upgrades a v1 capability Block (no kind, no manifestVersion)", () => {
    const v1 = {
      id: "my-cap",
      name: "My Capability",
      summary: "s",
      description: "d",
      version: "0.1.0",
      entryPoint: "./index.js",
    };

    const result = parseAnyBlock(v1);
    expect(result.upgraded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.value.manifestVersion).toBe(2);
    expect(result.value.kind).toBe("capability");
  });

  it("leaves a v2 manifest untouched (no upgrade)", () => {
    const v2 = {
      manifestVersion: 2,
      kind: "capability",
      id: "my-cap",
      name: "My Capability",
      summary: "s",
      description: "d",
      version: "0.1.0",
      entryPoint: "./index.js",
    };
    const result = parseAnyBlock(v2);
    expect(result.upgraded).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it("parseAny alias works", () => {
    const v1 = { id: "my-cap", name: "X", summary: "s", description: "d", version: "0.1.0", entryPoint: "./i.js" };
    expect(parseAny(v1).value.kind).toBe("capability");
  });

  it("parseAnyKit upgrades manifestVersion", () => {
    const kit = { id: "my-kit", name: "K", summary: "s", description: "d", version: "0.1.0", category: "general", blocks: [] };
    const result = parseAnyKit(kit);
    expect(result.value.manifestVersion).toBe(2);
    expect(result.upgraded).toBe(true);
  });

  it("parseAnyCircuit upgrades manifestVersion", () => {
    const circuit = { id: "my-circ", name: "C", summary: "s", description: "d", version: "0.1.0", kits: [] };
    const result = parseAnyCircuit(circuit);
    expect(result.value.manifestVersion).toBe(2);
    expect(result.upgraded).toBe(true);
  });
});

// ============================================================================
// Reserved format additions (gamification / AI)
// ============================================================================

describe("§19 reserved format additions", () => {
  it("RendererTargetSchema includes canvas", () => {
    expect(RendererTargetSchema.options).toContain("canvas");
  });

  it("CapabilityBlockSchema accepts placement, models, assets, game", () => {
    const block = {
      manifestVersion: 2,
      kind: "capability",
      id: "my-cap",
      name: "B",
      summary: "s",
      description: "d",
      version: "0.1.0",
      entryPoint: "./i.js",
      placement: "browser",
      models: [{ id: "bge-small", source: "https://example.com/m.onnx" }],
      assets: ["icon.png"],
      game: { xpCost: 10, icon: "star" },
      input: { text: { type: "string" } },
      output: { result: { type: "string" } },
      permissions: { network: true, secrets: ["API_KEY"] },
    };
    const result = CapabilityBlockSchema.safeParse(block);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.placement).toBe("browser");
      expect(result.data.game?.xpCost).toBe(10);
      expect(result.data.permissions.network).toBe(true);
    }
  });

  it("placement defaults to server", () => {
    const block = {
      manifestVersion: 2,
      kind: "capability",
      id: "my-cap",
      name: "B",
      summary: "s",
      description: "d",
      version: "0.1.0",
      entryPoint: "./i.js",
    };
    const result = CapabilityBlockSchema.safeParse(block);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.placement).toBe("server");
    }
  });
});

// ============================================================================
// ErrorCode catalogue
// ============================================================================

describe("ErrorCode catalogue", () => {
  it("has codes in the four ranges", () => {
    const codes = BLKC_ERROR_CODES.map((e) => e.code);
    expect(codes.some((c) => c.startsWith("BLKC-E0"))).toBe(true);
    expect(codes.some((c) => c.startsWith("BLKC-E1"))).toBe(true);
    expect(codes.some((c) => c.startsWith("BLKC-E2"))).toBe(true);
    expect(codes.some((c) => c.startsWith("BLKC-E3"))).toBe(true);
  });

  it("findErrorCode returns the entry", () => {
    const e = findErrorCode("BLKC-E003");
    expect(e).toBeDefined();
    expect(e?.title).toBe("UTF-8 BOM");
  });

  it("findErrorCode returns undefined for unknown", () => {
    expect(findErrorCode("BLKC-E999")).toBeUndefined();
  });

  it("errorCodeDocsUrl builds the docs link", () => {
    expect(errorCodeDocsUrl("BLKC-E003")).toBe("https://blkc.blackcode.space/docs/errors/blkc-e003");
  });

  it("every code has title, cause, fix, docsSlug", () => {
    for (const e of BLKC_ERROR_CODES) {
      expect(e.title).toBeTruthy();
      expect(e.cause).toBeTruthy();
      expect(e.fix).toBeTruthy();
      expect(e.docsSlug).toBeTruthy();
    }
  });
});

// ============================================================================
// Deploy schema (Story 10.2)
// ============================================================================

describe("Deploy schema (Story 10.2)", () => {
  it("parses a valid deploy request", () => {
    const req = { projectId: "p1", siteId: "s1", environment: "production", message: "ship it" };
    const result = DeployRequestSchema.safeParse(req);
    expect(result.success).toBe(true);
  });

  it("defaults environment to development", () => {
    const result = DeployRequestSchema.safeParse({ projectId: "p1", siteId: "s1" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.environment).toBe("development");
  });

  it("rejects missing projectId", () => {
    expect(DeployRequestSchema.safeParse({ siteId: "s1" }).success).toBe(false);
  });

  it("parses a valid deploy response", () => {
    const res = { deployId: "deploy_123", status: "deployed", url: "https://example.com" };
    expect(DeployResponseSchema.safeParse(res).success).toBe(true);
  });

  it("rejects invalid status", () => {
    expect(DeployResponseSchema.safeParse({ deployId: "d", status: "nope" }).success).toBe(false);
  });
});

// ============================================================================
// v2 schemas exist
// ============================================================================

describe("v2 schemas", () => {
  it("BlockV2Schema, KitV2Schema, CircuitV2Schema are defined", () => {
    expect(BlockV2Schema).toBeDefined();
    expect(KitV2Schema).toBeDefined();
    expect(CircuitV2Schema).toBeDefined();
  });

  it("ThemeV2Schema, PageV2Schema, BoardV2Schema are defined", () => {
    expect(ThemeV2Schema).toBeDefined();
    expect(PageV2Schema).toBeDefined();
    expect(BoardV2Schema).toBeDefined();
  });
});

// ============================================================================
// §17 compatibility (v1 -> v2)
// ============================================================================

describe("§17 compatibility", () => {
  it("a v1 capability Block (no kind) parses", () => {
    const v1 = {
      manifestVersion: 1,
      id: "old-cap",
      name: "Old",
      summary: "s",
      description: "d",
      version: "0.1.0",
      entryPoint: "./index.js",
    };
    const result = parseAnyBlock(v1);
    expect(result.value.kind).toBe("capability");
    expect(result.upgraded).toBe(true);
  });

  it("ManifestVersionSchema accepts 1 and 2", () => {
    expect(ManifestVersionSchema.safeParse(1).success).toBe(true);
    expect(ManifestVersionSchema.safeParse(2).success).toBe(true);
  });
});

describe("UI Blocks written with attributes (D3, D4)", () => {
  const block = {
    manifestVersion: 2,
    kind: "ui",
    id: "hero",
    name: "Hero",
    summary: "s",
    description: "d",
    version: "1.0.0",
    attributes: {
      heading: { type: "string", required: true, label: "Heading" },
      align: { type: "string", enum: ["left", "center"], group: "style" },
      items: { type: "list" },
    },
    example: { heading: "Hi" },
  };

  it("derives props, controls and the default renderer", () => {
    const { value } = parseAnyBlock(block);
    if (value.kind !== "ui") throw new Error("expected a UI Block");
    expect(value.props.required).toEqual(["heading"]);
    expect(value.controls.map((c) => [c.prop, c.control])).toEqual([["heading", "text"], ["align", "select"]]);
    expect(value.renderers.web?.package).toBe("./render.web.tsx");
    expect(value.attributes?.["heading"]?.type).toBe("string");
  });

  it("enforces required attributes against the example", () => {
    expect(() => parseAnyBlock({ ...block, example: {} })).toThrow(/heading/);
  });

  it("reports structured issues with codes and fields", () => {
    const rest = { ...block, summary: undefined };
    try {
      parseAnyBlock({ ...rest, attributes: { heading: { type: "nope" } } });
      throw new Error("should not parse");
    } catch (error) {
      expect(error).toBeInstanceOf(ManifestError);
      expect((error as ManifestError).issues[0]).toMatchObject({ code: "BLKC-E108", field: "attributes.heading.type" });
    }
    try {
      parseAnyBlock(rest);
      throw new Error("should not parse");
    } catch (error) {
      expect((error as ManifestError).issues[0]).toMatchObject({ code: "BLKC-E101", field: "summary" });
    }
  });

  it("the published authoring schema accepts the same manifest", () => {
    expect(BlockV2Schema.safeParse(block).success).toBe(true);
  });

  it("accepts a canvas renderer, the reserved target", () => {
    const { value } = parseAnyBlock({ ...block, renderers: { canvas: { package: "x", export: "y" } } });
    if (value.kind !== "ui") throw new Error("expected a UI Block");
    expect(value.renderers.canvas?.export).toBe("y");
  });
});

describe("richtext attributes and theme presets", () => {
  it("richtext accepts TipTap JSON and an HTML string, and nothing else", () => {
    const { zodSchema } = compileAttributes({ body: { type: "richtext", required: true } });
    expect(zodSchema.safeParse({ body: { type: "doc", content: [] } }).success).toBe(true);
    expect(zodSchema.safeParse({ body: "<p>x</p>" }).success).toBe(true);
    expect(zodSchema.safeParse({ body: 3 }).success).toBe(false);
  });

  it("theme presets accept short slugs such as md", () => {
    const palette = [{ slug: "md", name: "Medium", size: "1rem" }];
    expect(ThemeV2Schema.safeParse({ settings: { spacing: { spacingSizes: palette } } }).success).toBe(true);
  });
});
