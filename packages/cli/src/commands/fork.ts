/**
 * BLKC CLI - Fork
 *
 * `blkc new block|kit|circuit <id> --from <source>` copies something that already
 * exists into this project, under a new id, for you to change. A source is a local
 * folder (./somewhere) or the name of something in the community repos.
 *
 * A fork copies files and nothing else: it never runs anything it downloads.
 */

import { Buffer } from "node:buffer";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { IdentifierSchema, parseAny, parseAnyCircuit, parseAnyKit } from "@blkc-code/core";
import { KIT_TEMPLATES } from "../kit-templates.js";

export type ForkKind = "block" | "kit" | "circuit";
type Json = Record<string, unknown>;

/** A file as bytes, so images and fonts survive the copy. */
type Files = Map<string, Buffer>;

const REPOS: Record<ForkKind, string> = { block: "blocks", kit: "kits", circuit: "circuits" };
const MANIFESTS = ["block.json", "kit.json", "circuit.json", "manifest.json"];
const MAX_FILES = 300;
const MAX_BYTES = 20 * 1024 * 1024;
const BOM = new RegExp("^\\uFEFF");
const SKIP = new Set(["node_modules", ".git", "dist", ".next"]);

export class ForkError extends Error {}

function githubUrls() {
  return {
    api: process.env["BLKC_GITHUB_API"] ?? "https://api.github.com",
    raw: process.env["BLKC_GITHUB_RAW"] ?? "https://raw.githubusercontent.com",
    ref: process.env["BLKC_COMMUNITY_REF"] ?? "main",
  };
}

function checkLimits(files: Files): void {
  let bytes = 0;
  for (const content of files.values()) bytes += content.length;
  if (files.size > MAX_FILES || bytes > MAX_BYTES) {
    throw new ForkError(`That is too big to fork (limit: ${MAX_FILES} files and ${MAX_BYTES / 1024 / 1024} MB).`);
  }
}

async function readLocal(dir: string, base = dir, out: Files = new Map()): Promise<Files> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await readLocal(full, base, out);
    } else if (entry.isFile()) { // symlinks are skipped: they could point out of the folder
      out.set(path.relative(base, full).split(path.sep).join("/"), await readFile(full));
      if (out.size > MAX_FILES) throw new ForkError(`That is too big to fork (limit: ${MAX_FILES} files).`);
    }
  }
  return out;
}

async function get(url: string) {
  try {
    return await globalThis.fetch(url, { headers: { "User-Agent": "blkc-cli" } });
  } catch {
    throw new ForkError("Could not reach GitHub. Check your connection, or fork from a local folder with --from ./path.");
  }
}

