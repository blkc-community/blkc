import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { VERSION } from "../version";

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CLI = path.join(PACKAGE_ROOT, "dist", "blkc.cjs");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "blkc-new-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function blkc(...args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

function put(file: string, value: unknown) {
  const full = path.join(dir, file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, typeof value === "string" ? value : JSON.stringify(value));
}

const uiBlock = {
  manifestVersion: 2,
  kind: "ui",
  id: "demo",
  name: "Demo",
  summary: "s",
  description: "d",
  version: "0.1.0",
  attributes: { heading: { type: "string", required: true } },
};

describe("blkc --version", () => {
  it("matches package.json", () => {
    const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"));
    expect(VERSION).toBe(pkg.version);
    expect(blkc("--version").out.trim()).toBe(pkg.version);
  });
});

describe("blkc new", () => {
  const cases: [string, string[], string, string[]][] = [
    ["ui block", ["new", "block", "demo"], "blocks/demo", ["block.json", "block.test.mjs", "README.md"]],
    ["capability block", ["new", "block", "demo", "--capability"], "blocks/demo", ["block.json", "src/index.ts", "examples/basic.json", "block.test.mjs"]],
    ["kit", ["new", "kit", "demo"], "kits/demo", ["kit.json", "theme.json", "pages/home.json", "kit.test.mjs"]],
    ["circuit", ["new", "circuit", "demo"], "circuits/demo", ["circuit.json", "boards/main.json", "circuit.test.mjs"]],
  ];

  it.each(cases)("%s: writes an example and a test, and passes check and its own test", (_name, args, folder, files) => {
    expect(blkc(...args).code).toBe(0);
    for (const file of files) expect(existsSync(path.join(dir, folder, file)), file).toBe(true);

    const check = blkc("check");
    expect(check.code, check.out).toBe(0);
    expect(check.out).toContain("0 invalid");

    const test = spawnSync(process.execPath, ["--test"], { cwd: path.join(dir, folder), encoding: "utf8" });
    expect(test.status, test.stdout + test.stderr).toBe(0);
  });

  it("makes a UI Block by default, using the attributes map", () => {
    blkc("new", "block", "demo");
    const manifest = JSON.parse(readFileSync(path.join(dir, "blocks/demo/block.json"), "utf8"));
    expect(manifest.kind).toBe("ui");
    expect(manifest.attributes.heading.type).toBe("string");
    expect(manifest.props).toBeUndefined();
  });

  it.each(["../evil", "AB", "ab", "Has_Caps"])("rejects the id %s and writes nothing", (id) => {
    const r = blkc("new", "kit", id);
    expect(r.code).toBe(1);
    expect(r.out).toContain("BLKC-E103");
    expect(existsSync(path.join(dir, "kits"))).toBe(false);
  });

  it("writes the real Pixel Office Kit, not a blank one, and it passes check and its test", () => {
    expect(blkc("new", "kit", "pixel-office").code).toBe(0);
    const folder = path.join(dir, "kits/pixel-office");
    const kit = JSON.parse(readFileSync(path.join(folder, "kit.json"), "utf8"));
    expect(kit.name).toBe("Pixel Office");
    expect(kit.theme.settings.color.palette.length).toBeGreaterThan(0);
    expect(kit.content.pages[0].blocks.length).toBeGreaterThan(0);
    expect(existsSync(path.join(folder, "NOTICE"))).toBe(true);
    expect(blkc("check").code).toBe(0);
    const test = spawnSync(process.execPath, ["--test"], { cwd: dir, encoding: "utf8" });
    expect(test.status, test.stdout + test.stderr).toBe(0);
  });

  it("refuses to overwrite an existing folder", () => {
    put("kits/demo/kit.json", "mine");
    expect(blkc("new", "kit", "demo").code).toBe(1);
    expect(readFileSync(path.join(dir, "kits/demo/kit.json"), "utf8")).toBe("mine");
  });

  it("rejects an unknown kind", () => {
    expect(blkc("new", "widget", "demo").code).toBe(1);
  });
});

