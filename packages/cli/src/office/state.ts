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

export const AGENT_STATES = ["working", "thinking", "blocked", "reviewing", "idle", "done", "away"] as const;
export const TASK_STATES = ["todo", "doing", "done"] as const;
export type AgentState = (typeof AGENT_STATES)[number];
export type TaskState = (typeof TASK_STATES)[number];

export interface Agent { id: string; name: string; role?: string; state: AgentState; task?: string }
export interface Quest { title: string; state: TaskState; agent?: string }
export interface OfficeState { agents: Agent[]; tasks: Quest[] }

export const STATE_FILE = "office-state.json";
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
    agents.push(agent);
  }
  const tasks: Quest[] = [];
  for (const item of Array.isArray(input["tasks"]) ? (input["tasks"] as Json[]) : []) {
    const title = text(item?.["title"], 80);
    if (!title || tasks.length >= MAX_TASKS) continue;
    const quest: Quest = { title, state: TASK_STATES.includes(item["state"] as TaskState) ? (item["state"] as TaskState) : "todo" };
    const agent = slug(text(item["agent"], 60));
    if (agent) quest.agent = agent;
    tasks.push(quest);
  }
  return { agents, tasks };
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
    change(state);
    const next = normalizeState(state);
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
