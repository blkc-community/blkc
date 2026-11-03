/**
 * BLKC Core - Unit Tests
 * 
 * Tests for schemas and helper functions.
 */

import { describe, it, expect } from "vitest";
import {
  IdentifierSchema,
  ManifestVersionSchema,
  computeContentHash,
  cryptoRandomId,
  nowISO,
  withHash,
  safeParse,
  PersonSchema,
  BlockKindSchema,
  BlockSchema,
  UiBlockSchema,
  CapabilityBlockSchema,
  KitSchema,
  CircuitSchema,
  LogbookEntrySchema,
  DEFAULT_LICENSE,
} from "./index";

// ============================================================================
// Helper Functions
// ============================================================================

describe("computeContentHash", () => {
  it("should compute SHA256 hash of string", () => {
    const hash = computeContentHash("test");
    expect(hash).toBe("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");
  });

  it("should compute hash of object", () => {
    const obj = { foo: "bar", num: 42 };
    const hash1 = computeContentHash(obj);
    const hash2 = computeContentHash(obj);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA256 hex length
  });

  it("should compute hash with custom algorithm", () => {
    const hash = computeContentHash("test", "sha512");
    expect(hash.length).toBe(128); // SHA512 hex length
  });
});

describe("cryptoRandomId", () => {
  it("should generate 12-character hex string", () => {
    const id = cryptoRandomId();
    expect(id).toMatch(/^[a-f0-9]{12}$/);
  });

  it("should generate unique IDs", () => {
    const id1 = cryptoRandomId();
    const id2 = cryptoRandomId();
    expect(id1).not.toBe(id2);
  });
});