async function readCommunity(kind: ForkKind, name: string): Promise<Files> {
  const repo = REPOS[kind];
  const { api, raw, ref } = githubUrls();
  const response = await get(`${api}/repos/blkc-community/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  if (response.status === 403 || response.status === 429) {
    throw new ForkError(`GitHub is limiting requests right now. Try again later, or clone github.com/blkc-community/${repo} and use --from ./path.`);
  }
  if (!response.ok) throw new ForkError(`Could not list blkc-community/${repo} (HTTP ${response.status}).`);
  const { tree } = (await response.json()) as { tree: { path: string; type: string }[] };

  const prefix = `${name}/`;
  const paths = tree.filter((item) => item.type === "blob" && item.path.startsWith(prefix)).map((item) => item.path);
  if (paths.length === 0) {
    const available = [...new Set(tree.filter((item) => item.type === "tree" && !item.path.includes("/") && !item.path.startsWith(".")).map((item) => item.path))];
    throw new ForkError(`There is no ${kind} called "${name}" in blkc-community/${repo}. Available: ${available.join(", ") || "none"}.`);
  }
  if (paths.length > MAX_FILES) throw new ForkError(`That is too big to fork (limit: ${MAX_FILES} files).`);

  const files: Files = new Map();
  for (const file of paths) {
    const relative = file.slice(prefix.length);
    if (relative.split("/").includes("..")) throw new ForkError(`Refusing an unsafe path in the source: ${file}`);
    const url = `${raw}/blkc-community/${repo}/${encodeURIComponent(ref)}/${file.split("/").map(encodeURIComponent).join("/")}`;
    const content = await get(url);
    if (!content.ok) throw new ForkError(`Could not download ${file} (HTTP ${content.status}).`);
    files.set(relative, Buffer.from(await content.arrayBuffer()));
  }
  return files;
}

const isLocalPath = (source: string): boolean => /^(\.{1,2}([/\\]|$)|[/\\]|[a-zA-Z]:[/\\])/.test(source);

async function readSource(kind: ForkKind, source: string, cwd: string): Promise<{ files: Files; label: string }> {
  if (isLocalPath(source)) {
    const dir = path.resolve(cwd, source);
    let isDir = false;
    try {
      isDir = (await stat(dir)).isDirectory();
    } catch {
      // reported below
    }
    if (!isDir) throw new ForkError(`There is no folder at ${source}.`);
    return { files: await readLocal(dir), label: source };
  }

  if (!IdentifierSchema.safeParse(source).success) {
    throw new ForkError(`"${source}" is not a community name. For a local folder, start the path with ./`);
  }
  const label = `https://github.com/blkc-community/${REPOS[kind]}/tree/main/${source}`;
  try {
    return { files: await readCommunity(kind, source), label };
  } catch (error) {
    // The built-in copy means the most common fork still works offline.
    const template = kind === "kit" ? KIT_TEMPLATES[source] : undefined;
    if (!template) throw error;
    const files: Files = new Map(Object.entries(template).map(([name, text]) => [name, Buffer.from(text)]));
    return { files, label };
  }
}

function parseSource(kind: ForkKind, raw: unknown): Json {
  try {
    const parse = kind === "kit" ? parseAnyKit : kind === "circuit" ? parseAnyCircuit : parseAny;
    return parse(raw).value as unknown as Json;
  } catch (error) {
    throw new ForkError(`The source is not a valid ${kind}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const NAME_FOR: Record<ForkKind, string> = { block: "block.json", kit: "kit.json", circuit: "circuit.json" };

function title(id: string): string {
  return id.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

/** The source's manifest under the fork's identity. It keeps its licence. */
function forkManifest(kind: ForkKind, source: Json, id: string, hasComponent: boolean): Json {
  // A current manifest is kept as written. An old one is written out upgraded.
  const parsed = parseSource(kind, source);
  const base: Json = source["manifestVersion"] === 2 ? { ...source } : { ...parsed, manifestVersion: 2 };
  for (const stale of ["repository", "documentation", "homepage", "maintainers", "authors"]) delete base[stale];
  // A local component is found by convention. Don't keep pointing at the original's package.
  if (hasComponent && base["attributes"]) delete base["renderers"];
  return {
    $schema: `https://blkc.blackcode.space/schemas/v2/${kind}.json`,
    ...base,
    id,
    name: title(id),
    version: "0.1.0",
  };
}

function forkTest(manifest: string, id: string): string {
  return `import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("${manifest} declares ${id}", () => {
  const manifest = JSON.parse(readFileSync(new URL("./${manifest}", import.meta.url), "utf8"));
  assert.equal(manifest.id, "${id}");
  assert.equal(manifest.manifestVersion, 2);
});
`;
}

export interface ForkResult {
  hasComponent: boolean;
  isCapability: boolean;
  label: string;
}

/** Write a fork of `source` into `dir`, which must be free. */
export async function fork(kind: ForkKind, id: string, source: string, dir: string, cwd: string): Promise<ForkResult> {
  const { files, label } = await readSource(kind, source, cwd);
  checkLimits(files);

  const manifestName = MANIFESTS.find((name) => files.has(name));
  if (!manifestName) throw new ForkError(`The source has no manifest (${MANIFESTS.join(", ")}).`);
  let raw: Json;
  try {
    raw = JSON.parse((files.get(manifestName) as Buffer).toString("utf8").replace(BOM, "")) as Json;
  } catch (error) {
    throw new ForkError(`The source's ${manifestName} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const hasComponent = [...files.keys()].some((name) => /^render\.web\.(tsx|jsx|ts|js)$/.test(name));
  files.delete(manifestName);
  for (const name of [...files.keys()]) {
    if (/\.test\.mjs$/.test(name)) files.delete(name);
  }

  const target = NAME_FOR[kind];
  files.set(target, Buffer.from(JSON.stringify(forkManifest(kind, raw, id, hasComponent), null, 2) + "\n"));
  files.set(target.replace(".json", ".test.mjs"), Buffer.from(forkTest(target, id)));

  const note = `> Forked from ${label}. Its licence still applies; see the \`license\` field and any NOTICE file here.\n\n`;
  const readme = files.get("README.md")?.toString("utf8").replace(BOM, "") ?? `# ${title(id)}\n`;
  const [heading, ...rest] = readme.split("\n");
  files.set("README.md", Buffer.from(`${heading}\n\n${note}${rest.join("\n").replace(/^\n+/, "")}`));

  for (const [name, content] of files) {
    const file = path.join(dir, name);
    if (path.relative(dir, file).startsWith("..")) throw new ForkError(`Refusing an unsafe path in the source: ${name}`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return { hasComponent, label, isCapability: raw["kind"] !== "ui" && !raw["attributes"] };
}
