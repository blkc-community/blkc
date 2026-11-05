/* global fetch, Buffer */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

const CLI = path.join(fileURLToPath(new URL("../..", import.meta.url)), "dist", "blkc.cjs");

const heroKit = {
  manifestVersion: 2, id: "fake-kit", name: "Fake Kit", summary: "s", description: "d", version: "3.0.0", category: "general",
  repository: "https://example.com/original", blocks: [], license: "Apache-2.0",
};
const fakeRepo: Record<string, string> = {
  "kits/fake-kit/kit.json": "﻿" + JSON.stringify(heroKit),
  "kits/fake-kit/README.md": "# Fake Kit\n\nThe original.\n",
  "kits/fake-kit/NOTICE": "Keep this notice.\n",
  "kits/fake-kit/assets/logo.bin": "binary",
  "kits/old-kit/manifest.json": JSON.stringify({ id: "old-kit", name: "Old", summary: "s", description: "d", version: "1.0.0", category: "general", blocks: [] }),
};

// Stands in for GitHub, so these tests need no network.
let github: Server;
let githubUrl: string;
let githubStatus = 200;
beforeAll(async () => {
  github = createServer((req, res) => {
    const url = req.url ?? "";
    if (githubStatus !== 200) {
      res.writeHead(githubStatus);
      res.end();
      return;
    }
    const tree = /^\/repos\/blkc-community\/(\w+)\/git\/trees\//.exec(url);
    if (tree) {
      const prefix = `${tree[1]}/`;
      const blobs = Object.keys(fakeRepo).filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length));
      const folders = [...new Set(blobs.map((p) => p.split("/")[0]))];
      res.end(JSON.stringify({ tree: [...folders.map((p) => ({ path: p, type: "tree" })), ...blobs.map((p) => ({ path: p, type: "blob" }))] }));
      return;
    }
    const raw = /^\/blkc-community\/(\w+)\/main\/(.+)$/.exec(url);
    const content = raw ? fakeRepo[`${raw[1]}/${decodeURIComponent(raw[2])}`] : undefined;
    res.writeHead(content === undefined ? 404 : 200);
    res.end(content);
  });
  await new Promise<void>((resolve) => github.listen(0, "127.0.0.1", resolve));
  githubUrl = `http://127.0.0.1:${(github.address() as AddressInfo).port}`;
});
afterAll(() => {
  github.close();
});

let dir: string;
let child: ChildProcess | undefined;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(path.join(tmpdir(), "blkc-fork-")));
  githubStatus = 200;
});
afterEach(() => {
  child?.kill();
  child = undefined;
  rmSync(dir, { recursive: true, force: true });
});

function blkc(...args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [CLI, ...args], {
      cwd: dir,
      env: { ...process.env, BLKC_GITHUB_API: githubUrl, BLKC_GITHUB_RAW: githubUrl },
    });
    let out = "";
    proc.stdout.on("data", (data) => (out += String(data)));
    proc.stderr.on("data", (data) => (out += String(data)));
    proc.on("close", (code) => resolve({ code, out }));
  });
}

const read = (file: string) => readFileSync(path.join(dir, file), "utf8");
const json = (file: string) => JSON.parse(read(file));

describe("blkc new --from a community name", () => {
  it("copies every file under the new id, keeping the licence and notice", async () => {
    const r = await blkc("new", "kit", "my-kit", "--from", "fake-kit");
    expect(r.code, r.out).toBe(0);
    const kit = json("kits/my-kit/kit.json");
    expect(kit.id).toBe("my-kit");
    expect(kit.name).toBe("My Kit");
    expect(kit.version).toBe("0.1.0");
    expect(kit.license).toBe("Apache-2.0");
    expect(kit.repository).toBeUndefined();
    expect(read("kits/my-kit/NOTICE")).toContain("Keep this notice");
    expect(read("kits/my-kit/assets/logo.bin")).toBe("binary");
    expect(read("kits/my-kit/README.md")).toContain("Forked from https://github.com/blkc-community/kits/tree/main/fake-kit");
    expect(read("kits/my-kit/README.md")).toContain("The original.");
    expect((await blkc("check")).code).toBe(0);
  });

  it("upgrades an old manifest to the current file name and version", async () => {
    expect((await blkc("new", "kit", "my-kit", "--from", "old-kit")).code).toBe(0);
    expect(existsSync(path.join(dir, "kits/my-kit/manifest.json"))).toBe(false);
    expect(json("kits/my-kit/kit.json").manifestVersion).toBe(2);
    const check = await blkc("check");
    expect(check.code, check.out).toBe(0);
  });

  it("lists what exists when the name is wrong, and writes nothing", async () => {
    const r = await blkc("new", "kit", "my-kit", "--from", "nope");
    expect(r.code).toBe(1);
    expect(r.out).toContain("Available: fake-kit, old-kit");
    expect(existsSync(path.join(dir, "kits"))).toBe(false);
  });

  it("explains a GitHub rate limit", async () => {
    githubStatus = 403;
    const r = await blkc("new", "kit", "my-kit", "--from", "fake-kit");
    expect(r.code).toBe(1);
    expect(r.out).toContain("limiting requests");
  });

  it("forks Pixel Office offline from the built-in copy", async () => {
    githubStatus = 500;
    expect((await blkc("new", "kit", "my-office", "--from", "pixel-office")).code).toBe(0);
    expect(json("kits/my-office/kit.json").id).toBe("my-office");
    expect(json("kits/my-office/kit.json").theme).toBeDefined();
    expect(read("kits/my-office/kit.test.mjs")).toContain("my-office");
    expect((await blkc("check")).code).toBe(0);
  });

  it("rejects a source that could be a path trick", async () => {
    const r = await blkc("new", "kit", "my-kit", "--from", "a/../../b");
    expect(r.code).toBe(1);
    expect(r.out).toContain("not a community name");
  });
});