describe("blkc check", () => {
  it("exits 2 when nothing is found", () => {
    const r = blkc("check");
    expect(r.code).toBe(2);
    expect(r.out).toContain("BLKC-E005");
  });

  it("prints code, field, fix and docs link per error, and exits 1", () => {
    put("blocks/demo/block.json", { ...uiBlock, summary: undefined });
    const r = blkc("check");
    expect(r.code).toBe(1);
    expect(r.out).toContain("BLKC-E101");
    expect(r.out).toContain("blocks/demo/block.json:summary");
    expect(r.out).toContain("Add the missing field.");
    expect(r.out).toContain("https://blkc.blackcode.space/docs/errors/blkc-e101");
  });

  it("reports a bad attribute type as BLKC-E108 on that field", () => {
    put("blocks/demo/block.json", { ...uiBlock, attributes: { heading: { type: "nope" } } });
    const r = blkc("check");
    expect(r.code).toBe(1);
    expect(r.out).toContain("BLKC-E108");
    expect(r.out).toContain("attributes.heading.type");
  });

  it("reports invalid JSON as BLKC-E004 and a BOM as BLKC-E003", () => {
    put("kits/one/kit.json", '{"a":1}\nEOF');
    put("kits/two/kit.json", "﻿{}");
    const r = blkc("check");
    expect(r.code).toBe(1);
    expect(r.out).toContain("BLKC-E004");
    expect(r.out).toContain("BLKC-E003");
  });

  it("still validates an older manifestVersion and warns about the old file name", () => {
    put("blocks/old/manifest.json", {
      manifestVersion: 1,
      id: "old-block",
      name: "Old",
      summary: "s",
      description: "d",
      version: "1.0.0",
      entryPoint: "./src/index.ts",
      runtime: "node",
    });
    const r = blkc("check");
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("upgraded");
    expect(r.out).toContain("rename it to block.json");
  });

  it("checks a Kit's theme and pages, and that page blocks are declared", () => {
    blkc("new", "kit", "demo");
    put("kits/demo/theme.json", { version: "three" });
    put("kits/demo/pages/about.json", { slug: "about", title: "About", blocks: [{ block: "hero" }] });
    const r = blkc("check");
    expect(r.code).toBe(1);
    expect(r.out).toContain("kits/demo/theme.json:version");
    expect(r.out).toContain("BLKC-E111");
    expect(r.out).toContain("kits/demo/pages/about.json:blocks.0.block");
  });

  it("checks a Circuit's boards", () => {
    blkc("new", "circuit", "demo");
    put("circuits/demo/boards/main.json", {
      id: "main",
      name: "Main",
      columns: [{ id: "todo", name: "To do" }],
      transitions: [{ from: "todo", to: "gone" }],
    });
    const r = blkc("check");
    expect(r.code).toBe(1);
    expect(r.out).toContain("BLKC-E110");
  });

  it("ignores pages and boards folders that no manifest owns", () => {
    blkc("new", "kit", "demo");
    put("site/pages/not-ours.json", { anything: true });
    const r = blkc("check");
    expect(r.code, r.out).toBe(0);
  });

  it("skips JSON Schema files and build output when scanning a folder", () => {
    blkc("new", "kit", "demo");
    const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" };
    for (const name of ["block", "kit", "circuit", "theme"]) put(`packages/core/schemas/v2/${name}.json`, schema);
    put("dist/kit.json", { not: "a manifest" });
    put("coverage/block.json", { not: "a manifest" });
    const r = blkc("check");
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toContain("schemas");
    expect(r.out).not.toContain("dist");
  });

  it("still checks a JSON Schema file when you name it, and a manifest with its own $schema", () => {
    put("schema/block.json", { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" });
    expect(blkc("check", "schema/block.json").code).toBe(1);
    blkc("new", "kit", "demo");
    const scanned = blkc("check", "--json");
    expect(JSON.parse(scanned.out).files).toBe(3);
  });

  it("still reports a manifest that does not parse", () => {
    put("kits/broken/kit.json", "{ not json");
    const r = blkc("check");
    expect(r.code).toBe(1);
    expect(r.out).toContain("BLKC-E004");
  });

  it("--json is parseable and carries the issues", () => {
    put("blocks/demo/block.json", { ...uiBlock, id: "BAD ID" });
    const r = spawnSync(process.execPath, [CLI, "check", "--json"], { cwd: dir, encoding: "utf8" });
    expect(r.status).toBe(1);
    const report = JSON.parse(r.stdout);
    expect(report.ok).toBe(false);
    expect(report.issues[0]).toMatchObject({ code: "BLKC-E103", field: "id" });
  });
});

describe("blkc validate (deprecated alias)", () => {
  it("warns and behaves like check, including paths and exit codes", () => {
    blkc("new", "kit", "demo");
    const ok = blkc("validate", "kits/demo");
    expect(ok.code, ok.out).toBe(0);
    expect(ok.out).toContain("deprecated");
    expect(ok.out).toContain("3 valid");

    put("kits/demo/kit.json", "{");
    expect(blkc("validate", "kits/demo").code).toBe(1);
  });
});
