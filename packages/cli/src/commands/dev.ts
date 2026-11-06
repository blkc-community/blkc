/**
 * BLKC CLI - Dev Command
 *
 * `blkc dev [path]` previews every Block, Kit and Circuit in a folder in the
 * browser, at phone, tablet and desktop widths. It reloads on save and shows
 * `blkc check` errors, with their codes, in the page.
 *
 * It listens on localhost only and reads from disk on each request, so what you
 * see is always the files as saved.
 */

/* global fetch, AbortSignal */
import chalk from "chalk";
import { Command } from "commander";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { FSWatcher, watch } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { clearInterval, clearTimeout, setInterval, setTimeout } from "node:timers";
import { URL } from "node:url";
import { errorCodeDocsUrl, findErrorCode, parseAny, parseAnyCircuit, parseAnyKit } from "@blkc-code/core";
import { kitPages, themeJsonToVariables } from "@blkc-code/render-web";
import { renderManifestDocument } from "@blkc-code/render-web/server";
import stylesheet from "@blkc-code/render-web/styles.css";
import canvasRuntime from "@blkc-code/render-canvas/runtime.txt";
import { discover, kindOf, validateOne, type CheckIssue } from "./check.js";
import { SHELL_HTML, SHELL_JS } from "./dev-shell.js";
import { findComponentFile, syncLocalBlocks, type LocalBlock } from "./local-blocks.js";
import { OFFICE_HTML, OFFICE_JS } from "../office/app.js";
import { MAX_STATE_BYTES, diffEvents, normalizeState, type AgentsState } from "@blkc-code/agents";
import { hashText, type OfficeMap } from "@blkc-code/mapgen";
import { STATE_FILE, MAP_FILE, evolveKitMap, findOfficeBlock, findOfficeKits, projectRoot, readMap, readOfficeState, updateOfficeState, writeMap } from "../office/state.js";

const DEFAULT_PORT = 4173;
const PORT_ATTEMPTS = 20;
const IGNORED = new Set(["node_modules", ".git", "dist", ".next", "coverage"]);
const IGNORED_FILES = /\.(lock|tmp)$/;

type Kind = "block" | "kit" | "circuit";

interface Item {
  id: string;
  kind: Kind;
  name: string;
  file: string;
  valid: boolean;
  pages: { slug: string; title: string }[];
}

interface State {
  items: Item[];
  issues: CheckIssue[];
  warnings: string[];
}

type Json = Record<string, unknown>;

const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, "utf8"));

/** Companion files beside a manifest; one that does not parse is reported by check, and skipped here. */
async function readCompanions(dir: string): Promise<Json[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const out: Json[] = [];
  for (const name of names) {
    try {
      out.push((await readJson(path.join(dir, name))) as Json);
    } catch {
      // reported by check
    }
  }
  return out;
}

/** office-state.json beside a Kit overrides who and what its office shows, so anything can drive it. */
async function applyOfficeState(dir: string, pages: Json[]): Promise<void> {
  let state: Json = {};
  try {
    state = (await readJson(path.join(dir, "office-state.json"))) as Json;
  } catch {
    // none yet, or half written: the next save reloads this
  }
  const map = await readMap(dir);
  for (const page of pages) {
    for (const block of (page["blocks"] ?? []) as { block?: string; props?: Json }[]) {
      if (block.block !== "office" && !Array.isArray(block.props?.["agents"])) continue;
      block.props = {
        ...block.props,
        ...(map ? { cols: map.cols, rows: map.rows, rooms: map.rooms, doors: map.doors, furniture: map.furniture } : {}),
        ...(Array.isArray(state["agents"]) ? { agents: state["agents"] } : {}),
        ...(Array.isArray(state["tasks"]) ? { tasks: state["tasks"] } : {}),
      };
    }
  }
}

/** A manifest as the renderer needs it, with theme.json, pages/ and boards/ folded in. */
async function loadManifest(file: string, kind: Kind): Promise<Json> {
  const raw = await readJson(file);
  const dir = path.dirname(file);
  if (kind === "block") {
    return { ...(parseAny(raw).value as unknown as Json), example: (raw as Json)["example"] };
  }
  if (kind === "circuit") {
    const circuit = parseAnyCircuit(raw).value as unknown as Json & { boards: Json[] };
    const inline = new Set(circuit.boards.map((board) => board["id"]));
    const extra = (await readCompanions(path.join(dir, "boards"))).filter((board) => !inline.has(board["id"]));
    return { ...circuit, boards: [...circuit.boards, ...extra] };
  }
  const kit = parseAnyKit(raw).value as unknown as Json & { content?: { pages?: Json[] }; theme?: unknown };
  const files = await readCompanions(path.join(dir, "pages"));
  const fromFiles = new Set(files.map((page) => page["slug"]));
  const inline = (kit.content?.pages ?? []).filter((page) => !fromFiles.has(page["slug"]));
  let theme = kit.theme;
  if (!theme) {
    try {
      theme = await readJson(path.join(dir, "theme.json"));
    } catch {
      // no theme.json, or one check is already reporting
    }
  }
  const pages = [...files, ...inline];
  await applyOfficeState(dir, pages);
  return { ...kit, theme, content: { pages } };
}

