import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discover, validateOne } from "../commands/check.js";
import { forgetServer, recordServer, runningServer, startDevServer } from "../commands/dev.js";
import { areaForFile, evolveKitMap, findOfficeKits, projectRoot, readWorldConfig, resolveKit, writeMap } from "../office/state.js";

let root: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), "blkc-mono-")));
  mkdirSync(path.join(root, ".git"));
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const write = (file: string, content = "x"): void => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), content);
};
const office = (dir: string): void =>
  write(`${dir}/kit.json`, JSON.stringify({ id: "o", content: { pages: [{ blocks: [{ block: "office", props: {} }] }] } }));

describe("working anywhere in a repo", () => {
  it("finds the top of the repo, or falls back", () => {
    mkdirSync(path.join(root, "apps/web"), { recursive: true });
    expect(projectRoot(path.join(root, "apps/web"))).toBe(root);
    const loose = realpathSync(mkdtempSync(path.join(tmpdir(), "blkc-loose-")));
    expect(projectRoot(loose)).toBe(loose);
    rmSync(loose, { recursive: true });
  });

  it("finds the Kit from a subfolder, named or not", async () => {
    office("kits/office");
    mkdirSync(path.join(root, "apps/web"), { recursive: true });
    const here = path.join(root, "apps/web");
    expect(await resolveKit(undefined, here)).toBe(path.join(root, "kits/office"));
    expect(await resolveKit("kits/office", here)).toBe(path.join(root, "kits/office"));
    await expect(resolveKit("kits/nope", here)).rejects.toThrow("is not a Kit");
  });

  it("puts a file in its room, whichever way the path is written", async () => {
    office("kits/office");
    write("apps/web/a.ts");
    await writeMap(path.join(root, "kits/office"), { rooms: [{ id: "apps-web", paths: ["apps/web/"] }] } as never);
    const kit = path.join(root, "kits/office");
    expect(await areaForFile(kit, root, path.join(root, "apps/web/a.ts"))).toBe("apps-web");
    expect(await areaForFile(kit, root, "apps/web/a.ts")).toBe("apps-web");
    expect(await areaForFile(kit, root, "/somewhere/else/a.ts")).toBeUndefined();
  });
});

describe("what belongs to this project", () => {
  it("leaves gitignored folders and other repos out of discovery", async () => {
    write(".gitignore", "external/\n");
    office("kits/mine");
    office("external/theirs");
    office("vendored/theirs");
    write("vendored/.git/HEAD");
    expect(await findOfficeKits(root)).toEqual([path.join(root, "kits/mine")]);
    expect((await discover([root])).every((file) => file.includes("kits/mine"))).toBe(true);
  });
});

describe("one server per project", () => {
  it("finds a live server, and ignores a stale record", async () => {
    office("kits/office");
    expect(await runningServer(root)).toBeUndefined();
    const dev = await startDevServer(root, 0, true, { notify: false });
    await recordServer(root, dev.port);
    expect(await runningServer(root)).toBe(dev.port);
    dev.close();
    expect(await runningServer(root)).toBeUndefined();
    await forgetServer(root);
    expect(await runningServer(root)).toBeUndefined();
  });
});

describe("world.json", () => {
  it("changes what becomes a building, and is checked like any manifest", async () => {
    office("kits/office");
    write("studio/alpha/a.xydsf");
    write("studio/beta/b.xydsf");
    write("kits/office/world.json", JSON.stringify({ applications: { markers: ["*.xydsf"] } }));
    const { map } = await evolveKitMap(path.join(root, "kits/office"), root);
    expect(map.rooms.map((r) => r.id)).toEqual(expect.arrayContaining(["studio-alpha", "studio-beta"]));
    expect((await validateOne(path.join(root, "kits/office/world.json"))).ok).toBe(true);
  });

  it("reports a mistake, and the map carries on without it", async () => {
    office("kits/office");
    write("kits/office/world.json", JSON.stringify({ aplications: {} }));
    expect((await validateOne(path.join(root, "kits/office/world.json"))).ok).toBe(false);
    expect(readWorldConfig(path.join(root, "kits/office"))).toEqual({});
    write("kits/office/world.json", JSON.stringify({ include: ["../secrets"] }));
    expect((await validateOne(path.join(root, "kits/office/world.json"))).ok).toBe(false);
  });
});
