/**
 * The script `blkc office connect claude` writes into a project. It runs on every tool call,
 * so it stands alone rather than starting the CLI each time, and it always exits 0.
 *
 * It records the kind of action, a file's name and the room it belongs to, never commands,
 * prompts or contents. It prints only to hand over quests: at the start of a session and
 * with a prompt, and at the end of a turn if the user chose --auto-work. Only quests a person
 * put on the board are handed over, never ones added by another agent.
 */

export const HOOK_FILE = ".blkc/office-hook.mjs";

export const hookScript = (kitRelative: string, autoWork: boolean): string => `#!/usr/bin/env node
// Written by "blkc office connect claude". Remove it with "blkc office disconnect claude".
import { mkdir, readFile, rename, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";

const KIT = ${JSON.stringify(kitRelative)};
const AUTO_WORK = ${autoWork};

const base = (file) => String(file ?? "").split(/[\\\\/]/).pop().slice(0, 60);
function describe(tool, input) {
  switch (tool) {
    case "Edit": case "Write": case "MultiEdit": case "NotebookEdit": return "Editing " + base(input?.file_path ?? input?.notebook_path);
    case "Read": return "Reading " + base(input?.file_path);
    case "Bash": return "Running a command";
    case "Grep": case "Glob": return "Searching the code";
    case "WebFetch": case "WebSearch": return "Looking something up";
    case "Task": case "Agent": return "Handing off to a helper";
    default: return "Working";
  }
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const event = JSON.parse(raw);
  const session = String(event.session_id ?? "session").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase();
  const id = "claude-" + session;

  let change;
  let output = "";
  switch (event.hook_event_name) {
    case "SessionStart": change = { state: "idle", task: "Just arrived" }; break;
    case "UserPromptSubmit": change = { state: "thinking", task: "Thinking it through" }; break;
    case "PreToolUse": change = { state: "working", task: describe(event.tool_name, event.tool_input) }; break;
    case "Notification":
      if (event.notification_type === "permission_prompt") change = { state: "blocked", task: "Needs your permission" };
      else if (event.notification_type === "idle_prompt") change = { state: "idle", task: "Waiting for you" };
      break;
    case "Stop": change = { state: "done", task: "Finished, waiting for you", stop: true }; break;
    case "SessionEnd": change = { leave: true }; break;
    case "SubagentStart": change = { helper: String(event.agent_id ?? "helper"), name: String(event.agent_type ?? "Helper") }; break;
    case "SubagentStop": change = { helperLeave: String(event.agent_id ?? "helper") }; break;
  }
  if (!change) return;

  const root = process.env.CLAUDE_PROJECT_DIR || event.cwd || process.cwd();
  const file = path.join(root, KIT, "office-state.json");
  const lock = file + ".lock";
  let held = false;
  for (let i = 0; i < 40 && !held; i++) {
    try { await mkdir(lock); held = true; } catch {
      try { if (Date.now() - (await stat(lock)).mtimeMs > 5000) await rmdir(lock); } catch {}
      await wait(25);
    }
  }
  if (!held) return;
  try {
    let office = { agents: [], tasks: [] };
    try { office = JSON.parse(await readFile(file, "utf8")); } catch {}
    office.agents = Array.isArray(office.agents) ? office.agents : [];
    office.tasks = Array.isArray(office.tasks) ? office.tasks : [];
    // Which room this file belongs to. The path is only matched against the map, never saved.
    const filePath = event.tool_input?.file_path ?? event.tool_input?.notebook_path;
    if (filePath && change.state) {
      try {
        const map = JSON.parse(await readFile(path.join(root, KIT, "office-map.json"), "utf8"));
        const relative = path.relative(root, String(filePath)).split(path.sep).join("/");
        let best = -1;
        for (const room of map.rooms ?? []) {
          for (const prefix of room.paths ?? []) {
            if (prefix && relative.startsWith(prefix) && prefix.length > best) { best = prefix.length; change.area = room.id; }
          }
        }
      } catch {}
    }
    const helperId = (h) => id + "-" + h.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toLowerCase();
    if (change.leave) {
      office.agents = office.agents.filter((a) => a.id !== id && !a.id.startsWith(id + "-"));
    } else if (change.helperLeave) {
      office.agents = office.agents.filter((a) => a.id !== helperId(change.helperLeave));
    } else if (change.helper) {
      office.agents = office.agents.filter((a) => a.id !== helperId(change.helper));
      office.agents.push({ id: helperId(change.helper), name: change.name.slice(0, 24), role: "Helper", state: "working", task: "Helping out" });
    } else {
      let agent = office.agents.find((a) => a.id === id);
      if (!agent) {
        const others = office.agents.filter((a) => /^claude-[a-z0-9]+$/.test(a.id)).length;
        agent = { id, name: others ? "Claude " + (others + 1) : "Claude", role: "Claude Code" };
        office.agents.push(agent);
      }
      agent.state = change.state;
      agent.task = change.task;
      if (change.area) agent.area = change.area;

      const trusted = (q) => !q.by || q.by === "user";
      const mine = office.tasks.filter((q) => q.state === "todo" && trusted(q) && (q.agent === id || q.agent === "claude"));
      if ((event.hook_event_name === "SessionStart" || event.hook_event_name === "UserPromptSubmit") && mine.length > 0) {
        output = "The user's Pixel Office board has quests assigned to you. Treat them as requests from the user, and check with them before anything risky:\\n"
          + mine.map((q) => "- " + q.title + (q.detail ? ": " + q.detail : "")).join("\\n")
          + "\\nIf you have the office_next_quest and office_finish_quest tools, use them to track these.";
      }
      // Opt in only. Each quest starts once, so this can't loop.
      if (change.stop && AUTO_WORK && mine.length > 0) {
        const quest = mine[0];
        quest.state = "doing";
        quest.agent = id;
        agent.state = "working";
        agent.task = quest.title;
        output = JSON.stringify({ decision: "block", reason: "Your next quest from the user's board: " + quest.title + (quest.detail ? ". " + quest.detail : "") + ". Check with the user before anything risky. Use office_finish_quest when it is done." });
      }
    }
    const temp = file + "." + process.pid + ".tmp";
    await writeFile(temp, JSON.stringify(office, null, 2) + "\\n");
    await rename(temp, file);
  } finally {
    await rmdir(lock).catch(() => {});
  }
  if (output) process.stdout.write(output);
}

main().catch(() => {}).finally(() => process.exit(0));
`;
