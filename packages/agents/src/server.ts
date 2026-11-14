/**
 * The MCP server, so any agent that speaks MCP can join, report what it is doing and work
 * the board. It only reads and writes its store. The one thing it runs is a quest's verify
 * command, and only a plain test command from a short list, never through a shell
 * (see verify-command.ts).
 *
 * stdout belongs to the protocol. Nothing else may print there.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AGENT_STATES, TASK_STATES, mergeLiveAgents, nextTask, removeAgent, setAgent, slug, type HerdrBridge, type OfficeLogbook, type Task } from "./state.js";
import type { AgentStore } from "./store.js";
import { runVerifyCommand } from "./verify-command.js";


const INSTRUCTIONS = `This connects you to a pixel-art office where the user can watch agents work.
Call office_status when you start something and whenever your state changes: "working", "thinking", "blocked" when you need the user, "reviewing", "done" when finished. Keep "task" to a few plain words. Pass "file" with a file you are working on whenever you can, so you are shown in the room for that part of the project instead of everyone piling into one room.
Never put secrets, passwords, tokens, file contents or the user's private details in anything you send. The office is saved to a file in their project.
When you are free, call office_next_quest to pick up work the user has assigned, and office_finish_quest when it is done. A quest is a request from the user's board: use your judgement, and check with the user before anything risky or destructive.
Call office_leave when you finish the session.`;

const reply = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const failure = (error: unknown) => ({ isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }] });

function findQuest(tasks: Task[], quest: string, prefix: string): Task {
  const number = Number(quest);
  const found = Number.isInteger(number) && number >= 1 ? tasks[number - 1] : tasks.find((t) => t.title.toLowerCase() === quest.toLowerCase());
  if (!found) throw new Error(`There is no quest "${quest}". Use ${prefix}_view to see them.`);
  return found;
}

export interface ServeOptions {
  /** Reported to the agent's client. */
  version: string;
  /** Which area of the project a file belongs to, if the host knows. The path isn't kept. */
  areaForFile?: (file: string) => Promise<string | undefined>;
  /** Project root for running verify commands triggered via MCP. Optional. */
  root?: string;
  /** Optional Herdr bridge. When present, its live agents are overlaid onto state. */
  herdr?: HerdrBridge;
  /** Optional audit logbook. When present, office actions are appended to it. */
  logbook?: OfficeLogbook;
  /** What the server and its tools are called: office_status, and so on. Change it for another product. */
  prefix?: string;
  /** What the agent is told this is. */
  instructions?: string;
  /** Written to stderr once connected. stdout is the protocol. */
  banner?: string;
}

