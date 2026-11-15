/**
 * Who is working and on what. This knows nothing about any game or renderer: a world can
 * show this state as an office or a kitchen, and a board can show it as cards.
 */

export type LiveAgentState = "idle" | "working" | "blocked" | "done" | "away";

export interface LiveAgent {
  id: string;
  name: string;
  state: LiveAgentState;
  cwd?: string;
  area?: string;
  model?: string;
  lastSeen: string;
  alive: boolean;
  machine?: string;
  space?: string;
}

export interface HerdrBridge {
  available(): boolean;
  listAgents(): Promise<LiveAgent[]>;
  subscribe(callback: (agents: LiveAgent[]) => void): () => void;
}

export const AGENT_STATES = ["working", "thinking", "blocked", "reviewing", "idle", "done", "away"] as const;
export const TASK_STATES = ["todo", "doing", "review", "done"] as const;
export type AgentState = (typeof AGENT_STATES)[number];
export type TaskState = (typeof TASK_STATES)[number];

/** The tasks as a BLKC board, so a board product can show them as cards. */
export const TASK_BOARD = {
  id: "tasks",
  name: "Tasks",
  columns: [{ id: "todo", name: "To do" }, { id: "doing", name: "Doing" }, { id: "review", name: "Review" }, { id: "done", name: "Done" }],
  transitions: [],
} as const;

export interface Agent { id: string; name: string; role?: string; state: AgentState; task?: string; area?: string; /** Model in use, as reported by the agent or its host (e.g. Herdr). Optional. */ model?: string; /** Herdr workspace/space this agent lives in, for context. Optional. */ space?: string; /** Last time this agent reported in. Used to spot ones that look busy but have gone quiet. */ lastSeen?: string }

/** A single entry in the office audit logbook (hash-chained, tamper-evident). */
export interface OfficeLogbookEntry {
  id: string;
  timestamp: string;
  actor: { name: string; role?: string };
  event: string;
  subject?: { type: string; id: string };
  data?: Record<string, unknown>;
  proof?: Record<string, unknown>;
}

/** Minimal logbook interface so the office can record an audit trail without hard-depending on @blkc-code/logbook. */
export interface OfficeLogbook {
  append(input: { actor: { name: string; role?: string }; event: string; subject?: { type: string; id: string }; data?: Record<string, unknown>; proof?: Record<string, unknown> }): Promise<OfficeLogbookEntry>;
  recent(n?: number): Promise<OfficeLogbookEntry[]>;
  verify(): Promise<{ valid: boolean; issues: { index: number; message: string }[] }>;
}
export type TaskKind = "code" | "test" | "validate" | "generic";
export type TaskVerdict = "pending" | "pass" | "fail";

export interface Task {
  title: string;
  state: TaskState;
  agent?: string;
  detail?: string;
  /** Who added it. A task from another agent is never handed out automatically. */
  by?: string;
  /** What kind of work this is, so the right agent role picks it up. */
  kind?: TaskKind;
  /** Agent role required to work this task (e.g. coder, tester, reviewer). */
  role?: string;
  /** Title of the parent task this is a step of. */
  parent?: string;
  /** What must be verified for this task to count as done. */
  verify?: string;
  /** Validation outcome, once a reviewer has checked. */
  verdict?: TaskVerdict;
  /** Evidence from validation (test output summary, screenshot path, etc.). */
  evidence?: string;
}
export interface AgentsState { agents: Agent[]; tasks: Task[]; stats: { questsDone: number } }

const MAX_AGENTS = 40;
const MAX_TASKS = 60;
export const MAX_STATE_BYTES = 256 * 1024;

type Json = Record<string, unknown>;

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? [...value].filter((c) => c >= " " || c === "\t").join("").trim().slice(0, max) : "";

