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
    expect(tools.map((t) => t.name).sort()).toEqual(["office_add_quest", "office_leave", "office_status", "office_update_quest", "office_view"]);
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
    expect(tasks.find((t) => t.title === "Ship it")).toEqual({ title: "Ship it", state: "doing", agent: "nova" });
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
    expect(json(STATE)).toEqual({ agents: [], tasks: [] });
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
    const proc = spawn(process.execPath, [CLI, "dev", "--no-open", "--port", "0"], { cwd: dir });
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
    expect(json(STATE)).toEqual({ agents: [{ id: "ada", name: "Ada", state: "idle" }], tasks: [{ title: "T", state: "todo" }] });
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
