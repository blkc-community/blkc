/**
 * BLKC CLI - Office
 *
 * Connects agents on this machine to a Kit's office, whichever agent they are.
 *   blkc office mcp          the MCP server, for any agent that speaks MCP
 *   blkc office set          one status update, for anything that can run a command
 *   blkc office connect      writes the settings for a named agent
 */

import chalk from "chalk";
import { Command } from "commander";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { runOfficeMcp } from "../office/mcp.js";
import { HOOK_FILE, hookScript } from "../office/hook-script.js";
import { AGENT_STATES, STATE_FILE, normalizeState, removeAgent, resolveKit, setAgent, updateOfficeState } from "../office/state.js";

const SERVER_NAME = "blkc-office";
const HOOK_COMMAND = `node "\${CLAUDE_PROJECT_DIR}/${HOOK_FILE}" || true`;
const HOOK_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "Notification", "Stop", "SessionEnd", "SubagentStart", "SubagentStop"];

type Json = Record<string, unknown>;

/** Agents whose settings file lives in the project, so we can write it. */
const PROJECT_CONFIGS: Record<string, { label: string; file: string; key: string; kitPrefix: string; extra?: Json }> = {
  claude: { label: "Claude Code", file: ".mcp.json", key: "mcpServers", kitPrefix: "" },
  cursor: { label: "Cursor", file: ".cursor/mcp.json", key: "mcpServers", kitPrefix: "${workspaceFolder}/" },
  vscode: { label: "VS Code", file: ".vscode/mcp.json", key: "servers", kitPrefix: "${workspaceFolder}/", extra: { type: "stdio" } },
  gemini: { label: "Gemini CLI", file: ".gemini/settings.json", key: "mcpServers", kitPrefix: "" },
};

const mcpArgs = (kit: string): string[] => ["-y", "@blkc-code/cli@latest", "office", "mcp", "--kit", kit];

async function readConfig(file: string): Promise<Json> {
  let content: string;
  try {
    content = await readFile(file, "utf8");
  } catch {
    return {};
  }
  try {
    return JSON.parse(content) as Json;
  } catch {
    // Never overwrite settings we can't read: they may hold other things the user needs.
    throw new Error(`${file} isn't plain JSON, so it was left alone. Add the settings by hand: blkc office connect other`);
  }
}

const writeConfig = async (file: string, value: Json): Promise<void> => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + "\n");
};

const isOurHook = (group: Json): boolean =>
  ((group["hooks"] as Json[]) ?? []).some((hook) => String(hook["command"] ?? "").includes(HOOK_FILE));

async function setHooks(root: string, on: boolean): Promise<void> {
  const file = path.join(root, ".claude/settings.local.json");
  const settings = await readConfig(file);
  const hooks = (settings["hooks"] ?? {}) as Record<string, Json[]>;
  for (const event of HOOK_EVENTS) {
    const others = (hooks[event] ?? []).filter((group) => !isOurHook(group));
    const ours = on ? [{ hooks: [{ type: "command", command: HOOK_COMMAND, async: true }] }] : [];
    if (others.length + ours.length > 0) hooks[event] = [...others, ...ours];
    else delete hooks[event];
  }
  if (Object.keys(hooks).length > 0) settings["hooks"] = hooks;
  else delete settings["hooks"];
  await writeConfig(file, settings);
}

/** Start with an empty office the first time, so the sample team isn't mixed in with real agents. */
async function startEmpty(kitDir: string): Promise<boolean> {
  try {
    await readFile(path.join(kitDir, STATE_FILE));
    return false;
  } catch {
    await writeFile(path.join(kitDir, STATE_FILE), JSON.stringify(normalizeState({}), null, 2) + "\n");
    return true;
  }
}

function printManual(kit: string): void {
  console.log("Any agent that speaks MCP, with a local (stdio) server:");
  console.log(chalk.cyan(JSON.stringify({ [SERVER_NAME]: { command: "npx", args: mcpArgs(path.resolve(kit)) } }, null, 2)));
  console.log("\nAnything that can run a command, from any script or agent:");
  console.log(chalk.cyan(`npx @blkc-code/cli@latest office set "My Agent" working --task "Building the page" --kit ${kit}`));
  console.log(`\nStates: ${AGENT_STATES.join(", ")}`);
}

const fail = (error: unknown): void => {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
};