export const slug = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** Whatever came in, from a file or an agent, as something safe to keep and draw. */
export function normalizeState(raw: unknown): AgentsState {
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
    const model = text(item["model"], 60);
    if (model) agent.model = model;
    const space = text(item["space"], 60);
    if (space) agent.space = space;
    const lastSeen = text(item["lastSeen"], 40);
    if (lastSeen && !Number.isNaN(Date.parse(lastSeen))) agent.lastSeen = lastSeen;
    agents.push(agent);
  }
  const tasks: Task[] = [];
  for (const item of Array.isArray(input["tasks"]) ? (input["tasks"] as Json[]) : []) {
    const title = text(item?.["title"], 80);
    if (!title || tasks.length >= MAX_TASKS) continue;
    const task: Task = { title, state: TASK_STATES.includes(item["state"] as TaskState) ? (item["state"] as TaskState) : "todo" };
    const agent = slug(text(item["agent"], 60));
    if (agent) task.agent = agent;
    const detail = typeof item["detail"] === "string" ? (item["detail"] as string).split("\n").map((line) => text(line, 1000)).join("\n").trim().slice(0, 1000) : "";
    if (detail) task.detail = detail;
    const by = text(item["by"], 60);
    if (by) task.by = by;
    const kind = text(item["kind"], 20);
    if (kind === "code" || kind === "test" || kind === "validate" || kind === "generic") task.kind = kind as TaskKind;
    const role = text(item["role"], 40);
    if (role) task.role = role;
    const parent = text(item["parent"], 80);
    if (parent) task.parent = parent;
    const verify = typeof item["verify"] === "string" ? (item["verify"] as string).trim().slice(0, 500) : "";
    if (verify) task.verify = verify;
    const verdict = text(item["verdict"], 20);
    if (verdict === "pending" || verdict === "pass" || verdict === "fail") task.verdict = verdict as TaskVerdict;
    const evidence = typeof item["evidence"] === "string" ? (item["evidence"] as string).split("\n").map((line) => text(line, 500)).join("\n").trim().slice(0, 2000) : "";
    if (evidence) task.evidence = evidence;
    tasks.push(task);
  }
  const stats = (input["stats"] ?? {}) as Json;
  const questsDone = typeof stats["questsDone"] === "number" && stats["questsDone"] >= 0 ? Math.floor(stats["questsDone"] as number) : 0;
  return { agents, tasks, stats: { questsDone } };
}

export function setAgent(state: AgentsState, patch: { id?: string; name?: string; role?: string; state?: string; task?: string; model?: string; space?: string }): Agent {
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
  if (patch.model !== undefined) agent.model = patch.model;
  if (patch.space !== undefined) agent.space = patch.space;
  agent.lastSeen = new Date().toISOString();
  return agent;
}

/** How long an agent can stay quiet before it is assumed away (15 minutes). */
export const STALE_AFTER_MS = 15 * 60 * 1000;

/** Mark agents that look busy but have gone quiet as "away". Mutates and returns the state. */
export function sweepStale(state: AgentsState, now: number = Date.now()): AgentsState {
  const nowIso = new Date(now).toISOString();
  for (const agent of state.agents) {
    if (!agent.lastSeen) {
      // Legacy entry with no timestamp: give it one grace window before we judge it.
      agent.lastSeen = nowIso;
      continue;
    }
    const seen = Date.parse(agent.lastSeen);
    if (Number.isNaN(seen)) { agent.lastSeen = nowIso; continue; }
    if (now - seen <= STALE_AFTER_MS) continue;
    if (agent.state === "working" || agent.state === "thinking" || agent.state === "blocked" || agent.state === "reviewing") {
      agent.state = "away";
    }
  }
  return state;
}

export function removeAgent(state: AgentsState, id: string): boolean {
  const before = state.agents.length;
  state.agents = state.agents.filter((a) => a.id !== slug(id));
  return state.agents.length < before;
}

/** A task for this agent: its own first, then one nobody has taken. Tasks another agent wrote wait for a person, even if assigned. */
/** A task is claimable only when its parent (if any) is far enough along to hand off. */
function parentReady(state: AgentsState, task: Task): boolean {
  if (!task.parent) return true;
  const parent = state.tasks.find((t) => t.title === task.parent);
  // Unknown parent: don't block forever, but don't claim a child of missing work either.
  if (!parent) return true;
  return parent.state === "review" || parent.state === "done";
}