describe("blkc new --from a local folder", () => {
  it("forks a Kit, a Circuit and a Block", async () => {
    await blkc("new", "kit", "base-kit");
    await blkc("new", "circuit", "base-circuit");
    await blkc("new", "block", "base-block");
    for (const [kind, folder, source] of [["kit", "kits", "base-kit"], ["circuit", "circuits", "base-circuit"], ["block", "blocks", "base-block"]] as const) {
      const r = await blkc("new", kind, `my-${kind}`, "--from", `./${folder}/${source}`);
      expect(r.code, r.out).toBe(0);
      expect(json(`${folder}/my-${kind}/${kind}.json`).id).toBe(`my-${kind}`);
    }
    const companions = ["kits/my-kit/theme.json", "kits/my-kit/pages/home.json", "circuits/my-circuit/boards/main.json"];
    for (const file of companions) expect(existsSync(path.join(dir, file)), file).toBe(true);
    const check = await blkc("check");
    expect(check.code, check.out).toBe(0);
    const test = await new Promise<number | null>((resolve) => {
      spawn(process.execPath, ["--test"], { cwd: dir }).on("close", resolve);
    });
    expect(test).toBe(0);
  });

  it("won't fork one kind as another, or over something that exists", async () => {
    await blkc("new", "kit", "base-kit");
    expect((await blkc("new", "block", "my-block", "--from", "./kits/base-kit")).code).toBe(1);
    expect(existsSync(path.join(dir, "blocks"))).toBe(false);
    expect((await blkc("new", "kit", "base-kit", "--from", "./kits/base-kit")).code).toBe(1);
  });

  it("does not follow symlinks out of the source", async () => {
    await blkc("new", "kit", "base-kit");
    writeFileSync(path.join(dir, "secret.txt"), "top secret");
    symlinkSync(path.join(dir, "secret.txt"), path.join(dir, "kits/base-kit/link.txt"));
    expect((await blkc("new", "kit", "my-kit", "--from", "./kits/base-kit")).code).toBe(0);
    expect(existsSync(path.join(dir, "kits/my-kit/link.txt"))).toBe(false);
  });

  it("skips node_modules", async () => {
    await blkc("new", "kit", "base-kit");
    mkdirSync(path.join(dir, "kits/base-kit/node_modules/x"), { recursive: true });
    writeFileSync(path.join(dir, "kits/base-kit/node_modules/x/index.js"), "");
    expect((await blkc("new", "kit", "my-kit", "--from", "./kits/base-kit")).code).toBe(0);
    expect(existsSync(path.join(dir, "kits/my-kit/node_modules"))).toBe(false);
  });
});