const announced = new Set<string>();

async function scan(root: string): Promise<{ state: State; files: Map<string, Item>; css: string }> {
  const issues: CheckIssue[] = [];
  const warnings: string[] = [];
  const files = new Map<string, Item>();
  const localBlocks: LocalBlock[] = [];
  for (const file of await discover([root])) {
    const result = await validateOne(file);
    issues.push(...result.issues);
    warnings.push(...result.warnings.map((message) => `${path.relative(process.cwd(), file)}: ${message}`));
    const kind = kindOf(file);
    if (kind !== "block" && kind !== "kit" && kind !== "circuit") continue;
    const id = path.relative(process.cwd(), path.dirname(file)) || path.basename(path.dirname(file));
    const item: Item = { id, kind, name: id, file, valid: result.ok, pages: [] };
    if (result.ok) {
      try {
        const manifest = await loadManifest(file, kind);
        item.name = typeof manifest["name"] === "string" ? manifest["name"] : id;
        if (kind === "kit") item.pages = kitPages(manifest);
        const component = kind === "block" ? findComponentFile(path.dirname(file)) : undefined;
        if (component && typeof manifest["id"] === "string") localBlocks.push({ id: manifest["id"], file: component });
      } catch {
        item.valid = false;
      }
    }
    files.set(id, item);
  }

  const local = await syncLocalBlocks(localBlocks);
  for (const file of local.loaded) {
    if (announced.has(file)) continue;
    announced.add(file);
    console.log(chalk.gray(`Running your component: ${path.relative(process.cwd(), file)}`));
  }
  for (const { file, message } of local.errors) {
    const rel = path.relative(process.cwd(), file) || file;
    issues.push({ code: "BLKC-E100", file: rel, field: "", message, fix: "Fix the error in that file and save.", docs: errorCodeDocsUrl("BLKC-E100") });
  }
  return { state: { items: [...files.values()], issues, warnings }, files, css: local.css };
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const FRAME_HEAD = `<style>${stylesheet}</style>`;

// A frame holds rendered manifest content, so the only script it can run is our canvas runtime, and it
// has no network beyond images and web fonts.
const frameCsp = (nonce?: string): string =>
  `default-src 'none'; ${nonce ? `script-src 'nonce-${nonce}'; ` : ""}style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src * data:; base-uri 'self'`;
const FRAME_CSP = frameCsp();
const SHELL_CSP = "default-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'";

/** The app can change files, so only this page may ask it to: a request from any other site carries its own Origin. */
function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return false;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function readBody(req: IncomingMessage, limit: number): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) return undefined;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function send(res: ServerResponse, status: number, type: string, body: string, csp?: string): void {
  res.writeHead(status, {
    "Content-Type": `${type}; charset=utf-8`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(csp ? { "Content-Security-Policy": csp } : {}),
  });
  res.end(body);
}

