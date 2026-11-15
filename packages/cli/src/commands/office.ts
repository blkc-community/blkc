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
import { AGENT_STATES, nextTask, normalizeState, removeAgent, runVerifyCommand, serveOverStdio, setAgent, type OfficeLogbook, type OfficeLogbookEntry } from "@blkc-code/agents";
import { createHerdrBridge } from "@blkc-code/herdr";
import { Logbook } from "@blkc-code/logbook";
import { PROJECT_CLIENTS, HOOK_FILE, codexCommand, connectClient, disconnectClient, hermesSettings, manualSettings } from "@blkc-code/connect";
import { scanTree, type TreeNode } from "@blkc-code/mapgen";
import { VERSION } from "../version.js";
import { STATE_FILE, areaForFile, evolveKitMap, kitStore, projectRoot, readMap, readOfficeState, readTreeOptions, resolveKit, updateOfficeState, writeMap } from "../office/state.js";

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

class OfficeLogbookAdapter implements OfficeLogbook {
  private lb: Logbook;
  constructor(filePath: string) { this.lb = new Logbook({ filePath }); }
  async append(input: { actor: { name: string; role?: string }; event: string; subject?: { type: string; id: string }; data?: Record<string, unknown>; proof?: Record<string, unknown> }): Promise<OfficeLogbookEntry> {
    const entry = await this.lb.append({ actor: { name: input.actor.name, role: input.actor.role }, event: input.event, subject: input.subject as { type: "block" | "kit" | "circuit" | "site" | "page" | "board" | "card" | "mcp"; id: string; tenant?: string } | undefined, data: input.data, proof: input.proof });
    return { id: entry.id, timestamp: entry.timestamp, actor: { name: entry.actor.name, role: entry.actor.role }, event: entry.event, subject: entry.subject, data: entry.data, proof: entry.proof };
  }
  async recent(n = 20): Promise<OfficeLogbookEntry[]> {
    const all = await this.lb.readAll();
    return all.slice(-n).map((e) => ({ id: e.id, timestamp: e.timestamp, actor: { name: e.actor.name, role: e.actor.role }, event: e.event, subject: e.subject, data: e.data, proof: e.proof }));
  }
  async verify(): Promise<{ valid: boolean; issues: { index: number; message: string }[] }> {
    const r = await this.lb.verify();
    return { valid: r.valid, issues: r.issues.map((i) => ({ index: i.index, message: i.message })) };
  }
}

