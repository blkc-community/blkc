/* global fetch, TextDecoder */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const CLI = path.join(fileURLToPath(new URL("../..", import.meta.url)), "dist", "blkc.cjs");
const STATE = "kits/pixel-office/office-state.json";

let dir: string;
let child: ChildProcess | undefined;
let client: Client | undefined;

function blkc(...args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}
const json = (file: string) => JSON.parse(readFileSync(path.join(dir, file), "utf8"));

beforeEach(() => {
  dir = realpathSync(mkdtempSync(path.join(tmpdir(), "blkc-office-")));
  blkc("new", "kit", "pixel-office");
});
afterEach(async () => {
  await client?.close();
  client = undefined;
  child?.kill();
  child = undefined;
  rmSync(dir, { recursive: true, force: true });
});

async function connectMcp(name = "Some Agent"): Promise<Client> {
  const transport = new StdioClientTransport({ command: process.execPath, args: [CLI, "office", "mcp"], cwd: dir, stderr: "ignore" });
  const connected = new Client({ name, version: "1.0.0" });
  await connected.connect(transport);
  client = connected;
  return connected;
}
const call = async (c: Client, name: string, args: Record<string, unknown> = {}) =>
  (await c.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };

describe("the MCP server", () => {
  it("lists its tools and tells agents what to do, including about secrets", async () => {
    const c = await connectMcp();
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["office_add_quest", "office_finish_quest", "office_leave", "office_next_quest", "office_status", "office_update_quest", "office_view"]);
    expect(c.getInstructions()).toContain("secrets");
  });

  it("works for any client: it joins under the client's own name, and leaves", async () => {
    const c = await connectMcp("Codex CLI");
    expect((await call(c, "office_status", { state: "working", task: "Building it" })).isError).toBeFalsy();
    const agent = json(STATE).agents.find((a: { id: string }) => a.id === "codex-cli");
    expect(agent).toMatchObject({ name: "Codex CLI", state: "working", task: "Building it" });
    await call(c, "office_leave");
    expect(json(STATE).agents.find((a: { id: string }) => a.id === "codex-cli")).toBeUndefined();
  });

  it("lets helpers report under their own names", async () => {
    const c = await connectMcp();
    await call(c, "office_status", { state: "thinking", agent: "Scout", role: "Researcher" });
    expect(json(STATE).agents.find((a: { id: string }) => a.id === "scout")).toMatchObject({ role: "Researcher", state: "thinking" });
  });

  it("refuses a state that doesn't exist", async () => {
    const c = await connectMcp();
    const result = await call(c, "office_status", { state: "dancing" }).catch((error: Error) => ({ isError: true, content: [{ text: error.message }] }));
    expect(result.isError).toBe(true);
  });

  it("works the quest board, by title or number, and says when one doesn't exist", async () => {
    const c = await connectMcp();
    await call(c, "office_add_quest", { title: "Ship it" });
    await call(c, "office_update_quest", { quest: "ship it", state: "doing", agent: "Nova" });
    const tasks = json(STATE).tasks as { title: string; state: string; agent?: string }[];
    expect(tasks.find((t) => t.title === "Ship it")).toMatchObject({ title: "Ship it", state: "doing", agent: "nova" });
    await call(c, "office_update_quest", { quest: "1", state: "done" });
    expect(json(STATE).tasks[0].state).toBe("done");
    const missing = await call(c, "office_update_quest", { quest: "Nope", state: "done" });
    expect(missing.isError).toBe(true);
    expect(missing.content[0]!.text).toContain("office_view");
    expect(JSON.parse((await call(c, "office_view")).content[0]!.text).tasks.length).toBe(tasks.length);
  });

  it("explains itself when there is no office here", () => {
    rmSync(path.join(dir, "kits"), { recursive: true });
    const r = blkc("office", "mcp");
    expect(r.code).toBe(1);
    expect(r.out).toContain("new kit pixel-office");
  });
});

