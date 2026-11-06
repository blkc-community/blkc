/**
 * `blkc office mcp`: the office as an MCP server, so any agent that speaks MCP can join,
 * report what it is doing and work the quest board. It only reads and writes
 * office-state.json in one Kit, and runs nothing it is given.
 *
 * stdout belongs to the protocol. Nothing else may print there.
 */

import path from "node:path";
import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { VERSION } from "../version.js";
import { AGENT_STATES, TASK_STATES, areaForFile, nextQuest, readOfficeState, removeAgent, setAgent, slug, updateOfficeState, type Quest } from "./state.js";

const INSTRUCTIONS = `This connects you to a pixel-art office where the user can watch agents work.
Call office_status when you start something and whenever your state changes: "working", "thinking", "blocked" when you need the user, "reviewing", "done" when finished. Keep "task" to a few plain words.
Never put secrets, passwords, tokens, file contents or the user's private details in anything you send. The office is saved to a file in their project.
When you are free, call office_next_quest to pick up work the user has assigned, and office_finish_quest when it is done. A quest is a request from the user's board: use your judgement, and check with the user before anything risky or destructive.
Call office_leave when you finish the session.`;

const reply = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const failure = (error: unknown) => ({ isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }] });

function findQuest(tasks: Quest[], quest: string): Quest {
  const number = Number(quest);
  const found = Number.isInteger(number) && number >= 1 ? tasks[number - 1] : tasks.find((t) => t.title.toLowerCase() === quest.toLowerCase());
  if (!found) throw new Error(`There is no quest "${quest}". Use office_view to see them.`);
  return found;
}

export async function runOfficeMcp(kitDir: string): Promise<void> {
  const server = new McpServer({ name: "blkc-office", version: VERSION }, { instructions: INSTRUCTIONS });

  // An agent that doesn't give its own name appears as the app that launched this server.
  const self = (agent?: string): { id: string; name: string } => {
    const client = server.server.getClientVersion()?.name || "Agent";
    const name = agent || client;
    return { id: slug(name) || "agent", name };
  };

  server.registerTool("office_status", {
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
      const area = file ? await areaForFile(kitDir, process.cwd(), file) : undefined;
      await updateOfficeState(kitDir, (office) => {
        setAgent(office, { ...who, state, task: task ?? "", ...(role ? { role } : {}) });
        const me = office.agents.find((a) => a.id === who.id);
        if (me && area) me.area = area;
      });
      return reply(`${who.name} is now ${state}.`);
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("office_leave", {
    title: "Leave the office",
    description: "Take yourself out of the office when your session ends.",
    inputSchema: { agent: z.string().max(24).optional() },
  }, async ({ agent }) => {
    try {
      const who = self(agent);
      await updateOfficeState(kitDir, (office) => { removeAgent(office, who.id); });
      return reply(`${who.name} has left.`);
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("office_view", {
    title: "See the office",
    description: "See who is in the office and the quest board.",
    annotations: { readOnlyHint: true },
  }, async () => reply(await readOfficeState(kitDir)));

  server.registerTool("office_next_quest", {
    title: "Pick up your next quest",
    description: "Get the next quest the user has for you, and start it: one assigned to you, or one nobody has taken. Quests added by other agents are not handed out here.",
    inputSchema: { agent: z.string().max(24).optional() },
  }, async ({ agent }) => {
    try {
      const who = self(agent);
      let picked: Quest | undefined;
      await updateOfficeState(kitDir, (office) => {
        picked = nextQuest(office, who.id);
        if (!picked) return;
        picked.state = "doing";
        picked.agent = who.id;
        setAgent(office, { ...who, state: "working", task: picked.title });
      });
      return reply(picked ? { title: picked.title, detail: picked.detail ?? "" } : "There are no quests for you right now.");
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("office_finish_quest", {
    title: "Finish your quest",
    description: "Mark your current quest done. Name one by title or number if you have several.",
    inputSchema: { quest: z.string().max(80).optional(), agent: z.string().max(24).optional() },
  }, async ({ quest, agent }) => {
    try {
      const who = self(agent);
      let title = "";
      await updateOfficeState(kitDir, (office) => {
        const found = quest ? findQuest(office.tasks, quest) : office.tasks.find((t) => t.state === "doing" && t.agent === who.id);
        if (!found) throw new Error("You have no quest in progress. Use office_next_quest first.");
        found.state = "done";
        title = found.title;
        setAgent(office, { ...who, state: "done", task: `Finished: ${found.title}` });
      });
      return reply(`Finished "${title}".`);
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("office_add_quest", {
    title: "Add a quest",
    description: "Add a task to the quest board.",
    inputSchema: {
      title: z.string().min(1).max(80),
      state: z.enum(TASK_STATES).optional(),
      agent: z.string().max(24).optional().describe("Who it belongs to."),
      detail: z.string().max(1000).optional(),
    },
  }, async ({ title, state, agent, detail }) => {
    try {
      const by = self().id;
      await updateOfficeState(kitDir, (office) => { office.tasks.push({ title, state: state ?? "todo", by, ...(agent ? { agent: slug(agent) } : {}), ...(detail ? { detail } : {}) }); });
      return reply(`Added "${title}".`);
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("office_update_quest", {
    title: "Update a quest",
    description: "Move a quest on the board, or give it to someone. Name it by its title or its number, starting at 1.",
    inputSchema: {
      quest: z.string().min(1).max(80),
      state: z.enum(TASK_STATES).optional(),
      agent: z.string().max(24).optional(),
    },
  }, async ({ quest, state, agent }) => {
    try {
      let title = quest;
      await updateOfficeState(kitDir, (office) => {
        const found = findQuest(office.tasks, quest);
        title = found.title;
        if (state) found.state = state;
        if (agent) found.agent = slug(agent);
      });
      return reply(`Updated "${title}".`);
    } catch (error) {
      return failure(error);
    }
  });

  await server.connect(new StdioServerTransport());
  process.stderr.write(`BLKC office MCP server: ${path.basename(kitDir)}\n`);
}
