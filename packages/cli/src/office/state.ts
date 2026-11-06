/**
 * Where an office lives in a project: which Kits have one, and their state and map files.
 * The state itself is @blkc-code/agents, and the map is @blkc-code/mapgen.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createFileStore, type AgentStore, type AgentsState } from "@blkc-code/agents";
import { evolveMap, evolveRoads, roomForPath, scanProject, scanTree, type OfficeMap, type ScanOptions, type TreeOptions } from "@blkc-code/mapgen";
import { WorldConfigSchema } from "@blkc-code/core";
import { discover } from "../commands/check.js";

export const STATE_FILE = "office-state.json";
export const MAP_FILE = "office-map.json";
export const WORLD_FILE = "world.json";

/** How this Kit reads the project. A broken file is reported by `blkc check`, and ignored here. */
export function readWorldConfig(kitDir: string): ScanOptions {
  const parsed = WorldConfigSchema.safeParse(readJsonSync(path.join(kitDir, WORLD_FILE)) ?? {});
  if (!parsed.success) return {};
  const { applications, include, ignore } = parsed.data;
  return {
    ...(applications ? { markers: applications.markers, replaceDefaults: applications.replaceDefaults } : {}),
    ...(include ? { include } : {}),
    ...(ignore ? { ignore } : {}),
  };
}

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

/** The top of the repo holding `start`, or `fallback` when it isn't in one. */
export function projectRoot(start: string, fallback = start): string {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(fallback);
    dir = parent;
  }
}

/** The Kit an office command means: the one named, or the only one here. An agent can start anywhere in the repo. */
export async function resolveKit(kit: string | undefined, cwd: string): Promise<string> {
  const top = projectRoot(cwd);
  if (kit) {
    for (const base of [cwd, top]) {
      const dir = path.resolve(base, kit);
      if (findOfficeBlock(dir)) return dir;
    }
    throw new Error(`${kit} is not a Kit with an office Block.`);
  }
  let kits = await findOfficeKits(cwd);
  if (kits.length === 0 && top !== path.resolve(cwd)) kits = await findOfficeKits(top);
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

/** The office's own Kit is never a building. */
const ownKit = (kitDir: string, root: string): string[] => {
  const own = path.relative(root, kitDir).split(path.sep).join("/");
  return own && !own.startsWith("..") ? [own] : [];
};

/** How this Kit reads the project as a tree. */
export function readTreeOptions(kitDir: string | undefined, root: string): TreeOptions {
  if (!kitDir) return {};
  const parsed = WorldConfigSchema.safeParse(readJsonSync(path.join(kitDir, WORLD_FILE)) ?? {});
  const config = parsed.success ? parsed.data : {};
  return {
    ...(config.applications ? { markers: config.applications.markers, replaceDefaults: config.applications.replaceDefaults } : {}),
    ...(config.include ? { include: config.include } : {}),
    ignore: [...(config.ignore ?? []), ...ownKit(kitDir, root)],
    ...(config.roads ? { roads: config.roads } : {}),
    ...(config.fileGroups ? { fileGroups: config.fileGroups } : {}),
    ...(config.partTypes ? { partTypes: config.partTypes } : {}),
  };
}

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
export async function evolveKitMap(kitDir: string, root: string, options: { reset?: boolean; seed?: string } = {}): Promise<{ map: OfficeMap; changes: string[]; wrote: boolean; omitted: number }> {
  const previous = options.reset ? undefined : await readMap(kitDir);
  if (previous && previous.evolve === false) return { map: previous, changes: [], wrote: false, omitted: 0 };
  // New maps grow from the project tree. Older maps keep their layout until they're reset.
  if (!previous || previous.layout === "roads") {
    const tree = scanTree(root, readTreeOptions(kitDir, root));
    const { map, changes } = evolveRoads(previous, tree, options.seed ?? previous?.seed ?? projectSeed(root));
    const same = previous && JSON.stringify(previous) === JSON.stringify(map);
    if (!same) await writeMap(kitDir, map);
    return { map, changes, wrote: !same, omitted: tree.truncated ? 1 : 0 };
  }
  const config = readWorldConfig(kitDir);
  const scan = scanProject(root, { ...config, ignore: [...(config.ignore ?? []), ...ownKit(kitDir, root)] });
  const { map, changes } = evolveMap(previous, scan, options.seed ?? previous?.seed ?? projectSeed(root));
  const same = previous && JSON.stringify(previous) === JSON.stringify(map);
  if (!same) await writeMap(kitDir, map);
  return { map, changes, wrote: !same, omitted: scan.omitted ?? 0 };
}

/** Which room a file is in, given as a path from where the agent is or from the top of the repo. The path is only matched, never stored. */
export async function areaForFile(kitDir: string, root: string, file: string): Promise<string | undefined> {
  const map = await readMap(kitDir);
  if (!map) return undefined;
  const fromHere = path.resolve(file);
  const absolute = existsSync(fromHere) || !existsSync(path.resolve(root, file)) ? fromHere : path.resolve(root, file);
  const relative = path.relative(root, absolute);
  return relative.startsWith("..") ? undefined : roomForPath(map.rooms, relative);
}
