import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CircuitSchema } from "@blkc-code/core";
import {
  createMarketplaceStore,
  publishCircuit,
  searchCircuits,
  getCircuit,
  recordInstall,
} from "./index.js";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "blkc-mp-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const circuit = CircuitSchema.parse({
  manifestVersion: 1,
  id: "demo-circuit",
  name: "Demo",
  summary: "A demo circuit",
  description: "Demo description",
  version: "0.1.0",
  verticals: [],
  tags: ["demo"],
  license: "MIT",
  kits: [],
  boards: [],
  capabilities: [],
  maintainers: [],
});

describe("marketplace store", () => {
  it("publishes and searches", async () => {
    const store = createMarketplaceStore(dir);
    await publishCircuit(store, { circuit, author: "BLKC" });
    const results = await searchCircuits(store, { query: "demo" });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("demo-circuit");
  });

  it("installs and counts", async () => {
    const store = createMarketplaceStore(dir);
    await publishCircuit(store, { circuit });
    await recordInstall(store, "demo-circuit", "0.1.0");
    const entry = await getCircuit(store, "demo-circuit");
    expect(entry?.installCount).toBe(1);
  });

  it("filters free", async () => {
    const store = createMarketplaceStore(dir);
    await publishCircuit(store, { circuit, pricing: { model: "one-time", amount: 10, currency: "USD" } });
    expect(await searchCircuits(store, { freeOnly: true })).toHaveLength(0);
  });
});