describe("blkc office set", () => {
  it("works from anything that can run a command, and validates the state", () => {
    expect(blkc("office", "set", "My Agent", "blocked", "--task", "Needs a key").code).toBe(0);
    expect(json(STATE).agents.find((a: { id: string }) => a.id === "my-agent")).toMatchObject({ state: "blocked", task: "Needs a key" });
    expect(blkc("office", "set", "My Agent", "dancing").code).toBe(1);
    expect(blkc("office", "remove", "My Agent").code).toBe(0);
    expect(json(STATE).agents.find((a: { id: string }) => a.id === "my-agent")).toBeUndefined();
  });

  it("loses nothing when many agents write at once", async () => {
    const runs = Array.from({ length: 12 }, (_, i) => new Promise<number | null>((resolve) => {
      spawn(process.execPath, [CLI, "office", "set", `Agent ${i}`, "working"], { cwd: dir }).on("close", resolve);
    }));
    expect(new Set(await Promise.all(runs))).toEqual(new Set([0]));
    const ids = json(STATE).agents.map((a: { id: string }) => a.id);
    for (let i = 0; i < 12; i++) expect(ids).toContain(`agent-${i}`);
    expect(existsSync(path.join(dir, `${STATE}.lock`))).toBe(false);
  });

  it("drops control characters and overlong text, and keeps the file valid", () => {
    blkc("office", "set", "Odd", "working", "--task", `a\u0007b${"x".repeat(500)}`);
    const task = json(STATE).agents.find((a: { id: string }) => a.id === "odd").task as string;
    expect(task.startsWith("ab")).toBe(true);
    expect(task.length).toBeLessThanOrEqual(120);
  });
});

describe("blkc office connect", () => {
  const SERVER = "blkc-office";

  it.each([
    ["claude", ".mcp.json", "mcpServers", "kits/pixel-office"],
    ["cursor", ".cursor/mcp.json", "mcpServers", "${workspaceFolder}/kits/pixel-office"],
    ["vscode", ".vscode/mcp.json", "servers", "${workspaceFolder}/kits/pixel-office"],
    ["gemini", ".gemini/settings.json", "mcpServers", "kits/pixel-office"],
  ])("%s: writes a server into %s, and disconnect removes it", (agent, file, key, kit) => {
    expect(blkc("office", "connect", agent).code).toBe(0);
    const server = json(file)[key][SERVER];
    expect(server.command).toBe("npx");
    expect(server.args).toContain("@blkc-code/cli@latest");
    expect(server.args).toContain(kit);
    expect(blkc("office", "disconnect", agent).code).toBe(0);
    expect(json(file)[key][SERVER]).toBeUndefined();
  });

  it("prints what to do for agents whose settings aren't in the project", () => {
    const codex = blkc("office", "connect", "codex");
    expect(codex.out).toContain("codex mcp add blkc-office");
    const other = blkc("office", "connect");
    expect(other.out).toContain("office set");
    expect(other.out).toContain('"command": "npx"');
    expect(existsSync(path.join(dir, ".mcp.json"))).toBe(false);
    expect(blkc("office", "connect", "nonsense").code).toBe(1);
  });

  it("keeps everything else in the user's settings", () => {
    mkdirSync(path.join(dir, ".claude"));
    const mine = { type: "command", command: "my-own-hook.sh" };
    writeFileSync(path.join(dir, ".claude/settings.local.json"), JSON.stringify({ model: "x", hooks: { PreToolUse: [{ matcher: "Bash", hooks: [mine] }] } }));
    writeFileSync(path.join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "keep-me" } } }));
    blkc("office", "connect", "claude");
    const settings = json(".claude/settings.local.json");
    expect(settings.model).toBe("x");
    expect(settings.hooks.PreToolUse).toHaveLength(2);
    expect(settings.hooks.PreToolUse[1].hooks[0].async).toBe(true);
    expect(json(".mcp.json").mcpServers.other.command).toBe("keep-me");

    blkc("office", "connect", "claude"); // twice must not add it twice
    expect(json(".claude/settings.local.json").hooks.PreToolUse).toHaveLength(2);

    blkc("office", "disconnect", "claude");
    const after = json(".claude/settings.local.json");
    expect(after.model).toBe("x");
    expect(after.hooks).toEqual({ PreToolUse: [{ matcher: "Bash", hooks: [mine] }] });
    expect(existsSync(path.join(dir, ".blkc/office-hook.mjs"))).toBe(false);
  });

  it("won't overwrite settings it can't read", () => {
    writeFileSync(path.join(dir, ".mcp.json"), "// a comment\n{ }");
    const r = blkc("office", "connect", "claude");
    expect(r.code).toBe(1);
    expect(readFileSync(path.join(dir, ".mcp.json"), "utf8")).toContain("a comment");
  });

  it("starts with an empty office, but keeps one already in use", () => {
    blkc("office", "connect", "cursor");
    expect(json(STATE)).toEqual({ agents: [], tasks: [], stats: { questsDone: 0 } });
    blkc("office", "set", "Keep", "working");
    blkc("office", "connect", "gemini");
    expect(json(STATE).agents).toHaveLength(1);
  });

  it("leaves hooks off when asked", () => {
    blkc("office", "connect", "claude", "--no-hooks");
    expect(existsSync(path.join(dir, ".blkc/office-hook.mjs"))).toBe(false);
    expect(existsSync(path.join(dir, ".claude/settings.local.json"))).toBe(false);
  });
});