export function registerOfficeCommand(program: Command): void {
  const office = program.command("office").description("Connect agents on this machine to a Kit's office.");

  office
    .command("mcp")
    .description("Run the MCP server, for any agent that speaks MCP.")
    .option("--kit <path>", "The Kit, if there is more than one")
    .option("--logbook", "Record an audit logbook (on by default).", true)
    .action(async (options: { kit?: string; logbook?: boolean }) => {
      try {
        const kit = await resolveKit(options.kit, process.cwd());
        const root = projectRoot(kit, process.cwd());
        const areaForFileFn = (file: string) => areaForFile(kit, root, file);
        const herdr = createHerdrBridge({
          areaForCwd: (cwd: string) => areaForFile(kit, root, path.join(cwd, "_")),
        });
        const logbook = options.logbook === false ? undefined : new OfficeLogbookAdapter(path.join(kit, "logbook", "log.jsonl"));
        await serveOverStdio(kitStore(kit), {
          version: VERSION,
          areaForFile: areaForFileFn,
          root,
          herdr: herdr.available() ? herdr : undefined,
          logbook,
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
    .command("tree")
    .description("Show how this project reads as a world: its roads, buildings, items and loose files.")
    .option("--kit <path>", "The Kit, if there is more than one")
    .option("--json", "Print it as JSON")
    .action(async (options: { kit?: string; json?: boolean }) => {
      try {
        const root = projectRoot(process.cwd());
        const kit = await resolveKit(options.kit, process.cwd()).catch(() => undefined);
        const tree = scanTree(root, readTreeOptions(kit, root));
        if (options.json) {
          console.log(JSON.stringify(tree, null, 2));
          return;
        }
        const show = (node: TreeNode, depth: number): void => {
          const pad = "  ".repeat(depth);
          const count = node.files === undefined ? "" : chalk.gray(` ${node.files} files`);
          if (node.kind === "file") return;
          if (node.kind === "group") console.log(`${pad}${chalk.yellow(node.name)} ${chalk.gray(node.children.map((file) => file.name).join(", "))}`);
          else if (node.kind === "part") console.log(`${pad}${chalk.cyan(node.item ?? "Item")}: ${node.name}${count}`);
          else console.log(`${pad}${node.kind === "road" ? chalk.bold(node.path || "/") : chalk.green(node.name)}${count}`);
          for (const child of node.children) show(child, depth + 1);
        };
        show(tree.root, 0);
        if (tree.secrets.length > 0) console.log(`${chalk.red("Vault")} ${chalk.gray(tree.secrets.map((file) => file.path).join(", "))}`);
        if (tree.truncated) console.log(chalk.yellow("This project is very large, so the scan stopped early and some of it isn't shown."));
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
        for (const room of map.rooms.filter((candidate) => candidate.role !== "hall" && candidate.role !== "vacant")) console.log(chalk.gray(`  ${room.name}${room.paths[0] ? ` : ${room.paths[0]}` : ""}`));
        for (const change of changes) console.log(change);
        if (map.links?.length) console.log(chalk.gray(`${map.links.length} links between rooms from your package files, ${map.links.filter((link) => link.door).length} with a door.`));
        if (omitted > 0) console.log(chalk.yellow(map.layout === "roads" ? "This project is very large, so the scan stopped early and part of it isn't on the map." : `${omitted} smaller folders aren't on the map; agents working there use the lobby.`));
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
    .command("finish <agent> [quest]")
    .description("Mark an agent's current (or named) quest done. For scripts and agents without MCP.")
    .option("--kit <path>", "The Kit, if there is more than one")
    .action(async (agent: string, quest: string | undefined, options: { kit?: string }) => {
      try {
        const kit = await resolveKit(options.kit, process.cwd());
        let finished: string | null = null;
        await updateOfficeState(kit, (current) => {
          const me = setAgent(current, { name: agent });
          const found = quest
            ? current.tasks.find((t) => t.title.toLowerCase() === quest.toLowerCase())
            ?? current.tasks[Number(quest) - 1]
            : current.tasks.find((t) => t.state === "doing" && t.agent === me.id);
          if (!found) throw new Error("No quest to finish. Name one by title or number, or pick one up first.");
          if (found.state !== "done") { found.state = "done"; finished = found.title; }
          me.state = "done";
          me.task = `Finished: ${found.title}`;
        });
        console.log(JSON.stringify({ finished }));
      } catch (error) {
        fail(error);
      }
    });

  office
    .command("work <agent>")
    .description("Pick up and finish quests one at a time, for scripts and agents without MCP. Prints each quest as JSON and waits for it to be marked done.")
    .option("--kit <path>", "The Kit, if there is more than one")
    .option("--once", "Handle a single quest, then exit")
    .option("--poll <ms>", "How often to check for completion", "1000")
    .option("--timeout <seconds>", "Give up waiting after this many seconds", "0")
    .action(async (agent: string, options: { kit?: string; once?: boolean; poll?: string; timeout?: string }) => {
      try {
        const kit = await resolveKit(options.kit, process.cwd());
        const pollMs = Math.max(250, Number(options.poll) || 1000);
        const timeoutMs = (Number(options.timeout) || 0) * 1000;
        const loop = async (): Promise<void> => {
          while (true) {
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
            if (!picked) {
              console.log(JSON.stringify({ quest: null }));
              return;
            }
            console.log(JSON.stringify({ quest: picked, finish: `blkc office finish ${JSON.stringify(agent)}` }));
            // Wait for the quest to be marked done (by `blkc office finish` or MCP).
            const started = Date.now();
            while (true) {
              if (timeoutMs > 0 && Date.now() - started > timeoutMs) {
                console.error(chalk.red(`Timed out waiting for ${picked.title} to finish.`));
                process.exitCode = 1;
                return;
              }
              await new Promise((resolve) => setTimeout(resolve, pollMs));
              const state = await readOfficeState(kit);
              const done = state.tasks.find((t) => t.title === picked!.title && t.state === "done");
              if (done) {
                console.log(JSON.stringify({ finished: picked.title }));
                break;
              }
            }
            if (options.once) return;
          }
        };
        await loop();
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

  office
    .command("validate <quest>")
    .description("Run a quest's verify command and report a pass/fail verdict with evidence.")
    .option("--command <cmd>", "Override the quest's verify command")
    .option("--agent <name>", "Who reports the verdict")
    .option("--kit <path>", "The Kit, if there is more than one")
    .action(async (quest: string, options: { command?: string; agent?: string; kit?: string }) => {
      try {
        const kit = await resolveKit(options.kit, process.cwd());
        const root = projectRoot(kit, process.cwd());
        const state = await readOfficeState(kit);
        const found = state.tasks.find((t, i) => t.title.toLowerCase() === quest.toLowerCase() || i + 1 === Number(quest));
        if (!found) throw new Error(`There is no quest "${quest}".`);
        const cmd = options.command ?? found.verify;
        if (!cmd) throw new Error(`Quest "${found.title}" has no verify command. Pass --command or set verify on the quest.`);

        // Quest verify strings can be written by any connected agent: never through a shell.
        const { pass, evidence } = runVerifyCommand(cmd, root);

        await updateOfficeState(kit, (current) => {
          const target = current.tasks.find((t) => t.title === found.title);
          if (!target) return;
          target.verdict = pass ? "pass" : "fail";
          target.evidence = evidence;
          if (pass) {
            target.state = "done";
          } else {
            target.state = "todo";
            target.detail = [target.detail, `Validation failed: ${evidence}`.slice(0, 1000)].filter(Boolean).join("\\n");
          }
        });

        console.log(pass ? chalk.green(`PASS: ${found.title}`) : chalk.red(`FAIL: ${found.title}`));
        if (evidence) console.log(chalk.gray(evidence.slice(0, 500)));
        process.exitCode = pass ? 0 : 1;
      } catch (error) {
        fail(error);
      }
    });

  office
    .command("test <feature>")
    .description("Run every verify command of a feature's child tasks and record verdicts.")
    .option("--kit <path>", "The Kit, if there is more than one")
    .action(async (feature: string, options: { kit?: string }) => {
      try {
        const kit = await resolveKit(options.kit, process.cwd());
        const root = projectRoot(kit, process.cwd());
        const state = await readOfficeState(kit);
        const parent = state.tasks.find((t) => t.title.toLowerCase() === feature.toLowerCase());
        if (!parent) throw new Error(`There is no quest "${feature}".`);
        const children = state.tasks.filter((t) => t.parent === parent.title);
        if (children.length === 0) {
          console.log(chalk.yellow(`No child tasks for "${parent.title}".`));
          return;
        }
        let passed = 0;
        let failed = 0;
        for (const child of children) {
          if (!child.verify) {
            console.log(chalk.gray(`SKIP (no verify): ${child.title}`));
            continue;
          }
          const { pass, evidence } = runVerifyCommand(child.verify, root);
          await updateOfficeState(kit, (current) => {
            const target = current.tasks.find((t) => t.title === child.title);
            if (!target) return;
            target.verdict = pass ? "pass" : "fail";
            target.evidence = evidence;
            target.state = pass ? "done" : "todo";
          });
          if (pass) { passed++; console.log(chalk.green(`PASS: ${child.title}`)); }
          else { failed++; console.log(chalk.red(`FAIL: ${child.title}`)); if (evidence) console.log(chalk.gray(evidence.slice(0, 300))); }
        }
        console.log(chalk.bold(`\\n${passed} passed, ${failed} failed out of ${children.length} tasks.`));
        process.exitCode = failed > 0 ? 1 : 0;
      } catch (error) {
        fail(error);
      }
    });

  office
    .command("audit")
    .description("Verify the office audit logbook's hash chain and print recent entries.")
    .option("--limit <n>", "How many recent entries to show", "20")
    .option("--kit <path>", "The Kit, if there is more than one")
    .action(async (options: { limit?: string; kit?: string }) => {
      try {
        const kit = await resolveKit(options.kit, process.cwd());
        const logbook = new OfficeLogbookAdapter(path.join(kit, "logbook", "log.jsonl"));
        const entries = await logbook.recent(Number(options.limit) || 20);
        const verification = await logbook.verify();
        console.log(verification.valid ? chalk.green("Audit chain: valid") : chalk.red("Audit chain: BROKEN"));
        if (verification.issues.length) console.log(chalk.red(JSON.stringify(verification.issues, null, 2)));
        console.log(chalk.gray(`${entries.length} recent entries:`));
        for (const e of entries) console.log(`${e.timestamp}  ${e.actor.name}  ${e.event}${e.subject ? `  ${e.subject.type}:${e.subject.id}` : ""}`);
      } catch (error) {
        fail(error);
      }
    });

  office
    .command("presentation")
    .description("Show the office presentation config (separate file, forkable).")
    .option("--kit <path>", "The Kit, if there is more than one")
    .action(async (options: { kit?: string }) => {
      try {
        const kit = await resolveKit(options.kit, process.cwd());
        const file = path.join(kit, "presentation.json");
        let config: unknown;
        try { config = JSON.parse(await readFile(file, "utf8")); } catch { config = null; }
        if (!config) console.log(chalk.yellow("No presentation.json yet. Run: blkc office presentation init"));
        else console.log(JSON.stringify(config, null, 2));
      } catch (error) {
        fail(error);
      }
    });

  office
    .command("presentation:init")
    .description("Create a default presentation.json (separate, forkable config).")
    .option("--kit <path>", "The Kit, if there is more than one")
    .action(async (options: { kit?: string }) => {
      try {
        const kit = await resolveKit(options.kit, process.cwd());
        const file = path.join(kit, "presentation.json");
        const { DEFAULT_PRESENTATION } = await import("@blkc-code/agents");
        await writeFile(file, JSON.stringify(DEFAULT_PRESENTATION, null, 2) + "\\n");
        console.log(chalk.green(`Wrote ${file}`));
      } catch (error) {
        fail(error);
      }
    });

  office
    .command("run <name>")
    .description("Organise a run: print the ordered task list for an agent or role, with dependencies.")
    .option("--role <role>", "Filter by role")
    .option("--kit <path>", "The Kit, if there is more than one")
    .action(async (_name: string, options: { role?: string; kit?: string }) => {
      try {
        const kit = await resolveKit(options.kit, process.cwd());
        const state = await readOfficeState(kit);
        const tasks = state.tasks.filter((t) => (options.role ? t.role === options.role : true));
        // order by parent dependency: parents first
        const byTitle = new Map(tasks.map((t) => [t.title, t]));
        const ordered: typeof tasks = [];
        const seen = new Set<string>();
        const visit = (t: (typeof tasks)[number]) => {
          if (seen.has(t.title)) return;
          if (t.parent && byTitle.has(t.parent)) visit(byTitle.get(t.parent)!);
          seen.add(t.title);
          ordered.push(t);
        };
        tasks.forEach(visit);
        console.log(JSON.stringify(ordered.map((t) => ({
          title: t.title, state: t.state, kind: t.kind, role: t.role, parent: t.parent,
          verify: t.verify, verdict: t.verdict, agent: t.agent,
        })), null, 2));
      } catch (error) {
        fail(error);
      }
    });
}
