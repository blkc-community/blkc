import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Buffer } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ValidateExitCode,
  discoverManifests,
  parseManifest,
  validateManifestFile,
  validateManifests,
} from "../manifests";

const Schema = z.object({ id: z.string(), version: z.string() });
const valid = JSON.stringify({ id: "hero", version: "1.0.0" });

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "blkc-manifests-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

const run = (targets: string[]) =>
  validateManifests({ kind: "Block", targets, schema: Schema, describe: () => [] });

describe("validateManifests", () => {
  it("refuses to report success when a directory holds no manifests", async () => {
    expect(await run([dir])).toBe(ValidateExitCode.NothingToValidate);
  });

  it("validates every manifest.json found under a directory", async () => {
    await mkdir(path.join(dir, "a"));
    await mkdir(path.join(dir, "b", "nested"), { recursive: true });
    await writeFile(path.join(dir, "a", "manifest.json"), valid);
    await writeFile(path.join(dir, "b", "nested", "manifest.json"), valid);

    expect(await discoverManifests([dir])).toHaveLength(2);
    expect(await run([dir])).toBe(ValidateExitCode.Ok);
  });

  it("fails when any one manifest is invalid", async () => {
    await mkdir(path.join(dir, "a"));
    await mkdir(path.join(dir, "b"));
    await writeFile(path.join(dir, "a", "manifest.json"), valid);
    await writeFile(path.join(dir, "b", "manifest.json"), JSON.stringify({ id: "x" }));

    expect(await run([dir])).toBe(ValidateExitCode.Failed);
  });

  it("accepts a manifest file passed directly", async () => {
    const file = path.join(dir, "manifest.json");
    await writeFile(file, valid);
    expect(await run([file])).toBe(ValidateExitCode.Ok);
  });
});

describe("validateManifestFile", () => {
  it("names the field that failed", async () => {
    const file = path.join(dir, "manifest.json");
    await writeFile(file, JSON.stringify({ id: "x" }));
    const outcome = await validateManifestFile(file, Schema);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.join("\n")).toContain("version");
  });
});

describe("parseManifest", () => {
  it("rejects a UTF-8 byte order mark with a message that names it", () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(valid)]);
    const result = parseManifest(withBom);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.errors.join(" ")).toContain("byte order mark");
  });

  it("reports invalid JSON instead of throwing", () => {
    expect(parseManifest(Buffer.from("{ not json")).ok).toBe(false);
  });
});