describe("the Claude Code hook script", () => {
  const fire = (event: Record<string, unknown>, input?: string) => {
    const r = spawnSync(process.execPath, [path.join(dir, ".blkc/office-hook.mjs")], {
      input: input ?? JSON.stringify({ session_id: "abcd1234efgh", cwd: dir, ...event }),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  const claude = () => json(STATE).agents.find((a: { id: string }) => a.id === "claude-abcd1234");

  beforeEach(() => {
    blkc("office", "connect", "claude");
  });

  it("follows a session from start to finish", () => {
    fire({ hook_event_name: "SessionStart", source: "startup" });
    expect(claude()).toMatchObject({ name: "Claude", state: "idle" });
    fire({ hook_event_name: "UserPromptSubmit", prompt: "my private idea" });
    expect(claude().state).toBe("thinking");
    fire({ hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "/home/me/secret-project/app.ts", old_string: "password", new_string: "x" } });
    expect(claude()).toMatchObject({ state: "working", task: "Editing app.ts" });
    fire({ hook_event_name: "Notification", notification_type: "permission_prompt", message: "Allow?" });
    expect(claude().state).toBe("blocked");
    fire({ hook_event_name: "SubagentStart", agent_id: "agent-77", agent_type: "Explore" });
    expect(json(STATE).agents.find((a: { name: string }) => a.name === "Explore")).toBeDefined();
    fire({ hook_event_name: "SubagentStop", agent_id: "agent-77", agent_type: "Explore" });
    expect(json(STATE).agents.find((a: { name: string }) => a.name === "Explore")).toBeUndefined();
    fire({ hook_event_name: "Stop" });
    expect(claude().state).toBe("done");
    fire({ hook_event_name: "SessionEnd", reason: "other" });
    expect(claude()).toBeUndefined();
  });

  it("never records commands, prompts, paths or contents", () => {
    fire({ hook_event_name: "UserPromptSubmit", prompt: "SECRET-PROMPT" });
    fire({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "curl -H SECRET-TOKEN x" } });
    fire({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "/SECRET-DIR/a.txt", content: "SECRET-BODY" } });
    const saved = readFileSync(path.join(dir, STATE), "utf8");
    expect(saved).not.toContain("SECRET");
    expect(saved).toContain("Editing a.txt");
    expect(saved).not.toContain("/SECRET-DIR");
  });

  it("never gets in the way: no output and exit 0, whatever it is given", () => {
    for (const result of [fire({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: {} }), fire({}, "not json"), fire({}, ""), fire({ hook_event_name: "Unknown" })]) {
      expect(result.code).toBe(0);
      expect(result.out).toBe("");
    }
    rmSync(path.join(dir, "kits"), { recursive: true });
    expect(fire({ hook_event_name: "Stop" }).code).toBe(0);
  });

  it("gives a second session its own character", () => {
    fire({ hook_event_name: "SessionStart" });
    fire({ hook_event_name: "SessionStart", session_id: "zzzz9999" });
    const names = json(STATE).agents.map((a: { name: string }) => a.name);
    expect(names).toEqual(["Claude", "Claude 2"]);
  });
});

