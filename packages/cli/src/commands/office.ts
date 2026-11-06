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
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { AGENT_STATES, nextTask, normalizeState, removeAgent, serveOverStdio, setAgent } from "@blkc-code/agents";
import { PROJECT_CLIENTS, HOOK_FILE, codexCommand, connectClient, disconnectClient, hermesSettings, manualSettings } from "@blkc-code/connect";
import { VERSION } from "../version.js";
import { STATE_FILE, areaForFile, evolveKitMap, kitStore, projectRoot, readMap, resolveKit, updateOfficeState, writeMap } from "../office/state.js";

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
  console.log(chalk.cyan(JSON.stringify(manualSettings(path.resolve(kit)), null, 2)));
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
        const kit = await resolveKit(options.kit, process.cwd());
        await serveOverStdio(kitStore(kit), {
          version: VERSION,
          areaForFile: (file) => areaForFile(kit, projectRoot(kit, process.cwd()), file),
          banner: `BLKC office MCP server: ${path.basename(kit)}`,
        });
      } catch (error) {
        fail(error);
      }
    });

  office
    .command("set <agent> <state>")
    .description(`Say what an agent is doing. State: ${AGENT_STATES.join(", ")}.`)
    .option("--task <words>", "What it is doing")
    .option("--role <role>", "Its role")
    .option("--file <path>", "A file it is working on, which sends it to that room")
    .option("--kit <path>", "The Kit, if there is more than one")
    .action(async (agent: string, state: string, options: { task?: string; role?: string; file?: string; kit?: string }) => {
      try {
        const kit = await resolveKit(options.kit, process.cwd());
        const area = options.file ? await areaForFile(kit, projectRoot(kit, process.cwd()), options.file) : undefined;
        await updateOfficeState(kit, (current) => {
          const me = setAgent(current, { name: agent, state, task: options.task ?? "", ...(options.role ? { role: options.role } : {}) });
          if (area) me.area = area;
        });
        console.log(`${agent} is now ${state}.`);
      } catch (error) {
        fail(error);
      }
    });

  office
    .command("next <agent>")
    .description("Pick up an agent's next quest, and print it as JSON. For scripts and agents without MCP.")
    .option("--kit <path>", "The Kit, if there is more than one")
    .action(async (agent: string, options: { kit?: string }) => {
      try {
        const kit = await resolveKit(options.kit, process.cwd());
        let picked: { title: string; detail?: string } | undefined;
        await updateOfficeState(kit, (current) => {
          const me = setAgent(current, { name: agent });
          const quest = nextTask(current, me.id);
          if (!quest) return;
          quest.state = "doing";
          quest.agent = me.id;
          me.state = "working";
          me.task = quest.title;
          picked = { title: quest.title, detail: quest.detail ?? "" };
        });
        console.log(JSON.stringify(picked ?? null));
      } catch (error) {
        fail(error);
      }
    });

  office
    .command("map")
    .description("Generate this project's map, or bring it up to date.")
    .option("--reset", "Start again. This discards rooms you edited by hand")
    .option("--seed <text>", "Use a different seed, to get a different building")
    .option("--freeze", "Stop the map following the project")
    .option("--follow", "Make the map follow the project again")
    .option("--kit <path>", "The Kit, if there is more than one")
    .action(async (options: { reset?: boolean; seed?: string; freeze?: boolean; follow?: boolean; kit?: string }) => {
      try {
        const kit = await resolveKit(options.kit, process.cwd());
        const root = projectRoot(kit, process.cwd());
        if (options.freeze || options.follow) {
          const current = await readMap(kit);
          if (current) await writeMap(kit, { ...current, evolve: Boolean(options.follow) });
        }
        const { map, changes, omitted } = await evolveKitMap(kit, root, { reset: options.reset, seed: options.seed });
        console.log(`${chalk.green("Map")}: ${map.rooms.length} rooms, ${map.furniture.length} pieces of furniture, ${map.cols}x${map.rows}${map.evolve ? "" : " (frozen)"}`);
        for (const room of map.rooms.filter((candidate) => candidate.role !== "hall")) console.log(chalk.gray(`  ${room.name}${room.paths[0] ? ` : ${room.paths[0]}` : ""}`));
        for (const change of changes) console.log(change);
        if (map.links?.length) console.log(chalk.gray(`${map.links.length} links between rooms from your package files, ${map.links.filter((link) => link.door).length} with a door.`));
        if (omitted > 0) console.log(chalk.yellow(`${omitted} smaller folders aren't on the map; agents working there use the lobby.`));
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
    .description("Connect an agent: claude, cursor, vscode, gemini, opencode, codex, hermes, or other.")
    .option("--kit <path>", "The Kit, if there is more than one")
    .option("--no-hooks", "Claude Code: use MCP only, without automatic status updates")
    .option("--auto-work", "Claude Code: start the next assigned quest by itself at the end of each turn")
    .action(async (agent: string | undefined, options: { kit?: string; hooks: boolean; autoWork?: boolean }) => {
      try {
        // Settings belong at the top of the repo, wherever this was run from.
        const root = projectRoot(process.cwd());
        const kitDir = await resolveKit(options.kit, process.cwd());
        const kit = path.relative(root, kitDir) || ".";
        const name = agent ?? "other";

        if (name === "other") {
          printManual(kit);
          console.log(chalk.gray("\nOr have blkc write the settings: blkc office connect claude|cursor|vscode|gemini|opencode|codex|hermes"));
          return;
        }
        if (name === "hermes") {
          console.log("Add this under mcp_servers in ~/.hermes/config.yaml. It applies to every Hermes session on this machine:");
          console.log(chalk.cyan(hermesSettings(kitDir, root)));
          return;
        }
        if (name === "codex") {
          console.log("Run this to add the office to Codex:");
          console.log(chalk.cyan(codexCommand(kitDir)));
          return;
        }
        const result = await connectClient(name, { root, kit, hooks: options.hooks, autoWork: options.autoWork });
        console.log(`${chalk.green("Connected")} ${result.label}: ${result.file}`);
        if (result.hooks) {
          console.log(`${chalk.green("Automatic updates")} on: .claude/settings.local.json, ${HOOK_FILE}`);
          console.log(chalk.gray("They record the kind of action, a file's name and its room, never commands, prompts or contents."));
          console.log(chalk.gray("Quests assigned to Claude are handed over when a session starts and with each prompt."));
          if (options.autoWork) console.log(chalk.yellow("Auto-work is on: Claude starts the next assigned quest by itself when it finishes a turn."));
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
        const root = projectRoot(process.cwd());
        const names = agent ? [agent] : Object.keys(PROJECT_CLIENTS);
        for (const name of names) {
          if (await disconnectClient(name, root)) console.log(`Disconnected ${PROJECT_CLIENTS[name]?.label}.`);
        }
      } catch (error) {
        fail(error);
      }
    });
}
