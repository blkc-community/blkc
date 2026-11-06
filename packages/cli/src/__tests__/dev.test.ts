/* global fetch, Buffer */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

const CLI = path.join(fileURLToPath(new URL("../..", import.meta.url)), "dist", "blkc.cjs");

let dir: string;
let child: ChildProcess | undefined;
let base: string;

function blkc(...args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: "utf8" });
}

async function startDev(...args: string[]): Promise<void> {
  const proc = spawn(process.execPath, [CLI, "dev", "--no-open", "--no-notify", "--port", "0", ...args], { cwd: dir });
  child = proc;
  base = await new Promise<string>((resolve, reject) => {
    let out = "";
    proc.stdout?.on("data", (data) => {
      out += String(data);
      const match = /http:\/\/localhost:(\d+)/.exec(out);
      if (match) resolve(`http://localhost:${match[1]}`);
    });
    proc.stderr?.on("data", (data) => reject(new Error(String(data))));
    proc.on("exit", () => reject(new Error(`exited: ${out}`)));
  });
}

const text = async (route: string) => (await fetch(base + route)).text();
const frame = (item: string, page?: string) =>
  text(`/frame?item=${encodeURIComponent(item)}${page ? `&page=${page}` : ""}`);

function editKit(change: (kit: { content: { pages: { blocks: { props: { heading: string } }[] }[] } }) => void) {
  const file = path.join(dir, "kits/pixel-office/kit.json");
  const kit = JSON.parse(readFileSync(file, "utf8"));
  change(kit);
  writeFileSync(file, JSON.stringify(kit));
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(path.join(tmpdir(), "blkc-dev-")));
});
afterEach(() => {
  child?.kill();
  child = undefined;
  rmSync(dir, { recursive: true, force: true });
});

