/**
 * The script `blkc office connect claude` writes into a project. It runs on every tool call,
 * so it stands alone rather than starting the CLI each time, and it can never get in the
 * agent's way: it runs in the background, prints nothing, and always exits 0.
 *
 * It records the kind of action and a file's name only, never commands, prompts or contents.
 */

export const HOOK_FILE = ".blkc/office-hook.mjs";

export const hookScript = (kitRelative: string): string => `#!/usr/bin/env node
// Written by "blkc office connect claude". Remove it with "blkc office disconnect claude".
import { mkdir, readFile, rename, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";

const KIT = ${JSON.stringify(kitRelative)};

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
  switch (event.hook_event_name) {
    case "SessionStart": change = { state: "idle", task: "Just arrived" }; break;
    case "UserPromptSubmit": change = { state: "thinking", task: "Thinking it through" }; break;
    case "PreToolUse": change = { state: "working", task: describe(event.tool_name, event.tool_input) }; break;
    case "Notification":
      if (event.notification_type === "permission_prompt") change = { state: "blocked", task: "Needs your permission" };
      else if (event.notification_type === "idle_prompt") change = { state: "idle", task: "Waiting for you" };
      break;
    case "Stop": change = { state: "done", task: "Finished, waiting for you" }; break;
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
    }
    const temp = file + "." + process.pid + ".tmp";
    await writeFile(temp, JSON.stringify(office, null, 2) + "\\n");
    await rename(temp, file);
  } finally {
    await rmdir(lock).catch(() => {});
  }
}

main().catch(() => {}).finally(() => process.exit(0));
`;
