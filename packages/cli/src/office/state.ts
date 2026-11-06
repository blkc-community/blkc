/**
 * The office's live state: who is here, what they are doing, and the quests. It lives in
 * office-state.json beside a Kit. The app, the MCP server, `blkc office set` and the hooks
 * all go through this file, so any agent can take part and nothing needs a server running.
 */

import { Buffer } from "node:buffer";
import { readdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { discover } from "../commands/check.js";
import { evolveMap, roomForPath, scanProject, type OfficeMap } from "./mapgen.js";

export const AGENT_STATES = ["working", "thinking", "blocked", "reviewing", "idle", "done", "away"] as const;
export const TASK_STATES = ["todo", "doing", "done"] as const;
export type AgentState = (typeof AGENT_STATES)[number];
export type TaskState = (typeof TASK_STATES)[number];

export interface Agent { id: string; name: string; role?: string; state: AgentState; task?: string; area?: string }
export interface Quest {
  title: string;
  state: TaskState;
  agent?: string;
  detail?: string;
  /** Who added it. A quest from another agent is never handed out automatically. */
  by?: string;
}
export interface OfficeState { agents: Agent[]; tasks: Quest[]; stats: { questsDone: number } }

export const STATE_FILE = "office-state.json";
export const MAP_FILE = "office-map.json";
const MAX_AGENTS = 40;
const MAX_TASKS = 60;
export const MAX_STATE_BYTES = 256 * 1024;
const LOCK_STALE_MS = 5000;

type Json = Record<string, unknown>;

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? [...value].filter((c) => c >= " " || c === "\t").join("").trim().slice(0, max) : "";

export const slug = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** Whatever came in, from a file or an agent, as something safe to keep and draw. */
export function normalizeState(raw: unknown): OfficeState {
  const input = (raw ?? {}) as Json;
  const seen = new Set<string>();
  const agents: Agent[] = [];
  for (const item of Array.isArray(input["agents"]) ? (input["agents"] as Json[]) : []) {
    const id = slug(text(item?.["id"], 60) || text(item?.["name"], 60));
    if (!id || seen.has(id) || agents.length >= MAX_AGENTS) continue;
    seen.add(id);
    const state = AGENT_STATES.includes(item["state"] as AgentState) ? (item["state"] as AgentState) : "idle";
    const agent: Agent = { id, name: text(item["name"], 24) || id, state };
    const role = text(item["role"], 40);
    const task = text(item["task"], 120);
    if (role) agent.role = role;
    if (task) agent.task = task;
    const area = text(item["area"], 60);
    if (area) agent.area = area;
    agents.push(agent);
  }
  const tasks: Quest[] = [];
  for (const item of Array.isArray(input["tasks"]) ? (input["tasks"] as Json[]) : []) {
    const title = text(item?.["title"], 80);
    if (!title || tasks.length >= MAX_TASKS) continue;
    const quest: Quest = { title, state: TASK_STATES.includes(item["state"] as TaskState) ? (item["state"] as TaskState) : "todo" };
    const agent = slug(text(item["agent"], 60));
    if (agent) quest.agent = agent;
    const detail = typeof item["detail"] === "string" ? (item["detail"] as string).split("\n").map((line) => text(line, 1000)).join("\n").trim().slice(0, 1000) : "";
    if (detail) quest.detail = detail;
    const by = text(item["by"], 60);
    if (by) quest.by = by;
    tasks.push(quest);
  }
  const stats = (input["stats"] ?? {}) as Json;
  const questsDone = typeof stats["questsDone"] === "number" && stats["questsDone"] >= 0 ? Math.floor(stats["questsDone"] as number) : 0;
  return { agents, tasks, stats: { questsDone } };
}

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

export async function readOfficeState(kitDir: string): Promise<OfficeState> {
  try {
    const content = await readFile(path.join(kitDir, STATE_FILE), "utf8");
    return normalizeState(JSON.parse(content));
  } catch {
    return normalizeState(findOfficeBlock(kitDir));
  }
}

/** Several agents can write at once, so changes go one at a time, and a write is all or nothing. */
export async function updateOfficeState(kitDir: string, change: (state: OfficeState) => void): Promise<OfficeState> {
  const file = path.join(kitDir, STATE_FILE);
  const lock = `${file}.lock`;
  let held = false;
  for (let attempt = 0; attempt < 80 && !held; attempt++) {
    try {
      await mkdir(lock);
      held = true;
    } catch {
      try {
        // Whoever held this crashed.
        if (Date.now() - (await stat(lock)).mtimeMs > LOCK_STALE_MS) await rmdir(lock);
      } catch {
        // gone already
      }
      await wait(25);
    }
  }
  if (!held) throw new Error("The office is busy. Try again.");
  try {
    const state = await readOfficeState(kitDir);
    const wasDone = new Set(state.tasks.filter((task) => task.state === "done").map((task) => task.title));
    change(state);
    const next = normalizeState(state);
    // Progress counts every quest ever finished, so deleting one doesn't lose it.
    next.stats.questsDone += next.tasks.filter((task) => task.state === "done" && !wasDone.has(task.title)).length;
    const body = JSON.stringify(next, null, 2) + "\n";
    if (Buffer.byteLength(body) > MAX_STATE_BYTES) throw new Error("The office state is too large.");
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, body);
    try {
      await rename(temp, file);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
    return next;
  } finally {
    await rmdir(lock).catch(() => undefined);
  }
}

export function setAgent(state: OfficeState, patch: { id?: string; name?: string; role?: string; state?: string; task?: string }): Agent {
  const id = slug(patch.id || patch.name || "");
  if (!id) throw new Error("An agent needs an id or a name.");
  let agent = state.agents.find((a) => a.id === id);
  if (!agent) {
    agent = { id, name: patch.name || patch.id || id, state: "idle" };
    state.agents.push(agent);
  }
  if (patch.name) agent.name = patch.name;
  if (patch.role !== undefined) agent.role = patch.role;
  if (patch.state !== undefined) {
    if (!AGENT_STATES.includes(patch.state as AgentState)) throw new Error(`State must be one of: ${AGENT_STATES.join(", ")}`);
    agent.state = patch.state as AgentState;
  }
  if (patch.task !== undefined) agent.task = patch.task;
  return agent;
}

export function removeAgent(state: OfficeState, id: string): boolean {
  const before = state.agents.length;
  state.agents = state.agents.filter((a) => a.id !== slug(id));
  return state.agents.length < before;
}

/** A quest for this agent: its own first, then one nobody has taken. Quests from other agents wait for a person. */
export function nextQuest(state: OfficeState, agentId: string, aliases: string[] = []): Quest | undefined {
  const mine = [agentId, ...aliases];
  const trusted = (quest: Quest): boolean => !quest.by || quest.by === "user";
  return state.tasks.find((quest) => quest.state === "todo" && quest.agent !== undefined && mine.includes(quest.agent))
    ?? state.tasks.find((quest) => quest.state === "todo" && quest.agent === undefined && trusted(quest));
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