describe("blkc dev", () => {
  it("exits 2 with a next step when there is nothing to preview", () => {
    const r = blkc("dev", "--no-open");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("BLKC-E005");
    expect(r.stderr).toContain("blkc new kit");
  });

  it("rejects a bad port", () => {
    blkc("new", "kit", "demo");
    expect(blkc("dev", "--no-open", "--port", "nope").status).toBe(1);
  });

  it("lists everything in the project and serves the page around it", async () => {
    blkc("new", "kit", "pixel-office");
    blkc("new", "block", "my-block");
    blkc("new", "circuit", "my-circuit");
    await startDev();
    expect(await text("/")).toContain("<title>BLKC dev</title>");
    const state = JSON.parse(await text("/api/state"));
    expect(state.issues).toEqual([]);
    expect(state.items.map((item: { kind: string }) => item.kind).sort()).toEqual(["block", "circuit", "kit"]);
  });

  it("renders a Kit with its theme and a stylesheet", async () => {
    blkc("new", "kit", "pixel-office");
    await startDev();
    const html = await frame("kits/pixel-office");
    expect(html).toContain("blkc-office");
    expect(html).toContain("--blkc-color-background:#14142b");
    expect(html).toContain("Press%20Start%202P");
    expect(html).toMatch(/<style>.*\.bg-primary/s);
  });

  it("renders a Block and a Circuit, including its boards folder", async () => {
    blkc("new", "block", "my-block");
    blkc("new", "circuit", "my-circuit");
    await startDev();
    expect(await frame("blocks/my-block")).toContain("heading: string (required)");
    const circuit = await frame("circuits/my-circuit");
    expect(circuit).toContain("To do");
    expect(circuit).toContain("To do → Done");
  });

  it("folds pages/ and theme.json into a Kit", async () => {
    blkc("new", "kit", "demo");
    writeFileSync(path.join(dir, "kits/demo/pages/about.json"), JSON.stringify({
      slug: "about", title: "About", blocks: [{ block: "hero", props: { heading: "About page" } }],
    }));
    await startDev();
    const state = JSON.parse(await text("/api/state"));
    expect(state.items[0].pages.map((p: { title: string }) => p.title).sort()).toEqual(["About", "Home"]);
    const html = await frame("kits/demo", "about");
    expect(html).toContain("About page");
    expect(html).toContain("--blkc-color-background:#ffffff");
  });

  it("tells the browser when a file changes, and serves the new content", async () => {
    blkc("new", "kit", "pixel-office");
    await startDev();
    const events = await fetch(`${base}/events`);
    const reader = events.body?.getReader();
    await reader?.read(); // the connected comment

    const nextEvent = (async () => {
      let received = "";
      while (!received.includes("event: change")) {
        const chunk = await reader?.read();
        if (!chunk || chunk.done) break;
        received += Buffer.from(chunk.value).toString();
      }
      return received;
    })();
    await new Promise((resolve) => setTimeout(resolve, 200));
    editKit((kit) => { kit.content.pages[0].blocks[0].props.heading = "Saved just now"; });

    expect(await nextEvent).toContain("event: change");
    expect(await frame("kits/pixel-office")).toContain("Saved just now");
    await reader?.cancel();
  });

  it("reports check errors with their codes, then clears them once fixed", async () => {
    blkc("new", "kit", "pixel-office");
    await startDev();
    const file = path.join(dir, "kits/pixel-office/kit.json");
    const good = readFileSync(file, "utf8");

    writeFileSync(file, "{ not json");
    const broken = JSON.parse(await text("/api/state"));
    expect(broken.issues[0].code).toBe("BLKC-E004");
    expect(broken.issues[0].docs).toContain("blkc-e004");
    expect(broken.items[0].valid).toBe(false);
    expect(await frame("kits/pixel-office")).toContain("has errors");

    writeFileSync(file, good);
    const fixed = JSON.parse(await text("/api/state"));
    expect(fixed.issues).toEqual([]);
    expect(await frame("kits/pixel-office")).toContain("blkc-office");
  });

  it("only serves what the scan found, so a path can't reach other files", async () => {
    blkc("new", "kit", "demo");
    writeFileSync(path.join(dir, "secret.txt"), "top secret");
    await startDev();
    for (const item of ["../secret.txt", "secret.txt", "/etc/passwd", "kits/demo/../../secret.txt"]) {
      const response = await fetch(`${base}/frame?item=${encodeURIComponent(item)}`);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain("top secret");
    }
  });

  it("refuses a request for another host name, and anything but GET", async () => {
    blkc("new", "kit", "demo");
    await startDev();
    const { port } = new URL(base);
    const status = await new Promise<number | undefined>((resolve, reject) => {
      request({ port, path: "/api/state", headers: { Host: "evil.example" } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).on("error", reject).end();
    });
    expect(status).toBe(403);
    expect((await fetch(`${base}/`, { method: "POST" })).status).toBe(405);
  });

  it("gives previews no scripts unless a canvas needs one, and then only the runtime", async () => {
    blkc("new", "kit", "demo");
    blkc("new", "kit", "pixel-office");
    await startDev();
    const plain = await fetch(`${base}/frame?item=kits/demo`);
    expect(plain.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(await plain.text()).not.toMatch(/<script nonce/);

    const office = await fetch(`${base}/frame?item=${encodeURIComponent("kits/pixel-office")}`);
    const nonce = /nonce-([0-9a-f]+)/.exec(office.headers.get("content-security-policy") ?? "")?.[1];
    const html = await office.text();
    expect(nonce).toBeTruthy();
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html.match(/<script nonce=/g)).toHaveLength(1);
    expect(html).toContain('data-blkc-canvas="office"');

    const shell = await text("/shell.js");
    expect(shell).toContain('"allow-scripts allow-popups allow-popups-to-escape-sandbox"');
    expect(shell).not.toContain("allow-same-origin'");
  });

  it("lets office-state.json drive the office, ignoring it while it is half written", async () => {
    blkc("new", "kit", "pixel-office");
    await startDev();
    const file = path.join(dir, "kits/pixel-office/office-state.json");
    writeFileSync(file, JSON.stringify({ agents: [{ id: "zed", name: "Zed From State", state: "blocked" }], tasks: [{ title: "From state", state: "todo" }] }));
    const html = await frame("kits/pixel-office");
    expect(html).toContain("Zed From State");
    expect(html).toContain("From state");
    expect(html).not.toContain("Nova");
    writeFileSync(file, "{ half");
    expect(await frame("kits/pixel-office")).toContain("Nova");
    expect(JSON.parse(await text("/api/state")).issues).toEqual([]);
  });

  it("opens links to other sites in a new tab, so a click can't replace the preview", async () => {
    blkc("new", "kit", "pixel-office");
    await startDev();
    for (const page of [undefined, "blocks"]) {
      const html = await frame("kits/pixel-office", page);
      const away = [...html.matchAll(/<a\b[^>]*href="(?!#)[^"]*"[^>]*>/g)].map((m) => m[0]);
      for (const tag of away) expect(tag, tag).toContain('target="_blank"');
    }
    expect(await frame("kits/pixel-office")).not.toContain('target="_self"');
  });

  it("puts the office first on the Pixel Office home page", async () => {
    blkc("new", "kit", "pixel-office");
    await startDev();
    const html = await frame("kits/pixel-office");
    expect(html.indexOf("blkc-office")).toBeLessThan(html.indexOf("blkc-services"));
    expect(html.slice(0, html.indexOf("blkc-office"))).not.toContain("blkc-hero");
  });

  it("shows the Kit's Every Block page", async () => {
    blkc("new", "kit", "pixel-office");
    await startDev();
    const html = await frame("kits/pixel-office", "blocks");
    for (const block of ["blkc-hero", "blkc-text", "blkc-image", "blkc-button", "blkc-section", "blkc-services", "blkc-story", "blkc-values", "blkc-cta", "blkc-contact"]) {
      expect(html).toContain(block);
    }
  });

});