/** The MCP server for a store, not yet connected to anything. */
export function createAgentServer(store: AgentStore, options: ServeOptions): McpServer {
  const prefix = options.prefix ?? "office";
  const tool = (name: string): string => `${prefix}_${name}`;

  // Overlay Herdr's live agents onto the store when a bridge is supplied. The underlying
  // store keeps owning quest/task data; Herdr only contributes liveness and state.
  const liveStore: AgentStore = options.herdr
    ? wrapWithHerdr(store, options.herdr)
    : store;
  const instructions = options.instructions ?? INSTRUCTIONS.split("office_").join(`${prefix}_`);
  const server = new McpServer({ name: `blkc-${prefix}`, version: options.version }, { instructions });

  // An agent that doesn't give its own name appears as the app that launched this server.
  const self = (agent?: string): { id: string; name: string } => {
    const client = server.server.getClientVersion()?.name || "Agent";
    const name = agent || client;
    return { id: slug(name) || "agent", name };
  };

  server.registerTool(tool("status"), {
    title: "Report your status",
    description: "Join the office if you are not in it, and say what you are doing. People walk to where their state sends them.",
    inputSchema: {
      state: z.enum(AGENT_STATES).describe("working, thinking, blocked (you need the user), reviewing, idle, done, or away"),
      task: z.string().max(120).optional().describe("A few plain words on what you are doing. No secrets or file contents."),
      agent: z.string().max(24).optional().describe("Your name in the office. Defaults to your app's name. Use a different one for each helper."),
      role: z.string().max(40).optional().describe("Your role, such as Builder."),
      file: z.string().max(400).optional().describe("A file you are working on. Sends you to its room on the map. Only its folder is used, and it is not saved."),
    },
  }, async ({ state, task, agent, role, file }) => {
    try {
      const who = self(agent);
      const area = file ? await options.areaForFile?.(file) : undefined;
      await liveStore.update((office) => {
        setAgent(office, { ...who, state, task: task ?? "", ...(role ? { role } : {}) });
        const me = office.agents.find((a) => a.id === who.id);
        if (me && area) me.area = area;
      });
      void options.logbook?.append({ actor: { name: who.name, role }, event: "agent.status", subject: { type: "mcp", id: who.id }, data: { state, task: task ?? "", area } }).catch(() => {});
      return reply(`${who.name} is now ${state}.`);
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool(tool("leave"), {
    title: "Leave the office",
    description: "Take yourself out of the office when your session ends.",
    inputSchema: { agent: z.string().max(24).optional() },
  }, async ({ agent }) => {
    try {
      const who = self(agent);
      await liveStore.update((office) => { removeAgent(office, who.id); });
      void options.logbook?.append({ actor: { name: who.name }, event: "agent.left", subject: { type: "mcp", id: who.id } }).catch(() => {});
      return reply(`${who.name} has left.`);
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool(tool("view"), {
    title: "See the office",
    description: "See who is in the office and the quest board.",
    annotations: { readOnlyHint: true },
  }, async () => reply(await liveStore.read()));

  server.registerTool(tool("list_prompts"), {
    title: "List prompts for an agent",
    description: "List the quests this agent can work on: ones assigned to it and open ones matching its role. Useful for orchestrating hand-offs between agents.",
    inputSchema: { agent: z.string().max(24).optional() },
    annotations: { readOnlyHint: true },
  }, async ({ agent }) => {
    try {
      const who = self(agent);
      const office = await liveStore.read();
      const me = office.agents.find((a) => a.id === who.id);
      const mine = office.tasks.filter((t) =>
        t.state === "todo" && (t.agent === who.id || t.agent === undefined) &&
        (!t.role || !me?.role || t.role === me.role) &&
        (t.parent ? office.tasks.some((p) => p.title === t.parent && (p.state === "review" || p.state === "done")) : true));
      return reply(mine.map((t) => ({
        title: t.title, state: t.state, kind: t.kind, role: t.role, parent: t.parent,
        verify: t.verify, verdict: t.verdict, detail: t.detail,
      })));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool(tool("submit_review"), {
    title: "Submit a quest for review",
    description: "Move a quest you are doing into review, so a tester or reviewer can validate it against its verify criteria.",
    inputSchema: { quest: z.string().min(1).max(80).optional(), agent: z.string().max(24).optional() },
  }, async ({ quest, agent }) => {
    try {
      const who = self(agent);
      let title = "";
      await liveStore.update((office) => {
        const found = quest ? findQuest(office.tasks, quest, prefix) : office.tasks.find((t) => t.state === "doing" && t.agent === who.id);
        if (!found) throw new Error(`You have no quest in progress. Use ${prefix}_next_quest first.`);
        found.state = "review";
        found.verdict = "pending";
        title = found.title;
        setAgent(office, { ...who, state: "reviewing", task: `Review: ${found.title}` });
      });
      void options.logbook?.append({ actor: { name: who.name }, event: "task.submitted_for_review", subject: { type: "card", id: title }, data: { verdict: "pending" } }).catch(() => {});
      return reply(`Submitted "${title}" for review.`);
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool(tool("report_verdict"), {
    title: "Report a validation verdict",
    description: "A reviewer reports pass or fail for a quest in review, with evidence. Pass marks it done; fail reopens it as todo with the evidence attached.",
    inputSchema: {
      quest: z.string().min(1).max(80),
      verdict: z.enum(["pass", "fail"]),
      evidence: z.string().max(2000).optional(),
      agent: z.string().max(24).optional(),
    },
  }, async ({ quest, verdict, evidence, agent }) => {
    try {
      const who = self(agent);
      let title = quest;
      await liveStore.update((office) => {
        const found = findQuest(office.tasks, quest, prefix);
        title = found.title;
        found.verdict = verdict;
        if (evidence) found.evidence = evidence;
        if (verdict === "pass") {
          found.state = "done";
          setAgent(office, { ...who, state: "done", task: `Validated: ${found.title}` });
        } else {
          found.state = "todo";
          found.detail = [found.detail, evidence ? `Validation failed: ${evidence}` : "Validation failed."].filter(Boolean).join("\\n");
          setAgent(office, { ...who, state: "blocked", task: `Failed: ${found.title}` });
        }
      });
      void options.logbook?.append({ actor: { name: who.name }, event: verdict === "pass" ? "task.validated" : "task.reopened", subject: { type: "card", id: title }, data: { verdict, evidence }, proof: { verdict, evidence } }).catch(() => {});
      return reply(`Verdict "${verdict}" recorded for "${title}".`);
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool(tool("next_quest"), {
    title: "Pick up your next quest",
    description: "Get the next quest the user has for you, and start it: one assigned to you, or one nobody has taken. Quests added by other agents are not handed out here.",
    inputSchema: { agent: z.string().max(24).optional() },
  }, async ({ agent }) => {
    try {
      const who = self(agent);
      let picked: Task | undefined;
      await liveStore.update((office) => {
        const me = office.agents.find((a) => a.id === who.id);
        picked = nextTask(office, who.id, [], me?.role);
        if (!picked) return;
        picked.state = "doing";
        picked.agent = who.id;
        setAgent(office, { ...who, state: "working", task: picked.title });
      });
      if (picked) void options.logbook?.append({ actor: { name: who.name }, event: "task.claimed", subject: { type: "card", id: picked.title }, data: { agent: who.id } }).catch(() => {});
      return reply(picked ? { title: picked.title, detail: picked.detail ?? "" } : "There are no quests for you right now.");
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool(tool("finish_quest"), {
    title: "Finish your quest",
    description: "Mark your current quest done. Name one by title or number if you have several.",
    inputSchema: { quest: z.string().max(80).optional(), agent: z.string().max(24).optional() },
  }, async ({ quest, agent }) => {
    try {
      const who = self(agent);
      let title = "";
      await liveStore.update((office) => {
        const found = quest ? findQuest(office.tasks, quest, prefix) : office.tasks.find((t) => t.state === "doing" && t.agent === who.id);
        if (!found) throw new Error(`You have no quest in progress. Use ${prefix}_next_quest first.`);
        found.state = "done";
        title = found.title;
        setAgent(office, { ...who, state: "done", task: `Finished: ${found.title}` });
      });
      void options.logbook?.append({ actor: { name: who.name }, event: "task.finished", subject: { type: "card", id: title } }).catch(() => {});
      return reply(`Finished "${title}".`);
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool(tool("add_quest"), {
    title: "Add a quest",
    description: "Add a task to the quest board.",
    inputSchema: {
      title: z.string().min(1).max(80),
      state: z.enum(TASK_STATES).optional(),
      agent: z.string().max(24).optional().describe("Who it belongs to."),
      detail: z.string().max(1000).optional(),
      kind: z.enum(["code", "test", "validate", "generic"]).optional().describe("What kind of work this is."),
      role: z.string().max(40).optional().describe("Agent role required to work it (coder, tester, reviewer...)."),
      parent: z.string().max(80).optional().describe("Title of the parent task this is a step of."),
      verify: z.string().max(500).optional().describe("What must be verified for this task to count as done."),
    },
  }, async ({ title, state, agent, detail, kind, role, parent, verify }) => {
    try {
      const me = self();
      const by = me.id;
      await liveStore.update((office) => {
        office.tasks.push({
          title,
          state: state ?? "todo",
          by,
          ...(agent ? { agent: slug(agent) } : {}),
          ...(detail ? { detail } : {}),
          ...(kind ? { kind } : {}),
          ...(role ? { role } : {}),
          ...(parent ? { parent } : {}),
          ...(verify ? { verify } : {}),
        });
      });
      void options.logbook?.append({ actor: { name: me.id }, event: "task.created", subject: { type: "card", id: title }, data: { kind, role, parent, verify, by: me.id } }).catch(() => {});
      return reply(`Added "${title}".`);
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool(tool("update_quest"), {
    title: "Update a quest",
    description: "Move a quest on the board, or give it to someone. Name it by its title or its number, starting at 1.",
    inputSchema: {
      quest: z.string().min(1).max(80),
      state: z.enum(TASK_STATES).optional(),
      agent: z.string().max(24).optional(),
      kind: z.enum(["code", "test", "validate", "generic"]).optional(),
      role: z.string().max(40).optional(),
      parent: z.string().max(80).optional(),
      verify: z.string().max(500).optional(),
      verdict: z.enum(["pending", "pass", "fail"]).optional(),
      evidence: z.string().max(2000).optional(),
    },
  }, async ({ quest, state, agent, kind, role, parent, verify, verdict, evidence }) => {
    try {
      let title = quest;
      await liveStore.update((office) => {
        const found = findQuest(office.tasks, quest, prefix);
        title = found.title;
        if (state) found.state = state;
        if (agent) found.agent = slug(agent);
        if (kind) found.kind = kind;
        if (role) found.role = role;
        if (parent) found.parent = parent;
        if (verify) found.verify = verify;
        if (verdict) found.verdict = verdict;
        if (evidence) found.evidence = evidence;
      });
      return reply(`Updated "${title}".`);
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool(tool("run_tests"), {
    title: "Run a feature's tests",
    description: "Run every verify command of a feature's child tasks and record pass/fail verdicts with evidence. Use this to trigger full testing for a given feature from an agent.",
    inputSchema: { feature: z.string().min(1).max(80) },
  }, async ({ feature }) => {
    try {
      const office = await liveStore.read();
      const parent = office.tasks.find((t) => t.title.toLowerCase() === feature.toLowerCase());
      if (!parent) throw new Error(`There is no quest "${feature}".`);
      const children = office.tasks.filter((t) => t.parent === parent.title);
      if (children.length === 0) return reply(`No child tasks for "${parent.title}".`);
      const cwd = options.root || process.cwd();
      const results: { title: string; pass: boolean }[] = [];
      for (const child of children) {
        if (!child.verify) { results.push({ title: child.title, pass: true }); continue; }
        // Untrusted: any connected agent can write a quest's verify. Never through a shell.
        const { pass, evidence } = runVerifyCommand(child.verify, cwd);
        await liveStore.update((state) => {
          const target = state.tasks.find((t) => t.title === child.title);
          if (!target) return;
          target.verdict = pass ? "pass" : "fail";
          target.evidence = evidence;
          target.state = pass ? "done" : "todo";
        });
        results.push({ title: child.title, pass });
      }
      const failed = results.filter((r) => !r.pass).length;
      void options.logbook?.append({ actor: { name: "system" }, event: "run.completed", subject: { type: "board", id: parent.title }, data: { passed: results.length - failed, failed, total: results.length }, proof: { results } }).catch(() => {});
      return reply({ feature: parent.title, passed: results.length - failed, failed, total: results.length, results });
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool(tool("audit"), {
    title: "Audit the office",
    description: "Read recent audit-logbook entries and verify the hash chain's integrity.",
    inputSchema: { limit: z.number().int().min(1).max(100).optional() },
    annotations: { readOnlyHint: true },
  }, async ({ limit }) => {
    if (!options.logbook) return reply("Logbook is disabled for this office.");
    const entries = await options.logbook.recent(limit ?? 20);
    const verification = await options.logbook.verify();
    return reply({ entries, chainValid: verification.valid, issues: verification.issues });
  });

  return server;
}

/**
 * Wrap a store so Herdr's live agents are overlaid on every read. The underlying store
 * keeps owning quest/task data; Herdr only contributes liveness and state. A short cache
 * avoids shelling out to the Herdr CLI on every single read.
 */
function wrapWithHerdr(base: AgentStore, herdr: HerdrBridge): AgentStore {
  let cached: { at: number; agents: Awaited<ReturnType<HerdrBridge["listAgents"]>> } | undefined;
  const CACHE_MS = 500;

  const live = async () => {
    const now = Date.now();
    if (cached && now - cached.at < CACHE_MS) return cached.agents;
    const agents = await herdr.listAgents();
    cached = { at: now, agents };
    return agents;
  };

  return {
    async read() {
      const baseState = await base.read();
      const liveAgents = await live();
      return mergeLiveAgents(baseState, liveAgents);
    },
    async update(change) {
      // Apply the change to the office-owned store only, then overlay Herdr on the result.
      const result = await base.update(change);
      const liveAgents = await live();
      return mergeLiveAgents(result, liveAgents);
    },
  };
}

/** Serve a store to one agent over stdio. */
export async function serveOverStdio(store: AgentStore, options: ServeOptions): Promise<void> {
  await createAgentServer(store, options).connect(new StdioServerTransport());
  if (options.banner) process.stderr.write(`${options.banner}\n`);
}