function messageFrame(message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>BLKC preview</title><body style="font:14px system-ui;padding:2rem;color:#444">${escapeHtml(message)}</body>`;
}

/** Only answer to localhost names, so a web page can't reach this server through DNS rebinding. */
function isLocalHost(req: IncomingMessage): boolean {
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export interface DevServer {
  server: Server;
  port: number;
  close: () => void;
}

/** A desktop notification. The text goes in as arguments, never as part of a script. */
function desktopNotify(title: string, message: string): void {
  const run = (command: string, args: string[]): void => {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => undefined);
    child.unref();
  };
  if (process.platform === "darwin") {
    run("osascript", ["-e", "on run argv", "-e", "display notification (item 2 of argv) with title (item 1 of argv)", "-e", "end run", title, message]);
  } else if (process.platform === "linux") {
    run("notify-send", ["--", title, message]);
  }
}

/** What needs a person's attention, between one state of the office and the next. */
export function alertsBetween(before: AgentsState | undefined, after: AgentsState): { title: string; message: string }[] {
  const out: { title: string; message: string }[] = [];
  for (const event of diffEvents(before, after)) {
    if (event.type === "agent.blocked") out.push({ title: `${event.agent.name} needs you`, message: event.agent.task || "This agent is stuck." });
    if (event.type === "agent.finished") out.push({ title: `${event.agent.name} finished`, message: event.agent.task || "Ready for what is next." });
  }
  return out;
}

export async function startDevServer(root: string, port: number, exactPort: boolean, options: { notify?: boolean } = {}): Promise<DevServer> {
  const clients = new Set<ServerResponse>();

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!isLocalHost(req)) return send(res, 403, "text/plain", "blkc dev only answers on localhost.");
    const url = new URL(req.url ?? "/", "http://localhost");
    const officeKit = async (): Promise<string | undefined> => {
      const kits = await findOfficeKits(root);
      const wanted = url.searchParams.get("item") ?? "";
      // Looked up among what the scan found, never joined to a path from the URL.
      return kits.find((dir) => (path.relative(process.cwd(), dir) || ".") === wanted);
    };
    if (url.pathname === "/api/office" && req.method === "PUT") {
      if (!isSameOrigin(req)) return send(res, 403, "text/plain", "This only accepts changes from the office page.");
      if (!(req.headers["content-type"] ?? "").startsWith("application/json")) return send(res, 415, "text/plain", "Send JSON.");
      const dir = await officeKit();
      if (!dir) return send(res, 404, "text/plain", "No such office.");
      const body = await readBody(req, MAX_STATE_BYTES);
      if (body === undefined) return send(res, 413, "text/plain", "That is too large.");
      let incoming;
      try {
        incoming = normalizeState(JSON.parse(body));
      } catch {
        return send(res, 400, "text/plain", "That is not valid JSON.");
      }
      const saved = await updateOfficeState(dir, (state) => {
        state.agents = incoming.agents;
        state.tasks = incoming.tasks;
      });
      return send(res, 200, "application/json", JSON.stringify(saved));
    }
    if (url.pathname === "/api/office/layout" && req.method === "PUT") {
      if (!isSameOrigin(req)) return send(res, 403, "text/plain", "This only accepts changes from the office page.");
      if (!(req.headers["content-type"] ?? "").startsWith("application/json")) return send(res, 415, "text/plain", "Send JSON.");
      const dir = await officeKit();
      if (!dir) return send(res, 404, "text/plain", "No such office.");
      const body = await readBody(req, 32 * 1024 * 1024);
      if (body === undefined) return send(res, 413, "text/plain", "That is too large.");
      let incoming: OfficeMap;
      try {
        incoming = JSON.parse(body) as OfficeMap;
      } catch {
        return send(res, 400, "text/plain", "That is not valid JSON.");
      }
      if (!Array.isArray(incoming.rooms) || !Array.isArray(incoming.doors) || !Array.isArray(incoming.furniture)) return send(res, 400, "text/plain", "That is not a map.");
      const current = await readMap(dir);
      await writeMap(dir, {
        version: 1,
        // What kind of map it is doesn't change when someone moves the furniture.
        ...(current?.world ? { world: current.world } : {}),
        ...(current?.layout ? { layout: current.layout, roomHeight: current.roomHeight } : {}),
        ...(current?.links ? { links: current.links } : {}),
        seed: current?.seed ?? "project",
        evolve: incoming.evolve !== false,
        cols: Math.min(1024, Math.max(6, Math.floor(Number(incoming.cols) || 24))),
        rows: Math.min(1024, Math.max(6, Math.floor(Number(incoming.rows) || 16))),
        rooms: incoming.rooms.slice(0, 8000),
        doors: incoming.doors.slice(0, 16000),
        furniture: incoming.furniture.slice(0, 60000),
        log: current?.log ?? [],
      });
      return send(res, 200, "application/json", "{}");
    }
    if (url.pathname === "/api/office/map" && req.method === "POST") {
      if (!isSameOrigin(req)) return send(res, 403, "text/plain", "This only accepts changes from the office page.");
      const dir = await officeKit();
      if (!dir) return send(res, 404, "text/plain", "No such office.");
      const { changes } = await evolveKitMap(dir, root, { reset: url.searchParams.get("reset") === "1" });
      return send(res, 200, "application/json", JSON.stringify({ changes }));
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "text/plain", "Method not allowed");
    if (url.pathname === "/office") return send(res, 200, "text/html", OFFICE_HTML, SHELL_CSP);
    if (url.pathname === "/office.js") return send(res, 200, "text/javascript", OFFICE_JS);
    if (url.pathname === "/canvas.js") return send(res, 200, "text/javascript", canvasRuntime);
    if (url.pathname === "/api/office/kits") {
      const kits = await findOfficeKits(root);
      return send(res, 200, "application/json", JSON.stringify(kits.map((dir) => path.relative(process.cwd(), dir) || ".")));
    }
    if (url.pathname === "/api/office") {
      const dir = await officeKit();
      if (!dir) return send(res, 404, "text/plain", "No such office.");
      const kit = JSON.parse(await readFile(path.join(dir, "kit.json"), "utf8")) as Json;
      let theme = kit["theme"];
      if (!theme) {
        try {
          theme = await readJson(path.join(dir, "theme.json"));
        } catch {
          // no theme: the office has its own colours
        }
      }
      const props = findOfficeBlock(dir) ?? {};
      const map = await readMap(dir);
      const scene = map ?? { cols: props["cols"], rows: props["rows"], rooms: props["rooms"], doors: props["doors"], furniture: props["furniture"] };
      const vars = themeJsonToVariables(theme as never);
      return send(res, 200, "application/json", JSON.stringify({ name: kit["name"], scene, vars, ...(await readOfficeState(dir)) }));
    }

    if (url.pathname === "/") return send(res, 200, "text/html", SHELL_HTML, SHELL_CSP);
    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname === "/shell.js") return send(res, 200, "text/javascript", SHELL_JS);
    if (url.pathname === "/api/state") {
      return send(res, 200, "application/json", JSON.stringify((await scan(root)).state));
    }
    if (url.pathname === "/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write(": connected\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (url.pathname === "/frame") {
      // The item comes from what the scan found, never from a path in the URL.
      const { files, css } = await scan(root);
      const item = files.get(url.searchParams.get("item") ?? "");
      if (!item) return send(res, 404, "text/html", messageFrame("Nothing to show here."), FRAME_CSP);
      if (!item.valid) {
        return send(res, 200, "text/html", messageFrame(`${item.id} has errors, listed below. Fix them and save.`), FRAME_CSP);
      }
      const manifest = await loadManifest(item.file, item.kind);
      const page = url.searchParams.get("page") ?? undefined;
      const nonce = randomBytes(16).toString("hex");
      const html = renderManifestDocument(manifest, { page, head: FRAME_HEAD + (css ? `<style>${css}</style>` : ""), canvasRuntime, nonce, inFrame: true });
      return send(res, 200, "text/html", html, frameCsp(nonce));
    }
    send(res, 404, "text/plain", "Not found");
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) send(res, 500, "text/html", messageFrame(`Could not render this: ${message}`), FRAME_CSP);
      else res.end();
    });
  });

  let boundPort = port;
  for (let attempt = 0; ; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(boundPort, "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      });
      break;
    } catch (error) {
      const inUse = (error as NodeJS.ErrnoException).code === "EADDRINUSE";
      if (!inUse || exactPort || attempt >= PORT_ATTEMPTS) throw error;
      boundPort += 1;
    }
  }

  // The map follows the project, and alerts follow the agents.
  const lastStates = new Map<string, AgentsState>();
  const syncOffices = async (evolve: boolean): Promise<void> => {
    for (const dir of await findOfficeKits(root)) {
      if (evolve) {
        const { changes } = await evolveKitMap(dir, root);
        for (const change of changes) console.log(`${chalk.green("Map")}  ${change}`);
      }
      const state = await readOfficeState(dir);
      for (const alert of alertsBetween(lastStates.get(dir), state)) {
        console.log(`${chalk.yellow("Alert")}  ${alert.title}: ${alert.message}\u0007`);
        if (options.notify !== false) desktopNotify(alert.title, alert.message);
      }
      lastStates.set(dir, state);
    }
  };
  await syncOffices(true).catch(() => undefined);

  let projectTimer: NodeJS.Timeout | undefined;
  let stateTimer: NodeJS.Timeout | undefined;
  let timer: NodeJS.Timeout | undefined;
  const notify = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const client of clients) client.write("event: change\ndata: {}\n\n");
    }, 80);
  };
  const watcher: FSWatcher = watch(root, { recursive: true }, (_event, name) => {
    if (name && (String(name).split(path.sep).some((part) => IGNORED.has(part)) || IGNORED_FILES.test(String(name)))) return;
    const base = name ? path.basename(String(name)) : "";
    if (base === STATE_FILE) {
      clearTimeout(stateTimer);
      stateTimer = setTimeout(() => { syncOffices(false).catch(() => undefined); }, 60);
    } else if (base !== MAP_FILE) {
      // Wait for a burst of changes, like a branch switch, to settle.
      clearTimeout(projectTimer);
      projectTimer = setTimeout(() => { syncOffices(true).catch(() => undefined); }, 1200);
    }
    notify();
  });
  watcher.on("error", (error) => console.error(chalk.yellow(`Could not watch for changes: ${error.message}`)));
  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(": keep-alive\n\n");
  }, 25_000);

  return {
    server,
    port: (server.address() as AddressInfo).port,
    close: () => {
      clearTimeout(timer);
      clearTimeout(projectTimer);
      clearTimeout(stateTimer);
      clearInterval(heartbeat);
      watcher.close();
      for (const client of clients) client.end();
      server.close();
    },
  };
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  const child = spawn(command as string, args as string[], { stdio: "ignore", detached: true });
  child.on("error", () => undefined); // no browser to open: the URL is printed anyway
  child.unref();
}

interface DevOptions {
  port?: string;
  open: boolean;
  notify: boolean;
}

// One project, one server. The record sits outside the project so it never shows up in git.
const serverRecord = (root: string): string => path.join(tmpdir(), `blkc-dev-${hashText(path.resolve(root))}.json`);

export const recordServer = (root: string, port: number): Promise<void> =>
  writeFile(serverRecord(root), JSON.stringify({ pid: process.pid, port }));

export const forgetServer = (root: string): Promise<void> => rm(serverRecord(root), { force: true });

/** The port of a server already running for this project, if it is really still there. */
export async function runningServer(root: string): Promise<number | undefined> {
  try {
    const { pid, port } = JSON.parse(await readFile(serverRecord(root), "utf8")) as { pid: number; port: number };
    process.kill(pid, 0);
    const reply = await fetch(`http://localhost:${port}/api/state`, { signal: AbortSignal.timeout(1500) });
    return reply.ok ? port : undefined;
  } catch {
    return undefined;
  }
}