export function registerOfficeCommand(program: Command): void {
  const office = program.command("office").description("Connect agents on this machine to a Kit's office.");

  office
    .command("mcp")
    .description("Run the MCP server, for any agent that speaks MCP.")
    .option("--kit <path>", "The Kit, if there is more than one")
    .action(async (options: { kit?: string }) => {
      try {
        await runOfficeMcp(await resolveKit(options.kit, process.cwd()));
      } catch (error) {
        fail(error);
      }
    });

  office
    .command("set <agent> <state>")
    .description(`Say what an agent is doing. State: ${AGENT_STATES.join(", ")}.`)
    .option("--task <words>", "What it is doing")
    .option("--role <role>", "Its role")
    .option("--kit <path>", "The Kit, if there is more than one")
    .action(async (agent: string, state: string, options: { task?: string; role?: string; kit?: string }) => {
      try {
        const kit = await resolveKit(options.kit, process.cwd());
        await updateOfficeState(kit, (current) => {
          setAgent(current, { name: agent, state, task: options.task ?? "", ...(options.role ? { role: options.role } : {}) });
        });
        console.log(`${agent} is now ${state}.`);
      } catch (error) {
        fail(error);
      }
    });

  office
    .command("remove <agent>")
    .description("Take an agent out of the office.")
    .option("--kit <path>", "The Kit, if there is more than one")
    .action(async (agent: string, options: { kit?: string }) => {
      try {
        const kit = await resolveKit(options.kit, process.cwd());
        await updateOfficeState(kit, (current) => { removeAgent(current, agent); });
        console.log(`${agent} has left.`);
      } catch (error) {
        fail(error);
      }
    });

  office
    .command("connect [agent]")
    .description("Connect an agent: claude, cursor, vscode, gemini, codex, or other.")
    .option("--kit <path>", "The Kit, if there is more than one")
    .option("--no-hooks", "Claude Code: use MCP only, without automatic status updates")
    .action(async (agent: string | undefined, options: { kit?: string; hooks: boolean }) => {
      try {
        const root = process.cwd();
        const kitDir = await resolveKit(options.kit, root);
        const kit = path.relative(root, kitDir) || ".";
        const name = agent ?? "other";

        if (name === "other") {
          printManual(kit);
          console.log(chalk.gray("\nOr have blkc write the settings: blkc office connect claude|cursor|vscode|gemini|codex"));
          return;
        }
        if (name === "codex") {
          // Codex keeps its servers in the user's home folder, which isn't ours to edit.
          console.log("Run this to add the office to Codex:");
          console.log(chalk.cyan(`codex mcp add ${SERVER_NAME} -- npx ${mcpArgs(path.resolve(kit)).join(" ")}`));
          return;
        }
        const target = PROJECT_CONFIGS[name];
        if (!target) throw new Error(`Unknown agent "${name}". Use claude, cursor, vscode, gemini, codex or other.`);

        const file = path.join(root, target.file);
        const config = await readConfig(file);
        const servers = (config[target.key] ?? {}) as Json;
        servers[SERVER_NAME] = { ...target.extra, command: "npx", args: mcpArgs(target.kitPrefix + kit) };
        config[target.key] = servers;
        await writeConfig(file, config);
        console.log(`${chalk.green("Connected")} ${target.label}: ${target.file}`);

        if (name === "claude" && options.hooks) {
          // Hooks go first in case the settings can't be read: nothing half done is left behind.
          await setHooks(root, true);
          await mkdir(path.join(root, ".blkc"), { recursive: true });
          const script = path.join(root, HOOK_FILE);
          await writeFile(script, hookScript(kit));
          await chmod(script, 0o755);
          console.log(`${chalk.green("Automatic updates")} on: .claude/settings.local.json, ${HOOK_FILE}`);
          console.log(chalk.gray("They record the kind of action and a file's name, never commands, prompts or contents."));
        } else {
          console.log(chalk.gray("Agents report through MCP, so they do it when they choose. Ask yours to use the office tools."));
        }
        if (await startEmpty(kitDir)) console.log(chalk.gray("Started with an empty office, so the sample team isn't mixed in."));
        console.log(chalk.gray(`Restart the agent, then run: blkc dev. Consider adding ${path.join(kit, STATE_FILE)} to .gitignore.`));
      } catch (error) {
        fail(error);
      }
    });

  office
    .command("disconnect [agent]")
    .description("Remove the settings connect wrote.")
    .action(async (agent: string | undefined) => {
      try {
        const root = process.cwd();
        const names = agent ? [agent] : Object.keys(PROJECT_CONFIGS);
        for (const name of names) {
          const target = PROJECT_CONFIGS[name];
          if (!target) throw new Error(`Unknown agent "${name}".`);
          const file = path.join(root, target.file);
          const config = await readConfig(file);
          const servers = config[target.key] as Json | undefined;
          if (servers?.[SERVER_NAME]) {
            delete servers[SERVER_NAME];
            await writeConfig(file, config);
            console.log(`Disconnected ${target.label}.`);
          }
          if (name === "claude") {
            await setHooks(root, false);
            await rm(path.join(root, HOOK_FILE), { force: true });
          }
        }
      } catch (error) {
        fail(error);
      }
    });
}
