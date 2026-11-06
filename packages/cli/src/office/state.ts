/**
 * Where an office lives in a project: which Kits have one, and their state and map files.
 * The state itself is @blkc-code/agents, and the map is @blkc-code/mapgen.
 */

import { readdirSync, readFileSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createFileStore, type AgentStore, type AgentsState } from "@blkc-code/agents";
import { evolveMap, roomForPath, scanProject, type OfficeMap } from "@blkc-code/mapgen";
import { discover } from "../commands/check.js";

export const STATE_FILE = "office-state.json";
export const MAP_FILE = "office-map.json";

type Json = Record<string, unknown>;

function readJsonSync(file: string): Json | undefined {
  try {
    return JSON.parse(readFileSync(file, "utf8").replace(/^\s+/, "")) as Json;
  } catch {
    return undefined;
  }
}

/** The office Block in a Kit, in kit.json or in its pages folder. */
export function findOfficeBlock(kitDir: string): Json | undefined {
  const kit = readJsonSync(path.join(kitDir, "kit.json"));
  const pages = [...(((kit?.["content"] as Json)?.["pages"] as Json[]) ?? [])];
  try {
    for (const name of readdirSync(path.join(kitDir, "pages"))) {
      const page = name.endsWith(".json") ? readJsonSync(path.join(kitDir, "pages", name)) : undefined;
      if (page) pages.push(page);
    }
  } catch {
    // no pages folder
  }
  for (const page of pages) {
    for (const block of (page["blocks"] as Json[]) ?? []) {
      if (block["block"] === "office") return (block["props"] as Json) ?? {};
    }
  }
  return undefined;
}

/** Every Kit under `root` that has an office. */
export async function findOfficeKits(root: string): Promise<string[]> {
  let files: string[];
  try {
    files = await discover([root]);
  } catch {
    return [];
  }
  return files
    .filter((file) => path.basename(file) === "kit.json")
    .map((file) => path.dirname(file))
    .filter((dir) => findOfficeBlock(dir) !== undefined);
}

/** The Kit an office command means: the one named, or the only one here. */
export async function resolveKit(kit: string | undefined, cwd: string): Promise<string> {
  if (kit) {
    const dir = path.resolve(cwd, kit);
    if (!findOfficeBlock(dir)) throw new Error(`${kit} is not a Kit with an office Block.`);
    return dir;
  }
  const kits = await findOfficeKits(cwd);
  if (kits.length === 0) throw new Error("There is no Kit with an office here. Create one: blkc new kit pixel-office");
  if (kits.length > 1) {
    throw new Error(`More than one Kit has an office. Pick one with --kit: ${kits.map((k) => path.relative(cwd, k)).join(", ")}`);
  }
  return kits[0] as string;
}

/** A Kit's state, starting from the team its office Block describes. */
export const kitStore = (kitDir: string): AgentStore => createFileStore(path.join(kitDir, STATE_FILE), () => findOfficeBlock(kitDir));

export const readOfficeState = (kitDir: string): Promise<AgentsState> => kitStore(kitDir).read();

export const updateOfficeState = (kitDir: string, change: (state: AgentsState) => void): Promise<AgentsState> => kitStore(kitDir).update(change);

/** The project's name is the map's seed, so no two projects get the same building. */
export function projectSeed(root: string): string {
  try {
    const name = (JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as Json)["name"];
    if (typeof name === "string" && name) return name;
  } catch {
    // no package.json
  }
  return path.basename(path.resolve(root));
}

export async function readMap(kitDir: string): Promise<OfficeMap | undefined> {
  try {
    const map = JSON.parse(await readFile(path.join(kitDir, MAP_FILE), "utf8")) as OfficeMap;
    return Array.isArray(map.rooms) ? map : undefined;
  } catch {
    return undefined;
  }
}

export async function writeMap(kitDir: string, map: OfficeMap): Promise<void> {
  const file = path.join(kitDir, MAP_FILE);
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(map, null, 2) + "\n");
  await rename(temp, file);
}

/** Bring a Kit's map up to date with the project. Returns what changed, in words. */
export async function evolveKitMap(kitDir: string, root: string, options: { reset?: boolean; seed?: string } = {}): Promise<{ map: OfficeMap; changes: string[]; wrote: boolean }> {
  const previous = options.reset ? undefined : await readMap(kitDir);
  if (previous && previous.evolve === false) return { map: previous, changes: [], wrote: false };
  const { map, changes } = evolveMap(previous, scanProject(root), options.seed ?? previous?.seed ?? projectSeed(root));
  const same = previous && JSON.stringify(previous) === JSON.stringify(map);
  if (!same) await writeMap(kitDir, map);
  return { map, changes, wrote: !same };
}

/** Which room a file is in. The path is only matched, never stored. */
export async function areaForFile(kitDir: string, root: string, file: string): Promise<string | undefined> {
  const map = await readMap(kitDir);
  if (!map) return undefined;
  const relative = path.isAbsolute(file) ? path.relative(root, file) : file;
  return relative.startsWith("..") ? undefined : roomForPath(map.rooms, relative);
}
