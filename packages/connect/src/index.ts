/**
 * BLKC Connect: wires the agents on a machine up to a local MCP server, by writing each
 * agent's own settings. It merges with what is there, and refuses to overwrite settings it
 * can't read.
 *
 * @package @blkc-code/connect
 * @license Apache-2.0
 */

import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { HOOK_FILE, hookScript } from "./hook-script.js";

export { HOOK_FILE, hookScript };

export const SERVER_NAME = "blkc-office";
const HOOK_COMMAND = `node "\${CLAUDE_PROJECT_DIR}/${HOOK_FILE}" || true`;
const HOOK_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "Notification", "Stop", "SessionEnd", "SubagentStart", "SubagentStop"];
/** These can hand quests to Claude, which only works if it waits for them. */
const SYNC_EVENTS = new Set(["SessionStart", "UserPromptSubmit"]);

type Json = Record<string, unknown>;

/** Agents whose settings file lives in the project, so we can write it. */
export const PROJECT_CLIENTS: Record<string, { label: string; file: string; key: string; kitPrefix: string; extra?: Json; entry?: (args: string[]) => Json }> = {
  claude: { label: "Claude Code", file: ".mcp.json", key: "mcpServers", kitPrefix: "" },
  cursor: { label: "Cursor", file: ".cursor/mcp.json", key: "mcpServers", kitPrefix: "${workspaceFolder}/" },
  vscode: { label: "VS Code", file: ".vscode/mcp.json", key: "servers", kitPrefix: "${workspaceFolder}/", extra: { type: "stdio" } },
  gemini: { label: "Gemini CLI", file: ".gemini/settings.json", key: "mcpServers", kitPrefix: "" },
  opencode: { label: "OpenCode", file: "opencode.json", key: "mcp", kitPrefix: "", entry: (args) => ({ type: "local", command: ["npx", ...args], enabled: true }) },
};

export const mcpArgs = (kit: string): string[] => ["-y", "@blkc-code/cli@latest", "office", "mcp", "--kit", kit];

/** For agents whose settings aren't in the project: the JSON to paste in. */
export const manualSettings = (kit: string): Json => ({ [SERVER_NAME]: { command: "npx", args: mcpArgs(kit) } });

/** Codex keeps its servers in the user's home folder, which isn't ours to edit. */
export const codexCommand = (kit: string): string => `codex mcp add ${SERVER_NAME} -- npx ${mcpArgs(kit).join(" ")}`;

/** Hermes keeps its servers in ~/.hermes/config.yaml, which isn't ours to edit either. Goes under mcp_servers. */
export const hermesSettings = (kit: string, root: string): string =>
  `  ${SERVER_NAME}:\n    command: "npx"\n    args: ${JSON.stringify(mcpArgs(kit))}\n    cwd: ${JSON.stringify(root)}`;

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

async function writeConfig(file: string, value: Json): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + "\n");
}

const isOurHook = (group: Json): boolean =>
  ((group["hooks"] as Json[]) ?? []).some((hook) => String(hook["command"] ?? "").includes(HOOK_FILE));

async function setHooks(root: string, on: boolean, autoWork = false): Promise<void> {
  const file = path.join(root, ".claude/settings.local.json");
  const settings = await readConfig(file);
  const hooks = (settings["hooks"] ?? {}) as Record<string, Json[]>;
  for (const event of HOOK_EVENTS) {
    const others = (hooks[event] ?? []).filter((group) => !isOurHook(group));
    const sync = SYNC_EVENTS.has(event) || (event === "Stop" && autoWork);
    const ours = on ? [{ hooks: [{ type: "command", command: HOOK_COMMAND, ...(sync ? {} : { async: true }) }] }] : [];
    if (others.length + ours.length > 0) hooks[event] = [...others, ...ours];
    else delete hooks[event];
  }
  if (Object.keys(hooks).length > 0) settings["hooks"] = hooks;
  else delete settings["hooks"];
  await writeConfig(file, settings);
}

export interface ConnectOptions {
  root: string;
  /** The Kit's folder, relative to root. */
  kit: string;
  /** Claude Code: report automatically through hooks. */
  hooks?: boolean;
  /** Claude Code: start the next assigned task at the end of each turn. */
  autoWork?: boolean;
}

/** Write one agent's settings. Throws for an agent with no settings in the project. */
export async function connectClient(name: string, options: ConnectOptions): Promise<{ label: string; file: string; hooks: boolean }> {
  const client = PROJECT_CLIENTS[name];
  if (!client) throw new Error(`Unknown agent "${name}". Use claude, cursor, vscode, gemini, opencode, codex, hermes or other.`);
  const file = path.join(options.root, client.file);
  const config = await readConfig(file);
  const hooks = name === "claude" && options.hooks !== false;
  // Hooks go first: if their settings can't be read, nothing half done is left behind.
  if (hooks) await setHooks(options.root, true, Boolean(options.autoWork));

  const servers = (config[client.key] ?? {}) as Json;
  const args = mcpArgs(client.kitPrefix + options.kit);
  servers[SERVER_NAME] = client.entry ? client.entry(args) : { ...client.extra, command: "npx", args };
  config[client.key] = servers;
  await writeConfig(file, config);

  if (hooks) {
    await mkdir(path.join(options.root, ".blkc"), { recursive: true });
    const script = path.join(options.root, HOOK_FILE);
    await writeFile(script, hookScript(options.kit, Boolean(options.autoWork)));
    await chmod(script, 0o755);
  }
  return { label: client.label, file: client.file, hooks };
}

/** Remove only what connectClient added. Returns whether there was a server to remove. */
export async function disconnectClient(name: string, root: string): Promise<boolean> {
  const client = PROJECT_CLIENTS[name];
  if (!client) throw new Error(`Unknown agent "${name}".`);
  const file = path.join(root, client.file);
  const config = await readConfig(file);
  const servers = config[client.key] as Json | undefined;
  const had = Boolean(servers?.[SERVER_NAME]);
  if (had) {
    delete (servers as Json)[SERVER_NAME];
    await writeConfig(file, config);
  }
  if (name === "claude") {
    await setHooks(root, false);
    await rm(path.join(root, HOOK_FILE), { force: true });
  }
  return had;
}
