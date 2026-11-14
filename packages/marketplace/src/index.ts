/**
 * BLKC Marketplace: publish, discover, install, and bill for BLKC circuits.
 *
 * This is an assembly on top of BLKC core. It consumes Circuit manifests
 * (from @blkc-code/core) and adds marketplace metadata (pricing, author,
 * install count, rating). It does not modify BLKC core.
 *
 * Storage: a local file-based marketplace for development. A hosted API
 * can replace the store without changing the public surface.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { CircuitSchema, type CircuitManifest } from "@blkc-code/core";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// ============================================================================
// Marketplace metadata (extends CircuitManifest)
// ============================================================================

export const MarketplacePricingSchema = z.object({
  model: z.enum(["free", "one-time", "subscription"]).default("free"),
  amount: z.number().min(0).default(0),
  currency: z.string().default("USD"),
  tier: z.string().optional(),
});

export type MarketplacePricing = z.infer<typeof MarketplacePricingSchema>;

export const MarketplaceCircuitSchema = CircuitSchema.extend({
  author: z.string().optional(),
  publishedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  pricing: MarketplacePricingSchema.default({ model: "free", amount: 0, currency: "USD" }),
  installCount: z.number().int().min(0).default(0),
  rating: z.number().min(0).max(5).default(0),
  reviewCount: z.number().int().min(0).default(0),
  checksum: z.string().optional(),
  featured: z.boolean().default(false),
});

export type MarketplaceCircuit = z.infer<typeof MarketplaceCircuitSchema>;

// ============================================================================
// Local file-based store
// ============================================================================

export type MarketplaceStore = {
  dir: string;
};

export function createMarketplaceStore(dir: string): MarketplaceStore {
  return { dir };
}

const storeFile = (store: MarketplaceStore) => path.join(store.dir, "marketplace.json");

async function readStore(store: MarketplaceStore): Promise<MarketplaceCircuit[]> {
  try {
    const raw = await readFile(storeFile(store), "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((e) => MarketplaceCircuitSchema.parse(e));
  } catch {
    return [];
  }
}

async function writeStore(store: MarketplaceStore, entries: MarketplaceCircuit[]): Promise<void> {
  await mkdir(store.dir, { recursive: true });
  await writeFile(storeFile(store), JSON.stringify(entries, null, 2) + "\n", "utf8");
}

// ============================================================================
// Publish
// ============================================================================

export type PublishInput = {
  circuit: CircuitManifest;
  author?: string;
  pricing?: MarketplacePricing;
  featured?: boolean;
};

export async function publishCircuit(store: MarketplaceStore, input: PublishInput): Promise<MarketplaceCircuit> {
  const now = new Date().toISOString();
  const entry: MarketplaceCircuit = MarketplaceCircuitSchema.parse({
    ...input.circuit,
    author: input.author,
    publishedAt: now,
    updatedAt: now,
    pricing: input.pricing ?? { model: "free", amount: 0, currency: "USD" },
    featured: input.featured ?? false,
    checksum: createChecksum(input.circuit),
  });

  const entries = await readStore(store);
  const idx = entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  await writeStore(store, entries);
  return entry;
}

function createChecksum(circuit: CircuitManifest): string {
  return createHash("sha256").update(JSON.stringify(circuit)).digest("hex");
}

// ============================================================================
// Search
// ============================================================================

export type SearchQuery = {
  query?: string;
  tag?: string;
  category?: string;
  author?: string;
  freeOnly?: boolean;
  featured?: boolean;
};

export async function searchCircuits(store: MarketplaceStore, q: SearchQuery = {}): Promise<MarketplaceCircuit[]> {
  const entries = await readStore(store);
  return entries.filter((e) => {
    if (q.query) {
      const needle = q.query.toLowerCase();
      if (!e.name.toLowerCase().includes(needle) && !e.summary.toLowerCase().includes(needle) && !e.id.toLowerCase().includes(needle)) return false;
    }
    if (q.tag && !e.tags.includes(q.tag)) return false;
    if (q.author && e.author !== q.author) return false;
    if (q.freeOnly && e.pricing.model !== "free") return false;
    if (q.featured !== undefined && e.featured !== q.featured) return false;
    return true;
  });
}

// ============================================================================
// Install
// ============================================================================

export async function getCircuit(store: MarketplaceStore, id: string, version?: string): Promise<MarketplaceCircuit | undefined> {
  const entries = await readStore(store);
  const matches = entries.filter((e) => e.id === id);
  if (matches.length === 0) return undefined;
  if (version) return matches.find((e) => e.version === version);
  // latest by publishedAt
  return matches.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))[0];
}

export async function recordInstall(store: MarketplaceStore, id: string, version?: string): Promise<void> {
  const entries = await readStore(store);
  const idx = entries.findIndex((e) => e.id === id && (!version || e.version === version));
  if (idx >= 0) {
    entries[idx].installCount += 1;
    await writeStore(store, entries);
  }
}