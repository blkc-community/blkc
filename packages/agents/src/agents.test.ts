import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentServer, createFileStore, diffEvents, nextTask, normalizeState, setAgent, type AgentStore, type AgentsState } from "./index.js";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "blkc-agents-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const state = (patch: Partial<AgentsState>): AgentsState => normalizeState(patch);

describe("normalizeState", () => {
  it("keeps what is safe and drops the rest", () => {
    const clean = normalizeState({
      agents: [{ name: "Ada\u0007 Lovelace", state: "flying" }, { name: "ada lovelace" }, { name: "" }],
      tasks: [{ title: "Ship", state: "nope" }, { title: "" }],
      stats: { questsDone: -3 },
    });
    expect(clean.agents).toEqual([{ id: "ada-lovelace", name: "Ada Lovelace", state: "idle" }]);
    expect(clean.tasks).toEqual([{ title: "Ship", state: "todo" }]);
    expect(clean.stats.questsDone).toBe(0);
  });

  it("survives input that isn't an object", () => {
    for (const bad of [null, undefined, 7, "x", []]) expect(normalizeState(bad).agents).toEqual([]);
  });
});

describe("nextTask", () => {
  it("prefers the agent's own task, and never hands out one from another agent", () => {
    const office = state({ tasks: [
      { title: "From a peer", state: "todo", by: "mallory" },
      { title: "Open", state: "todo" },
      { title: "Mine", state: "todo", agent: "ada" },
    ] });
    expect(nextTask(office, "ada")?.title).toBe("Mine");
    expect(nextTask(office, "grace")?.title).toBe("Open");
    office.tasks = office.tasks.filter((task) => task.title === "From a peer");
    expect(nextTask(office, "grace")).toBeUndefined();
  });
});

describe("nextTask and who wrote a task", () => {
  it("doesn't hand over a task another agent assigned", () => {
    const office = state({ tasks: [{ title: "Do this", state: "todo", agent: "ada", by: "mallory" }] });
    expect(nextTask(office, "ada")).toBeUndefined();
  });

  it("hands over tasks from the user, and an agent's own", () => {
    const office = state({ tasks: [{ title: "Own", state: "todo", agent: "ada", by: "ada" }, { title: "User", state: "todo", agent: "grace", by: "user" }] });
    expect(nextTask(office, "ada")?.title).toBe("Own");
    expect(nextTask(office, "grace")?.title).toBe("User");
  });
});

describe("diffEvents", () => {
  it("has nothing to say the first time", () => {
    expect(diffEvents(undefined, state({ agents: [{ id: "a", name: "A", state: "blocked" }] }))).toEqual([]);
  });

  it("reports joins, blocks, finishes, departures and finished tasks", () => {
    const before = state({
      agents: [{ id: "a", name: "A", state: "working" }, { id: "b", name: "B", state: "working" }, { id: "c", name: "C", state: "idle" }],
      tasks: [{ title: "T", state: "doing" }],
    });
    const after = state({
      agents: [{ id: "a", name: "A", state: "blocked" }, { id: "b", name: "B", state: "done" }, { id: "d", name: "D", state: "idle" }],
      tasks: [{ title: "T", state: "done" }],
    });
    expect(diffEvents(before, after).map((event) => event.type)).toEqual(["agent.blocked", "agent.finished", "agent.joined", "agent.left", "task.finished"]);
  });

  it("doesn't repeat a state that hasn't changed", () => {
    const same = state({ agents: [{ id: "a", name: "A", state: "blocked" }] });
    expect(diffEvents(same, same)).toEqual([]);
  });
});

describe("createFileStore", () => {
  it("starts from the fallback, then from the file", async () => {
    const file = path.join(dir, "state.json");
    const store = createFileStore(file, () => ({ agents: [{ name: "Sample" }] }));
    expect((await store.read()).agents[0]?.name).toBe("Sample");
    await store.update((s) => { s.agents = []; });
    expect((await store.read()).agents).toEqual([]);
  });

  it("loses nothing when many writers arrive at once", async () => {
    const store = createFileStore(path.join(dir, "state.json"));
    await Promise.all(Array.from({ length: 25 }, (_, i) => store.update((s) => { setAgent(s, { name: `agent ${i}` }); })));
    expect((await store.read()).agents).toHaveLength(25);
  });

  it("counts each finished task once, even after it is deleted", async () => {
    const store = createFileStore(path.join(dir, "state.json"));
    await store.update((s) => { s.tasks.push({ title: "T", state: "done" }); });
    await store.update((s) => { s.tasks = []; });
    expect((await store.read()).stats.questsDone).toBe(1);
  });
});

describe("the MCP server", () => {
  /** Not a file: this is what a hosted product would supply. */
  function memoryStore(): AgentStore {
    let current = normalizeState({});
    return {
      read: async () => current,
      update: async (change) => {
        const next = normalizeState(current);
        change(next);
        current = normalizeState(next);
        return current;
      },
    };
  }

  it("runs on any store, not only a file", async () => {
    const store = memoryStore();
    const server = createAgentServer(store, { version: "0.0.0" });
    const client = new Client({ name: "test", version: "0.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);

    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    expect(tools).toContain("office_status");
    await client.callTool({ name: "office_status", arguments: { agent: "Ada", state: "working" } });
    const after = await store.read();
    expect(after.agents[0]).toMatchObject({ id: "ada", state: "working" });
    await client.close();
  });
});