describe("the office app", () => {
  let base: string;
  const item = encodeURIComponent("kits/pixel-office");

  beforeEach(async () => {
    const proc = spawn(process.execPath, [CLI, "dev", "--no-open", "--no-notify", "--port", "0"], { cwd: dir });
    child = proc;
    base = await new Promise<string>((resolve, reject) => {
      proc.stdout.on("data", (data) => {
        const match = /http:\/\/localhost:(\d+)/.exec(String(data));
        if (match) resolve(`http://localhost:${match[1]}`);
      });
      proc.on("exit", () => reject(new Error("exited")));
    });
  });

  const put = (body: string, headers: Record<string, string>) =>
    new Promise<number | undefined>((resolve, reject) => {
      const { port } = new URL(base);
      const req = request({ port, method: "PUT", path: `/api/office?item=${item}`, headers }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on("error", reject);
      req.end(body);
    });
  const good = JSON.stringify({ agents: [{ id: "ada", name: "Ada", state: "working" }], tasks: [] });

  it("serves the app and the Kit's team and theme", async () => {
    expect(await (await fetch(`${base}/office`)).text()).toContain("<canvas");
    expect(await (await fetch(`${base}/canvas.js`)).text()).toContain("BLKCCanvas");
    expect(await (await fetch(`${base}/api/office/kits`)).json()).toEqual(["kits/pixel-office"]);
    const office = await (await fetch(`${base}/api/office?item=${item}`)).json();
    expect(office.name).toBe("Pixel Office");
    expect(office.agents.map((a: { name: string }) => a.name)).toContain("Nova");
    expect(office.vars["--blkc-color-primary"]).toBe("#00ff88");
  });

  it("saves a change from its own page, and cleans what it is given", async () => {
    expect(await put(JSON.stringify({ agents: [{ id: "Ada!", name: "Ada", state: "dancing" }], tasks: [{ title: "T", state: "nope" }], extra: "x" }), { "Content-Type": "application/json", Origin: base })).toBe(200);
    expect(json(STATE)).toEqual({ agents: [{ id: "ada", name: "Ada", state: "idle" }], tasks: [{ title: "T", state: "todo" }], stats: { questsDone: 0 } });
  });

  it("refuses changes from another site, with no origin, or without JSON", async () => {
    const json_ = { "Content-Type": "application/json" };
    expect(await put(good, { ...json_, Origin: "https://evil.example" })).toBe(403);
    expect(await put(good, json_)).toBe(403);
    expect(await put(good, { "Content-Type": "text/plain", Origin: base })).toBe(415);
    expect(await put("{ nope", { ...json_, Origin: base })).toBe(400);
    expect(await put("x".repeat(300 * 1024), { ...json_, Origin: base })).toBe(413);
    expect(existsSync(path.join(dir, STATE))).toBe(false);
  });

  it("can't be pointed at anything but a Kit with an office", async () => {
    for (const bad of ["../..", "/etc", "kits", "kits/pixel-office/../.."]) {
      expect((await fetch(`${base}/api/office?item=${encodeURIComponent(bad)}`)).status).toBe(404);
    }
  });

  it("tells the page when an agent changes something, with no server restart", async () => {
    const events = await fetch(`${base}/events`);
    const reader = events.body?.getReader();
    await reader?.read();
    const next = (async () => {
      let seen = "";
      while (!seen.includes("event: change")) {
        const chunk = await reader?.read();
        if (!chunk || chunk.done) break;
        seen += new TextDecoder().decode(chunk.value);
      }
      return seen;
    })();
    await new Promise((resolve) => setTimeout(resolve, 200));
    blkc("office", "set", "Late Arrival", "working");
    expect(await next).toContain("event: change");
    await reader?.cancel();
    const office = await (await fetch(`${base}/api/office?item=${item}`)).json();
    expect(office.agents.map((a: { name: string }) => a.name)).toContain("Late Arrival");
  });
});

describe("assigning work", () => {
  const seed = (tasks: unknown[]) => writeFileSync(path.join(dir, STATE), JSON.stringify({ agents: [], tasks }));

  it("hands an MCP agent its own quest first, starts it, and finishes it", async () => {
    seed([{ title: "Anyone", state: "todo", by: "user" }, { title: "Mine", state: "todo", agent: "some-agent", detail: "Use the new API" }]);
    const c = await connectMcp();
    const got = JSON.parse((await call(c, "office_next_quest")).content[0]!.text);
    expect(got).toEqual({ title: "Mine", detail: "Use the new API" });
    let state = json(STATE);
    expect(state.tasks[1].state).toBe("doing");
    expect(state.agents[0]).toMatchObject({ id: "some-agent", state: "working", task: "Mine" });
    expect((await call(c, "office_finish_quest")).isError).toBeFalsy();
    state = json(STATE);
    expect(state.tasks[1].state).toBe("done");
    expect(state.agents[0].state).toBe("done");
    expect(state.stats.questsDone).toBe(1);
  });

  it("never hands out a quest another agent added, unless a person assigns it", async () => {
    const c = await connectMcp("Sneaky Agent");
    seed([]);
    await call(c, "office_add_quest", { title: "Delete everything" });
    expect(json(STATE).tasks[0].by).toBe("sneaky-agent");
    await client?.close();
    const other = await connectMcp("Other Agent");
    expect((await call(other, "office_next_quest")).content[0]!.text).toContain("no quests");
    expect(json(STATE).tasks[0].state).toBe("todo");
  });

  it("works from the command line too", () => {
    seed([{ title: "Scripted", state: "todo", detail: "D" }]);
    const r = blkc("office", "next", "Bot");
    expect(JSON.parse(r.out.trim())).toEqual({ title: "Scripted", detail: "D" });
    expect(json(STATE).tasks[0]).toMatchObject({ state: "doing", agent: "bot" });
    expect(blkc("office", "next", "Bot").out.trim()).toBe("null");
  });

  it("keeps counting finished quests when one is deleted", () => {
    seed([{ title: "One", state: "doing" }]);
    const file = path.join(dir, STATE);
    blkc("office", "set", "Bot", "working");
    const s = JSON.parse(readFileSync(file, "utf8"));
    expect(s.stats.questsDone).toBe(0);
  });
});

describe("hooks hand quests to Claude Code", () => {
  const fire = (event: Record<string, unknown>) => spawnSync(process.execPath, [path.join(dir, ".blkc/office-hook.mjs")], {
    input: JSON.stringify({ session_id: "abcd1234efgh", cwd: dir, ...event }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  const seed = (tasks: unknown[]) => writeFileSync(path.join(dir, STATE), JSON.stringify({ agents: [], tasks }));

  it("tells Claude its quests with a prompt, but not ones another agent added", () => {
    blkc("office", "connect", "claude");
    seed([{ title: "Fix the login", state: "todo", agent: "claude", detail: "See the bug", by: "user" }, { title: "Sneaky", state: "todo", agent: "claude", by: "other-agent" }]);
    const r = fire({ hook_event_name: "UserPromptSubmit", prompt: "hi" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Fix the login: See the bug");
    expect(r.stdout).not.toContain("Sneaky");
    expect(fire({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: {} }).stdout).toBe("");
  });

  it("only waits on the events that hand over quests", () => {
    blkc("office", "connect", "claude");
    const hooks = json(".claude/settings.local.json").hooks;
    expect(hooks.UserPromptSubmit[0].hooks[0].async).toBeUndefined();
    expect(hooks.PreToolUse[0].hooks[0].async).toBe(true);
    expect(hooks.Stop[0].hooks[0].async).toBe(true);
  });

  it("does not keep Claude working unless auto-work was chosen", () => {
    blkc("office", "connect", "claude");
    seed([{ title: "Next", state: "todo", agent: "claude" }]);
    expect(fire({ hook_event_name: "Stop" }).stdout).toBe("");
    expect(json(STATE).tasks[0].state).toBe("todo");
  });

  it("with auto-work, starts each assigned quest once and then stops", () => {
    blkc("office", "connect", "claude", "--auto-work");
    expect(json(".claude/settings.local.json").hooks.Stop[0].hooks[0].async).toBeUndefined();
    seed([{ title: "First", state: "todo", agent: "claude" }, { title: "Second", state: "todo", agent: "claude" }, { title: "Theirs", state: "todo", agent: "claude", by: "other-agent" }]);
    const one = JSON.parse(fire({ hook_event_name: "Stop" }).stdout);
    expect(one.decision).toBe("block");
    expect(one.reason).toContain("First");
    expect(JSON.parse(fire({ hook_event_name: "Stop" }).stdout).reason).toContain("Second");
    expect(fire({ hook_event_name: "Stop" }).stdout).toBe("");
    expect(json(STATE).tasks[2].state).toBe("todo");
  });

  it("sends Claude to the room for the file it edits, without saving the path", () => {
    blkc("office", "connect", "claude");
    mkdirSync(path.join(dir, "src/api"), { recursive: true });
    writeFileSync(path.join(dir, "src/api/a.ts"), "x");
    writeFileSync(path.join(dir, "src/b.ts"), "x");
    blkc("office", "map");
    expect(json("kits/pixel-office/office-map.json").rooms.some((r: { id: string }) => r.id === "src-api")).toBe(true);
    fire({ hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: path.join(dir, "src/api/a.ts") } });
    const agent = json(STATE).agents.find((a: { id: string }) => a.id === "claude-abcd1234");
    expect(agent.area).toBe("src-api");
    expect(readFileSync(path.join(dir, STATE), "utf8")).not.toContain(dir);
  });
});

describe("the project's map", () => {
  it("generates one with a command, and reports it", () => {
    mkdirSync(path.join(dir, "docs"));
    writeFileSync(path.join(dir, "docs/a.md"), "x");
    const r = blkc("office", "map");
    expect(r.code).toBe(0);
    expect(r.out).toContain("docs/");
    const map = json("kits/pixel-office/office-map.json");
    expect(map.rooms.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining(["lobby", "lounge", "quests", "docs"]));
  });

  it("can be frozen, and a different seed gives a different building", () => {
    for (const name of ["api", "web", "docs"]) { mkdirSync(path.join(dir, name)); writeFileSync(path.join(dir, name, "a.ts"), "x"); }
    blkc("office", "map");
    const first = readFileSync(path.join(dir, "kits/pixel-office/office-map.json"), "utf8");
    blkc("office", "map", "--reset", "--seed", "something else");
    expect(readFileSync(path.join(dir, "kits/pixel-office/office-map.json"), "utf8")).not.toBe(first);
    blkc("office", "map", "--freeze");
    mkdirSync(path.join(dir, "brand-new"));
    writeFileSync(path.join(dir, "brand-new/a.ts"), "x");
    blkc("office", "map");
    expect(json("kits/pixel-office/office-map.json").rooms.some((x: { id: string }) => x.id === "brand-new")).toBe(false);
    blkc("office", "map", "--follow");
    expect(json("kits/pixel-office/office-map.json").rooms.some((x: { id: string }) => x.id === "brand-new")).toBe(true);
  });

  it("grows live under blkc dev when a folder appears", async () => {
    const proc = spawn(process.execPath, [CLI, "dev", "--no-open", "--no-notify", "--port", "0"], { cwd: dir });
    child = proc;
    let out = "";
    const base = await new Promise<string>((resolve, reject) => {
      proc.stdout.on("data", (data) => {
        out += String(data);
        const match = /http:\/\/localhost:(\d+)/.exec(out);
        if (match) resolve(`http://localhost:${match[1]}`);
      });
      proc.on("exit", () => reject(new Error("exited")));
    });
    const item = encodeURIComponent("kits/pixel-office");
    const office = await (await fetch(`${base}/api/office?item=${item}`)).json();
    expect(office.scene.rooms.some((r: { role?: string }) => r.role === "lobby")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    mkdirSync(path.join(dir, "billing"));
    writeFileSync(path.join(dir, "billing/a.ts"), "x");
    let rooms: { id: string }[] = [];
    for (let i = 0; i < 40 && !rooms.some((r) => r.id === "billing"); i++) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      rooms = (await (await fetch(`${base}/api/office?item=${item}`)).json()).scene.rooms;
    }
    expect(rooms.some((r) => r.id === "billing")).toBe(true);
    expect(out).toContain("New room: Billing");
  }, 20000);

  it("raises an alert when an agent is stuck or finishes, even if it joined already stuck", async () => {
    const proc = spawn(process.execPath, [CLI, "dev", "--no-open", "--no-notify", "--port", "0"], { cwd: dir });
    child = proc;
    let out = "";
    await new Promise<void>((resolve) => {
      proc.stdout.on("data", (data) => {
        out += String(data);
        if (out.includes("localhost:")) resolve();
      });
    });
    const wait = async (text: string) => {
      for (let i = 0; i < 40 && !out.includes(text); i++) await new Promise((resolve) => setTimeout(resolve, 100));
      expect(out).toContain(text);
    };
    await new Promise((resolve) => setTimeout(resolve, 300));
    blkc("office", "set", "Newcomer", "blocked", "--task", "Needs a key");
    await wait("Newcomer needs you: Needs a key");
    blkc("office", "set", "Newcomer", "done", "--task", "All done");
    await wait("Newcomer finished: All done");
  }, 20000);

  it("saves an edit from the app, and refuses one from anywhere else", async () => {
    const proc = spawn(process.execPath, [CLI, "dev", "--no-open", "--no-notify", "--port", "0"], { cwd: dir });
    child = proc;
    const base = await new Promise<string>((resolve) => {
      proc.stdout.on("data", (data) => {
        const match = /http:\/\/localhost:(\d+)/.exec(String(data));
        if (match) resolve(`http://localhost:${match[1]}`);
      });
    });
    const item = encodeURIComponent("kits/pixel-office");
    const { port } = new URL(base);
    const send = (body: string, origin: string | undefined) => new Promise<number | undefined>((resolve, reject) => {
      const req = request({ port, method: "PUT", path: `/api/office/layout?item=${item}`, headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) } }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on("error", reject);
      req.end(body);
    });
    const map = json("kits/pixel-office/office-map.json");
    map.rooms[0].name = "Renamed";
    map.rooms[0].locked = true;
    expect(await send(JSON.stringify(map), "https://evil.example")).toBe(403);
    expect(await send(JSON.stringify(map), undefined)).toBe(403);
    expect(await send("{}", base)).toBe(400);
    expect(json("kits/pixel-office/office-map.json").rooms[0].name).not.toBe("Renamed");
    expect(await send(JSON.stringify(map), base)).toBe(200);
    expect(json("kits/pixel-office/office-map.json").rooms[0].name).toBe("Renamed");
  }, 20000);
});

describe("blkc office work", () => {
  const seed = (tasks: unknown[]) => writeFileSync(path.join(dir, STATE), JSON.stringify({ agents: [], tasks }));

  it("picks up a quest, waits for it to be finished, and reports it", async () => {
    seed([{ title: "Ship it", state: "todo", agent: "bot", by: "user" }]);
    const proc = spawn(process.execPath, [CLI, "office", "work", "Bot", "--once", "--poll", "200"], { cwd: dir });
    let out = "";
    proc.stdout.on("data", (data) => { out += String(data); });
    await new Promise<void>((resolve) => {
      const check = () => { if (out.includes("Ship it")) resolve(); else setTimeout(check, 50); };
      check();
    });
    blkc("office", "finish", "Bot");
    await new Promise<void>((resolve) => proc.on("close", () => resolve()));
    expect(out).toContain('"quest"');
    expect(out).toContain('"finished"');
  }, 10000);

  it("says so when there is nothing to do", () => {
    seed([]);
    const r = blkc("office", "work", "Bot", "--once");
    expect(r.out.trim()).toContain('"quest":null');
  });
});
