/**
 * Who is working and on what. This knows nothing about any game or renderer: a world can
 * show this state as an office or a kitchen, and a board can show it as cards.
 */

export const AGENT_STATES = ["working", "thinking", "blocked", "reviewing", "idle", "done", "away"] as const;
export const TASK_STATES = ["todo", "doing", "done"] as const;
export type AgentState = (typeof AGENT_STATES)[number];
export type TaskState = (typeof TASK_STATES)[number];

export interface Agent { id: string; name: string; role?: string; state: AgentState; task?: string; area?: string }
export interface Task {
  title: string;
  state: TaskState;
  agent?: string;
  detail?: string;
  /** Who added it. A task from another agent is never handed out automatically. */
  by?: string;
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
    tasks.push(task);
  }
  const stats = (input["stats"] ?? {}) as Json;
  const questsDone = typeof stats["questsDone"] === "number" && stats["questsDone"] >= 0 ? Math.floor(stats["questsDone"] as number) : 0;
  return { agents, tasks, stats: { questsDone } };
}

export function setAgent(state: AgentsState, patch: { id?: string; name?: string; role?: string; state?: string; task?: string }): Agent {
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

export function removeAgent(state: AgentsState, id: string): boolean {
  const before = state.agents.length;
  state.agents = state.agents.filter((a) => a.id !== slug(id));
  return state.agents.length < before;
}

/** A task for this agent: its own first, then one nobody has taken. Tasks another agent wrote wait for a person, even if assigned. */
export function nextTask(state: AgentsState, agentId: string, aliases: string[] = []): Task | undefined {
  const mine = [agentId, ...aliases];
  const trusted = (task: Task): boolean => !task.by || task.by === "user" || mine.includes(task.by);
  return state.tasks.find((task) => task.state === "todo" && task.agent !== undefined && mine.includes(task.agent) && trusted(task))
    ?? state.tasks.find((task) => task.state === "todo" && task.agent === undefined && trusted(task));
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