export function registerDevCommand(program: Command): void {
  program
    .command("dev [path]")
    .description("Preview your Blocks, Kits and Circuits in the browser, reloading on save.")
    .option("-p, --port <port>", `Port to use (default ${DEFAULT_PORT}, or the next free one)`)
    .option("--no-open", "Don't open a browser")
    .option("--no-notify", "No desktop notifications when an agent is stuck or finishes")
    .action(async (target: string | undefined, options: DevOptions) => {
      // With no path, a repo with an office has one server at the top, from any folder in it.
      const top = projectRoot(process.cwd());
      const useTop = target === undefined && top !== process.cwd() && (await findOfficeKits(top)).length > 0;
      const root = useTop ? top : path.resolve(process.cwd(), target ?? ".");
      const port = options.port === undefined ? DEFAULT_PORT : Number(options.port);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        console.error(chalk.red(`--port must be a number from 0 to 65535, not ${options.port}.`));
        process.exitCode = 1;
        return;
      }

      let found: string[];
      try {
        found = await discover([root]);
      } catch {
        found = [];
      }
      if (found.length === 0) {
        const ec = findErrorCode("BLKC-E005");
        console.error(chalk.red(`${ec?.code}  ${ec?.cause}`));
        console.error(chalk.gray("  -> Create something to preview: blkc new kit pixel-office"));
        console.error(chalk.gray(`  ${errorCodeDocsUrl("BLKC-E005")}`));
        process.exitCode = 2;
        return;
      }

      if (options.port === undefined) {
        const running = await runningServer(root);
        if (running !== undefined) {
          const url = `http://localhost:${running}`;
          console.log(`${chalk.green("Already running")} for this project: ${url}`);
          console.log(chalk.gray("Use --port to start a second one anyway."));
          if (options.open) openBrowser((await findOfficeKits(root)).length > 0 ? `${url}/office` : url);
          return;
        }
      }

      let dev: DevServer;
      try {
        dev = await startDevServer(root, port, options.port !== undefined, { notify: options.notify });
      } catch (error) {
        const inUse = (error as NodeJS.ErrnoException).code === "EADDRINUSE";
        console.error(chalk.red(inUse ? `Port ${port} is already in use. Try another with --port.` : String(error)));
        process.exitCode = 1;
        return;
      }

      await recordServer(root, dev.port).catch(() => undefined);
      const url = `http://localhost:${dev.port}`;
      const hasOffice = (await findOfficeKits(root)).length > 0;
      console.log(`${chalk.green("BLKC dev")}  ${url}`);
      console.log(chalk.gray("Watching for changes. Press Ctrl+C to stop."));
      if (hasOffice) console.log(`${chalk.green("Office app")}  ${url}/office`);
      if (options.open) openBrowser(hasOffice ? `${url}/office` : url);
      const stop = (): void => {
        dev.close();
        void forgetServer(root).finally(() => process.exit(0));
      };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
    });
}