describe("blkc dev with your own component", () => {
  async function dev(): Promise<string> {
    const proc = spawn(process.execPath, [CLI, "dev", "--no-open", "--port", "0"], { cwd: dir });
    child = proc;
    return new Promise((resolve, reject) => {
      proc.stdout.on("data", (data: Buffer) => {
        const match = /http:\/\/localhost:(\d+)/.exec(String(data));
        if (match) resolve(`http://localhost:${match[1]}`);
      });
      proc.on("exit", (code) => reject(new Error(`exited ${code}`)));
    });
  }
  const frame = async (base: string, item: string) =>
    (await fetch(`${base}/frame?item=${encodeURIComponent(item)}`)).text();
  const COMPONENT = (cls: string, text = "From my component") =>
    `import type { BlockProps } from "@blkc-code/render-web";\nexport default function Mine({ props }: BlockProps<{ heading: string }>) {\n  return <h2 className="${cls}">{props.heading} {"${text}"}</h2>;\n}\n`;

  beforeEach(async () => {
    await blkc("new", "block", "my-block");
  });

  it("draws it, and writes CSS for a class the renderer has never used", async () => {
    writeFileSync(path.join(dir, "blocks/my-block/render.web.tsx"), COMPONENT("bg-fuchsia-500"));
    const base = await dev();
    const html = await frame(base, "blocks/my-block");
    expect(html).toContain("From my component");
    expect(html).toMatch(/\.bg-fuchsia-500\s*\{/);
  });

  it("picks up an edit straight away, and a relative import", async () => {
    writeFileSync(path.join(dir, "blocks/my-block/helper.ts"), `export const WORDS: string = "Helped";\n`);
    writeFileSync(path.join(dir, "blocks/my-block/render.web.tsx"), `import { WORDS } from "./helper";\nexport default () => <p>{WORDS}</p>;\n`);
    const base = await dev();
    expect(await frame(base, "blocks/my-block")).toContain("Helped");
    writeFileSync(path.join(dir, "blocks/my-block/helper.ts"), `export const WORDS: string = "Changed";\n`);
    expect(await frame(base, "blocks/my-block")).toContain("Changed");
  });

  it("shows a syntax error in the page and recovers when it is fixed", async () => {
    const file = path.join(dir, "blocks/my-block/render.web.tsx");
    writeFileSync(file, "export default () => <p>{oops</p>;\n");
    const base = await dev();
    const broken = JSON.parse(await (await fetch(`${base}/api/state`)).text());
    expect(broken.issues[0].file).toContain("render.web.tsx");
    expect(broken.issues[0].code).toBe("BLKC-E100");
    writeFileSync(file, COMPONENT("p-4"));
    const fixed = JSON.parse(await (await fetch(`${base}/api/state`)).text());
    expect(fixed.issues).toEqual([]);
    expect(await frame(base, "blocks/my-block")).toContain("From my component");
  });

  it("asks for a default export", async () => {
    writeFileSync(path.join(dir, "blocks/my-block/render.web.tsx"), "export const nope = 1;\n");
    const base = await dev();
    const state = JSON.parse(await (await fetch(`${base}/api/state`)).text());
    expect(state.issues[0].message).toContain("default export");
  });

  it("shows a crash while drawing in the frame, not as a dead server", async () => {
    writeFileSync(path.join(dir, "blocks/my-block/render.web.tsx"), `export default () => { throw new Error("Boom"); };\n`);
    const base = await dev();
    expect(await frame(base, "blocks/my-block")).toContain("Boom");
    expect((await fetch(`${base}/`)).status).toBe(200);
  });

  it("lets a Kit page use it, and a fork of hero replaces hero until it is removed", async () => {
    writeFileSync(path.join(dir, "blocks/my-block/render.web.tsx"), COMPONENT("p-4", "On a page"));
    mkdirSync(path.join(dir, "blocks/hero"));
    writeFileSync(path.join(dir, "blocks/hero/block.json"), read("blocks/my-block/block.json").replaceAll("my-block", "hero"));
    writeFileSync(path.join(dir, "blocks/hero/render.web.tsx"), COMPONENT("p-4", "My own hero"));
    await blkc("new", "kit", "my-kit");
    const page = json("kits/my-kit/pages/home.json");
    page.blocks = [{ block: "my-block", props: { heading: "Hi" } }, { block: "hero", props: { heading: "Top" } }];
    writeFileSync(path.join(dir, "kits/my-kit/pages/home.json"), JSON.stringify(page));
    const kit = json("kits/my-kit/kit.json");
    kit.blocks = [{ blockId: "my-block", version: "*" }, { blockId: "hero", version: "*" }];
    writeFileSync(path.join(dir, "kits/my-kit/kit.json"), JSON.stringify(kit));

    const base = await dev();
    const html = await frame(base, "kits/my-kit");
    expect(html).toContain("On a page");
    expect(html).toContain("My own hero");

    rmSync(path.join(dir, "blocks/hero"), { recursive: true });
    const after = await frame(base, "kits/my-kit");
    expect(after).not.toContain("My own hero");
    expect(after).toContain("blkc-hero");
  });
});
