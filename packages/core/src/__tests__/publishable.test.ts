import { describe, expect, it } from "vitest";
import { CircuitSchema, parseAnyBlock, validatePublishable } from "../index.js";

const circuit = (patch: Record<string, unknown> = {}) => ({
  manifestVersion: 2, id: "smb-circuit", name: "SMB", summary: "s", description: "d", version: "1.0.0", license: "MIT",
  kits: [{ kitId: "lead-gen-kit", version: "0.3.1" }],
  capabilities: [{ blockId: "sentiment-vader", version: "0.1.0" }],
  ...patch,
});

const capability = (patch: Record<string, unknown> = {}) => ({
  manifestVersion: 2, kind: "capability", id: "sentiment-vader", name: "Sentiment (VADER)", summary: "s", description: "d",
  version: "0.1.0", license: "MIT", entryPoint: "index.ts", runtime: "node",
  ...patch,
});

describe("validatePublishable", () => {
  it("accepts a pinned v2 circuit", () => {
    expect(validatePublishable("circuit", circuit())).toEqual({ ok: true, errors: [] });
  });

  it("refuses ranges on kit and block refs", () => {
    const result = validatePublishable("circuit", circuit({ kits: [{ kitId: "lead-gen-kit", version: "^0.3.0" }], capabilities: [{ blockId: "x-block", version: "~1.0.0" }] }));
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.field)).toEqual(["kits.0.version", "capabilities.0.version"]);
    expect(result.errors.every((e) => e.code === "BLKC-E201")).toBe(true);
  });

  it("refuses a manifest that relies on v1 upgrades", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { manifestVersion: _m, kind: _k, ...v1 } = capability();
    const codes = validatePublishable("block", v1).errors.map((e) => e.code);
    expect(codes).toContain("BLKC-E104");
    expect(codes).toContain("BLKC-E106");
  });

  it("needs a license and an exact version", () => {
    const codes = validatePublishable("block", capability({ license: "", version: "latest" })).errors.map((e) => e.code);
    expect(codes).toEqual(expect.arrayContaining(["BLKC-E101", "BLKC-E201"]));
  });
});

describe("marketplace contract fields", () => {
  it("capability blocks carry evals, hf models and an MCP App", () => {
    const block = parseAnyBlock(capability({
      models: [{ id: "cardiffnlp/twitter-roberta-base-sentiment", source: "hf", license: "mit" }],
      evals: [{ dataset: "sst2-test-500", metric: "f1", score: 0.81, baseline: { name: "large-llm", score: 0.86 }, latencyP50Ms: 3, costPer1k: 0 }],
      mcpApp: { resourceUri: "ui://sentiment/preview", title: "Try it" },
    })).value as { evals: unknown[]; mcpApp?: { resourceUri: string } };
    expect(block.evals).toHaveLength(1);
    expect(block.mcpApp?.resourceUri).toBe("ui://sentiment/preview");
  });

  it("refuses an MCP App that isn't a ui:// resource", () => {
    expect(() => parseAnyBlock(capability({ mcpApp: { resourceUri: "https://evil.example", title: "x" } }))).toThrow();
  });

  it("circuits keep their integrations", () => {
    const parsed = CircuitSchema.parse(circuit({ integrations: [{ name: "herdr", description: "live agent panes" }] }));
    expect(parsed.integrations).toEqual([{ name: "herdr", optional: true, description: "live agent panes" }]);
  });
});