export function nextTask(state: AgentsState, agentId: string, aliases: string[] = [], role?: string): Task | undefined {
  const mine = [agentId, ...aliases];
  const trusted = (task: Task): boolean => !task.by || task.by === "user" || mine.includes(task.by);
  const roleOk = (task: Task): boolean => !task.role || !role || task.role === role;
  const ready = (task: Task): boolean => task.state === "todo" && parentReady(state, task);
  return state.tasks.find((task) => ready(task) && task.agent !== undefined && mine.includes(task.agent) && trusted(task) && roleOk(task))
    ?? state.tasks.find((task) => ready(task) && task.agent === undefined && trusted(task) && roleOk(task));
}

export type AgentEvent =
  | { type: "agent.blocked"; agent: Agent }
  | { type: "agent.finished"; agent: Agent }
  | { type: "agent.joined"; agent: Agent }
  | { type: "agent.left"; agent: Agent }
  | { type: "task.finished"; task: Task };

/**
 * What happened between two states of the office. Alerts read this today; a Logbook, webhooks
 * or a game can read the same events later.
 */
export function diffEvents(before: AgentsState | undefined, after: AgentsState): AgentEvent[] {
  if (!before) return [];
  const events: AgentEvent[] = [];
  for (const agent of after.agents) {
    const was = before.agents.find((a) => a.id === agent.id);
    if (!was) events.push({ type: "agent.joined", agent });
    if (was?.state === agent.state) continue;
    if (agent.state === "blocked") events.push({ type: "agent.blocked", agent });
    if (was && agent.state === "done") events.push({ type: "agent.finished", agent });
  }
  for (const agent of before.agents) {
    if (!after.agents.some((a) => a.id === agent.id)) events.push({ type: "agent.left", agent });
  }
  const wasDone = new Set(before.tasks.filter((task) => task.state === "done").map((task) => task.title));
  for (const task of after.tasks) {
    if (task.state === "done" && !wasDone.has(task.title)) events.push({ type: "task.finished", task });
  }
  return events;
}

/**
 * Merge Herdr's live agent layer onto a base office state.
 *
 * Herdr is the authority on liveness and semantic state (idle/working/blocked/done/away)
 * for the panes it manages. The office remains the authority on tasks, quests, task text,
 * and any area a user set explicitly. This function overlays Herdr's state onto matching
 * agents and adds panes Herdr knows about but the office doesn't, without touching tasks
 * or stats. Areas are only filled in when the office agent has none, so an explicit
 * --file room choice wins over the cwd-derived one.
 */
export function mergeLiveAgents(base: AgentsState, live: LiveAgent[]): AgentsState {
  const next: AgentsState = {
    agents: base.agents.map((agent) => ({ ...agent })),
    tasks: base.tasks.map((task) => ({ ...task })),
    stats: { questsDone: base.stats.questsDone },
  };
  const liveById = new Map(live.map((entry) => [entry.id, entry]));

  for (const agent of next.agents) {
    const entry = liveById.get(agent.id);
    if (!entry) continue;
    agent.state = entry.alive ? entry.state : "away";
    if (entry.model) agent.model = entry.model;
    if (entry.space) agent.space = entry.space;
    if (entry.area && !agent.area) agent.area = entry.area;
    if (entry.lastSeen) agent.lastSeen = entry.lastSeen;
  }

  for (const entry of live) {
    if (next.agents.some((agent) => agent.id === entry.id)) continue;
    if (next.agents.length >= 40) break;
    const agent: Agent = { id: entry.id, name: entry.name, state: entry.alive ? entry.state : "away" };
    if (entry.area) agent.area = entry.area;
    if (entry.model) agent.model = entry.model;
    if (entry.space) agent.space = entry.space;
    if (entry.lastSeen) agent.lastSeen = entry.lastSeen;
    next.agents.push(agent);
  }

  return next;
}
