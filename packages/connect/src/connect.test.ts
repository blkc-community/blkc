import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HOOK_FILE, SERVER_NAME, codexCommand, connectClient, disconnectClient, manualSettings } from "./index.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), "blkc-connect-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

const json = async (file: string): Promise<Record<string, any>> => JSON.parse(await readFile(path.join(root, file), "utf8"));
const exists = (file: string): Promise<boolean> => stat(path.join(root, file)).then(() => true, () => false);
const options = (extra = {}) => ({ root, kit: "kits/office", ...extra });

describe("connectClient", () => {
  it("writes each agent's own settings format", async () => {
    await connectClient("cursor", options());
    await connectClient("vscode", options());
    expect((await json(".cursor/mcp.json"))["mcpServers"][SERVER_NAME].args).toContain("${workspaceFolder}/kits/office");
    expect((await json(".vscode/mcp.json"))["servers"][SERVER_NAME].type).toBe("stdio");
  });

  it("keeps the other servers already there", async () => {
    await writeFile(path.join(root, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    await connectClient("claude", options({ hooks: false }));
    const config = await json(".mcp.json");
    expect(config["mcpServers"].other).toEqual({ command: "x" });
    expect(config["mcpServers"][SERVER_NAME]).toBeDefined();
  });

  it("refuses to overwrite settings it can't read", async () => {
    await writeFile(path.join(root, ".mcp.json"), "{ // a comment\n}");
    await expect(connectClient("claude", options())).rejects.toThrow("left alone");
    expect(await readFile(path.join(root, ".mcp.json"), "utf8")).toContain("a comment");
  });

  it("leaves nothing half done when Claude's hook settings can't be read", async () => {
    await mkdir(path.join(root, ".claude"));
    await writeFile(path.join(root, ".claude/settings.local.json"), "not json");
    await expect(connectClient("claude", options())).rejects.toThrow("left alone");
    expect(await exists(".mcp.json")).toBe(false);
    expect(await exists(HOOK_FILE)).toBe(false);
  });

  it("only makes the hook wait when it has to", async () => {
    await connectClient("claude", options());
    const hooks = (await json(".claude/settings.local.json"))["hooks"];
    expect(hooks.SessionStart[0].hooks[0].async).toBeUndefined();
    expect(hooks.PreToolUse[0].hooks[0].async).toBe(true);
    expect(hooks.Stop[0].hooks[0].async).toBe(true);
    await connectClient("claude", options({ autoWork: true }));
    const again = (await json(".claude/settings.local.json"))["hooks"];
    expect(again.Stop).toHaveLength(1);
    expect(again.Stop[0].hooks[0].async).toBeUndefined();
  });

  it("rejects an unknown agent", async () => {
    await expect(connectClient("skynet", options())).rejects.toThrow("Unknown agent");
  });
});

describe("disconnectClient", () => {
  it("removes only what connect added", async () => {
    await mkdir(path.join(root, ".claude"));
    const theirs = { hooks: [{ type: "command", command: "their-tool" }] };
    await writeFile(path.join(root, ".claude/settings.local.json"), JSON.stringify({ model: "x", hooks: { Stop: [theirs] } }));
    await writeFile(path.join(root, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    await connectClient("claude", options());
    expect(await disconnectClient("claude", root)).toBe(true);

    expect((await json(".mcp.json"))["mcpServers"]).toEqual({ other: { command: "x" } });
    expect(await json(".claude/settings.local.json")).toEqual({ model: "x", hooks: { Stop: [theirs] } });
    expect(await exists(HOOK_FILE)).toBe(false);
  });

  it("says so when there was nothing to remove", async () => {
    expect(await disconnectClient("cursor", root)).toBe(false);
  });
});

describe("agents whose settings live elsewhere", () => {
  it("gives the settings to paste, or the command to run", () => {
    expect(manualSettings("/k")[SERVER_NAME]).toMatchObject({ command: "npx" });
    expect(codexCommand("/k")).toContain("codex mcp add blkc-office -- npx");
  });
});