describe("nowISO", () => {
  it("should return ISO 8601 timestamp", () => {
    const timestamp = nowISO();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe("withHash", () => {
  it("should add hash and prevHash to payload", () => {
    const payload = { foo: "bar" };
    const result = withHash(payload);
    expect(result).toHaveProperty("foo", "bar");
    expect(result).toHaveProperty("hash");
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result).toHaveProperty("prevHash", undefined);
  });

  it("should include prevHash when provided", () => {
    const payload = { foo: "bar" };
    const prevHash = "abc123";
    const result = withHash(payload, prevHash);
    expect(result.prevHash).toBe(prevHash);
    expect(result.hash).toBeDefined();
  });

  it("should use custom algorithm", () => {
    const payload = { foo: "bar" };
    const result = withHash(payload, undefined, "sha512");
    expect(result.hash?.length).toBe(128);
  });
});

describe("safeParse", () => {
  it("should parse valid data", () => {
    const schema = IdentifierSchema;
    const result = safeParse(schema, "test-id");
    expect(result).toBe("test-id");
  });

  it("should throw on invalid data", () => {
    const schema = IdentifierSchema;
    expect(() => safeParse(schema, "A")).toThrow(); // too short
    expect(() => safeParse(schema, "Invalid_ID")).toThrow(); // uppercase
  });
});

// ============================================================================
// Schemas
// ============================================================================

describe("IdentifierSchema", () => {
  it("should accept valid identifiers", () => {
    expect(IdentifierSchema.parse("test")).toBe("test");
    expect(IdentifierSchema.parse("test-123")).toBe("test-123");
    expect(IdentifierSchema.parse("a".repeat(64))).toBe("a".repeat(64));
  });

  it("should reject invalid identifiers", () => {
    expect(() => IdentifierSchema.parse("AB")).toThrow(); // uppercase
    expect(() => IdentifierSchema.parse("a")).toThrow(); // too short
    expect(() => IdentifierSchema.parse("a".repeat(65))).toThrow(); // too long
    expect(() => IdentifierSchema.parse("test space")).toThrow(); // space
    expect(() => IdentifierSchema.parse("test_")).toThrow(); // underscore
  });
});

describe("ManifestVersionSchema", () => {
  it("should accept 1 and 2", () => {
    expect(ManifestVersionSchema.parse(1)).toBe(1);
    expect(ManifestVersionSchema.parse(2)).toBe(2);
  });

  it("should default to 1", () => {
    expect(ManifestVersionSchema.parse(undefined)).toBe(1);
  });

  it("should reject other values", () => {
    expect(() => ManifestVersionSchema.parse(3)).toThrow();
    expect(() => ManifestVersionSchema.parse(0)).toThrow();
  });
});

describe("PersonSchema", () => {
  it("should accept valid person", () => {
    const person = { name: "John Doe", email: "john@example.com" };
    const result = PersonSchema.parse(person);
    expect(result.name).toBe("John Doe");
    expect(result.email).toBe("john@example.com");
  });

  it("should accept person without email", () => {
    const person = { name: "John Doe" };
    const result = PersonSchema.parse(person);
    expect(result.name).toBe("John Doe");
    expect(result.email).toBeUndefined();
  });

  it("should reject invalid email", () => {
    expect(() => PersonSchema.parse({ name: "John", email: "invalid" })).toThrow();
  });
});

describe("BlockKindSchema", () => {
  it("should accept 'ui' and 'capability'", () => {
    expect(BlockKindSchema.parse("ui")).toBe("ui");
    expect(BlockKindSchema.parse("capability")).toBe("capability");
  });

  it("should reject other values", () => {
    expect(() => BlockKindSchema.parse("other")).toThrow();
  });
});

// ============================================================================
// Complex Schemas
// ============================================================================

describe("UiBlockSchema", () => {
  it("should validate UI block", () => {
    const block = {
      manifestVersion: 2,
      kind: "ui",
      id: "test-block",
      name: "Test Block",
      summary: "A test block",
      description: "Test description",
      version: "1.0.0",
      category: "test",
      props: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
      },
      controls: [],
      renderers: { web: { package: "@blkc-code/render-web", export: "TestBlock" } },
    };
    const result = UiBlockSchema.parse(block);
    expect(result.id).toBe("test-block");
    expect(result.kind).toBe("ui");
  });

  it("should require renderers for UI blocks", () => {
    const block = {
      manifestVersion: 2,
      kind: "ui",
      id: "test-block",
      name: "Test",
      summary: "Test",
      description: "Test",
      version: "1.0.0",
      category: "test",
      props: { type: "object", properties: {} },
      controls: [],
      // renderers missing
    };
    expect(() => UiBlockSchema.parse(block)).toThrow();
  });
});

describe("CapabilityBlockSchema", () => {
  it("should validate capability block", () => {
    const block = {
      manifestVersion: 1,
      kind: "capability",
      id: "test-capability",
      name: "Test Capability",
      summary: "A test capability",
      description: "Test description",
      version: "1.0.0",
      entryPoint: "index.js",
      runtime: "bun",
    };
    const result = CapabilityBlockSchema.parse(block);
    expect(result.id).toBe("test-capability");
    expect(result.kind).toBe("capability");
  });
});

describe("BlockSchema (discriminated union)", () => {
  it("should parse UI blocks", () => {
    const block = {
      manifestVersion: 2,
      kind: "ui",
      id: "test",
      name: "Test",
      summary: "Test",
      description: "Test",
      version: "1.0.0",
      category: "test",
      props: { type: "object", properties: {} },
      controls: [],
      renderers: { web: { package: "pkg", export: "exp" } },
    };
    const result = BlockSchema.parse(block);
    expect(result.kind).toBe("ui");
  });

  it("should parse capability blocks", () => {
    const block = {
      manifestVersion: 1,
      kind: "capability",
      id: "test",
      name: "Test",
      summary: "Test",
      description: "Test",
      version: "1.0.0",
      entryPoint: "index.js",
    };
    const result = BlockSchema.parse(block);
    expect(result.kind).toBe("capability");
  });

  it("should fail for v1 blocks without kind", () => {
    const block = {
      manifestVersion: 1,
      id: "test",
      name: "Test",
      summary: "Test",
      description: "Test",
      version: "1.0.0",
      entryPoint: "index.js",
      // kind missing - discriminated union requires kind
    };
    const result = BlockSchema.safeParse(block);
    expect(result.success).toBe(false);
    // Discriminated union validation fails at root level
    expect(result.error?.issues[0].path).toEqual([]);
  });
});

describe("KitSchema", () => {
  it("should validate kit", () => {
    const kit = {
      manifestVersion: 2,
      id: "test-kit",
      name: "Test Kit",
      summary: "A test kit",
      description: "Test description",
      version: "1.0.0",
      category: "test",
      tags: ["test"],
      blocks: [],
    };
    const result = KitSchema.parse(kit);
    expect(result.id).toBe("test-kit");
    expect(result.blocks).toEqual([]);
  });

  it("should have default license", () => {
    const kit = {
      manifestVersion: 2,
      id: "test-kit",
      name: "Test Kit",
      summary: "A test kit",
      description: "Test description",
      version: "1.0.0",
      category: "test",
      blocks: [],
    };
    const result = KitSchema.parse(kit);
    expect(result.license).toBe(DEFAULT_LICENSE);
  });
});

describe("CircuitSchema", () => {
  it("should validate circuit", () => {
    const circuit = {
      manifestVersion: 2,
      id: "test-circuit",
      name: "Test Circuit",
      summary: "A test circuit",
      description: "Test description",
      version: "1.0.0",
      verticals: [],
      tags: [],
      kits: [],
    };
    const result = CircuitSchema.parse(circuit);
    expect(result.id).toBe("test-circuit");
    expect(result.license).toBe(DEFAULT_LICENSE);
  });
});

describe("LogbookEntrySchema", () => {
  it("should validate logbook entry", () => {
    const entry = {
      timestamp: new Date().toISOString(),
      actor: { name: "Test User" },
      event: "test_event",
      data: { foo: "bar" },
    };
    const result = LogbookEntrySchema.parse(entry);
    expect(result.id).toBeDefined(); // auto-generated
    expect(result.timestamp).toBe(entry.timestamp);
    expect(result.actor.name).toBe("Test User");
    expect(result.event).toBe("test_event");
  });

  it("should accept entry with hash chain", () => {
    const entry = {
      id: "entry-1",
      timestamp: new Date().toISOString(),
      actor: { name: "Test User" },
      event: "test_event",
      data: { foo: "bar" },
      prevHash: "abc123",
      hash: "def456",
    };
    const result = LogbookEntrySchema.parse(entry);
    expect(result.prevHash).toBe("abc123");
    expect(result.hash).toBe("def456");
  });
});
