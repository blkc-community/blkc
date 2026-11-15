/**
 * BLKC Herdr bridge: an optional live agent layer powered by Herdr.
 *
 * Herdr (https://github.com/herdrdev/herdr) is a terminal multiplexer built for coding
 * agents. When it is running and an office agent runs inside one of its panes, Herdr knows
 * the pane's real semantic state, foreground working directory, terminal title and
 * metadata tokens. None of that requires the agent to call office_status.
 *
 * This package is deliberately optional and defensive: if Herdr is not installed, not
 * running, or its output changes shape, the bridge reports unavailable and the office
 * behaves exactly as it did before. Herdr is never a hard dependency.
 *
 * Types (LiveAgent, LiveAgentState, HerdrBridge) come from @blkc-code/agents so that
 * BLKC's core stays free of any Herdr dependency.
 */

import { spawnSync } from "node:child_process";
import type { HerdrBridge, LiveAgent, LiveAgentState } from "@blkc-code/agents";

export type { HerdrBridge, LiveAgent, LiveAgentState } from "@blkc-code/agents";

export interface HerdrBridgeOptions {
  run?: (args: string[]) => { status: number; stdout: string; stderr: string };
  pollMs?: number;
  areaForCwd?: (cwd: string) => string | undefined | Promise<string | undefined>;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_POLL_MS = 2000;

function defaultRun(args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("herdr", args, { encoding: "utf8", timeout: 5000 });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toState(value: unknown): LiveAgentState {
  const v = typeof value === "string" ? value.toLowerCase() : "";
  if (v === "working" || v === "blocked" || v === "done" || v === "idle" || v === "away") return v;
  return "idle";
}

async function parseAgents(json: unknown, areaForCwd?: (cwd: string) => string | undefined | Promise<string | undefined>): Promise<LiveAgent[]> {
  let items: unknown[] = [];
  if (Array.isArray(json)) items = json;
  else if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj["panes"])) items = obj["panes"] as unknown[];
    else if (Array.isArray(obj["agents"])) items = obj["agents"] as unknown[];
    else if (Array.isArray(obj["items"])) items = obj["items"] as unknown[];
  }

  const now = new Date().toISOString();
  const out: LiveAgent[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;

    const label =
      text(item["agent"], 24) ||
      text(item["agent_name"], 24) ||
      text(item["name"], 24) ||
      text(item["display_agent"], 24);
    if (!label) continue;

    const id = slug(label);
    if (!id || seen.has(id) || out.length >= 40) continue;
    seen.add(id);

    const state = toState(item["agent_status"] ?? item["state"] ?? item["status"]);

    let cwd: string | undefined;
    const fc = item["foreground_cwd"] ?? item["cwd"];
    if (typeof fc === "string" && fc.trim()) cwd = fc.trim();
    else if (item["process"] && typeof item["process"] === "object") {
      const p = item["process"] as Record<string, unknown>;
      if (typeof p["cwd"] === "string" && p["cwd"].trim()) cwd = p["cwd"].trim();
    }

    let model: string | undefined;
    const tokens = item["tokens"];
    if (tokens && typeof tokens === "object") {
      const t = tokens as Record<string, unknown>;
      const m = t["model"];
      if (typeof m === "string" && m.trim()) model = m.trim().slice(0, 60);
    }
    if (!model) {
      const m = item["model"];
      if (typeof m === "string" && m.trim()) model = m.trim().slice(0, 60);
    }

    const alive =
      item["exited"] !== true &&
      item["closed"] !== true &&
      item["alive"] !== false;

    const machine = text(item["machine"], 40) || text(item["host"], 40) || undefined;

    const space =
      text(item["workspace"], 40) ||
      text(item["workspace_id"], 40) ||
      text(item["space"], 40) ||
      text(item["space_id"], 40) ||
      undefined;

    const live: LiveAgent = {
      id,
      name: label,
      state: alive ? state : "away",
      lastSeen: now,
      alive,
    };
    if (cwd) live.cwd = cwd;
    if (model) live.model = model;
    if (machine) live.machine = machine;
    if (space) live.space = space;
    if (cwd && areaForCwd) {
      const area = await areaForCwd(cwd);
      if (area) live.area = area;
    }
    out.push(live);
  }
  return out;
}

export function createHerdrBridge(options: HerdrBridgeOptions = {}): HerdrBridge {
  const run = options.run ?? defaultRun;
  const env = options.env ?? process.env;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const areaForCwd = options.areaForCwd;

  let availableCache: boolean | undefined;

  const available = (): boolean => {
    if (availableCache !== undefined) return availableCache;
    if (env["HERDR_ENV"] === "1") { availableCache = true; return true; }
    if (env["HERDR_SOCKET_PATH"]) { availableCache = true; return true; }
    const result = run(["--version"]);
    availableCache = result.status === 0;
    return availableCache;
  };

  const fetchJson = (args: string[]): unknown | null => {
    if (!available()) return null;
    const result = run(args);
    if (result.status !== 0) return null;
    try { return JSON.parse(result.stdout); } catch { return null; }
  };

  const listAgents = async (): Promise<LiveAgent[]> => {
    if (!available()) return [];
    const paneJson = fetchJson(["pane", "list", "--json"]);
    if (paneJson !== null) {
      const parsed = await parseAgents(paneJson, areaForCwd);
      if (parsed.length > 0) return parsed;
    }
    const agentJson = fetchJson(["agent", "list", "--json"]);
    if (agentJson !== null) {
      const parsed = await parseAgents(agentJson, areaForCwd);
      if (parsed.length > 0) return parsed;
    }
    return [];
  };

  const subscribe = (callback: (agents: LiveAgent[]) => void): (() => void) => {
    if (!available()) { callback([]); return () => undefined; }
    let stopped = false;
    const tick = async (): Promise<void> => {
      if (stopped) return;
      try {
        const agents = await listAgents();
        if (!stopped) callback(agents);
      } catch {
        if (!stopped) callback([]);
      }
    };
    void tick();
    const timer = setInterval(() => { void tick(); }, pollMs);
    return () => { stopped = true; clearInterval(timer); };
  };

  return { available, listAgents, subscribe };
}