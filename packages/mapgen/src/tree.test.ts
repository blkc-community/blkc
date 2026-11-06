import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanTree, type TreeNode } from "./index.js";

let root: string;
beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), "blkc-tree-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const write = (file: string, content = "x"): void => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), content);
};
const find = (node: TreeNode, id: string): TreeNode | undefined =>
  node.id === id ? node : node.children.map((child) => find(child, id)).find(Boolean);
const names = (node: TreeNode | undefined, kind: string): string[] =>
  (node?.children ?? []).filter((child) => child.kind === kind).map((child) => child.name);
const git = (dir: string, ...args: string[]): void => { execFileSync("git", args, { cwd: path.join(root, dir) }); };

describe("roads and buildings", () => {
  it("makes a road of a folder with no application, at any depth", () => {
    write("package.json", "{}");
    write("apps/web/package.json", "{}");
    write("apps/tools/cli/go.mod");
    write("apps/tools/deep/er/api/pyproject.toml");
    const { root: top } = scanTree(root);
    expect(top.kind).toBe("road");
    expect(names(top, "road")).toEqual(["apps/"]);
    const apps = find(top, "road:apps");
    expect(names(apps, "building")).toEqual(["web"]);
    expect(names(find(top, "road:apps/tools"), "building")).toEqual(["cli"]);
    expect(find(top, "building:apps/tools/deep/er/api")?.kind).toBe("building");
  });

  it("drops a road with nothing on it", () => {
    write("apps/web/package.json", "{}");
    write("apps/web2/package.json", "{}");
    mkdirSync(path.join(root, "empty/also-empty"), { recursive: true });
    expect(find(scanTree(root).root, "road:empty")).toBeUndefined();
  });

  it("recognises a made-up application type from config", () => {
    write("studio/alpha/a.xydsf");
    write("studio/beta/b.xydsf");
    expect(find(scanTree(root).root, "building:studio/alpha")).toBeUndefined();
    const { root: top } = scanTree(root, { markers: ["*.xydsf"] });
    expect(names(find(top, "road:studio"), "building")).toEqual(["alpha", "beta"]);
  });

  it("counts BLKC's own manifests as applications", () => {
    write("blocks/hero/block.json", "{}");
    write("kits/shop/kit.json", "{}");
    write("circuits/flow/circuit.json", "{}");
    const { root: top } = scanTree(root);
    expect(find(top, "building:blocks/hero")).toBeDefined();
    expect(find(top, "building:kits/shop")).toBeDefined();
    expect(find(top, "building:circuits/flow")).toBeDefined();
  });

  it("makes one building of a project that is one application", () => {
    write("package.json", "{}");
    write("src/api/a.ts");
    write("README.md");
    const { root: top } = scanTree(root);
    expect(top.kind).toBe("building");
    expect(find(top, "part:src/api")?.item).toBe("Server rack");
  });

  it("treats a project with no marker at all as one application", () => {
    write("src/api/a.ts");
    write("notes.txt");
    const { root: top } = scanTree(root);
    expect(top.kind).toBe("building");
    expect(find(top, "part:src/api")).toBeDefined();
  });

  it("lets include and ignore change what's a building", () => {
    write("apps/web/package.json", "{}");
    write("apps/old/package.json", "{}");
    write("docs/guide.md");
    const { root: top } = scanTree(root, { include: ["docs"], ignore: ["apps/old"] });
    expect(find(top, "building:docs")).toBeDefined();
    expect(find(top, "building:apps/old")).toBeUndefined();
  });
});

describe("loose files", () => {
  it("sit on their own road, grouped by type, at every level", () => {
    write("README.md");
    write("vercel.json", "{}");
    write("apps/notes.md");
    write("apps/web/package.json", "{}");
    write("docs/a.md");
    write("docs/b.md");
    write("docs/pic.png");
    const { root: top } = scanTree(root);
    expect(names(top, "group")).toEqual(["Config", "Docs"]);
    expect(find(top, "group::Docs")?.children.map((file) => file.name)).toEqual(["README.md"]);
    expect(names(find(top, "road:apps"), "group")).toEqual(["Docs"]);
    expect(find(top, "group:docs:Docs")?.children.map((file) => file.path)).toEqual(["docs/a.md", "docs/b.md"]);
    expect(names(find(top, "road:docs"), "group")).toEqual(["Docs", "Images"]);
    expect(find(top, "building:docs")).toBeUndefined();
  });

  it("uses your own groups, and Other for anything unknown", () => {
    write("a.xydsf");
    write("b.unknownthing");
    write("apps/web/package.json", "{}");
    const { root: top } = scanTree(root, { fileGroups: { Studio: ["*.xydsf"] } });
    expect(names(top, "group")).toEqual(["Other", "Studio"]);
  });

  it("keeps secrets out of the groups, for the vault, without opening them", () => {
    write(".env.local", "SECRET=do-not-read");
    write("apps/web/package.json", "{}");
    write("apps/web/.env", "SECRET=do-not-read");
    write("apps/web/server.pem");
    write("apps/.env.json", "{}");
    const tree = scanTree(root);
    expect(tree.secrets.map((file) => file.path).sort()).toEqual([".env.local", "apps/.env.json", "apps/web/.env", "apps/web/server.pem"]);
    expect(JSON.stringify(tree)).not.toContain("do-not-read");
    expect(JSON.stringify(tree.root)).not.toContain(".env");
  });
});

describe("secret templates", () => {
  it("aren't secrets, since they're meant to be committed", () => {
    write(".env.example");
    write(".env.production.sample");
    write(".env.local");
    write(".env.local.bak");
    write("apps/web/package.json", "{}");
    const tree = scanTree(root);
    expect(tree.secrets.map((file) => file.name)).toEqual([".env.local", ".env.local.bak"]);
    expect(find(tree.root, "group::Config")?.children.map((file) => file.name)).toEqual([".env.example", ".env.production.sample"]);
  });
});

describe("parts of a building", () => {
  it("traces each item to a real folder", () => {
    write("apps/kanban/package.json", "{}");
    write("apps/kanban/src/app/board/a.tsx");
    write("apps/kanban/src/app/api/b.ts");
    write("apps/kanban/src/lib/c.ts");
    write("apps/kanban/supabase/d.sql");
    write("apps/kanban/test/e.ts");
    write("apps/kanban/docs/f.md");
    write("apps/kanban/scripts/g.sh");
    write("apps/kanban/public/h.png");
    write("apps/kanban/weird/i.txt");
    write("apps/other/package.json", "{}");
    const { root: top } = scanTree(root);
    const item = (id: string): string | undefined => find(top, `part:apps/kanban/${id}`)?.item;
    expect(item("src/app/board")).toBe("Desk");
    expect(item("src/app/api")).toBe("Server rack");
    expect(item("src/lib")).toBe("Workbench");
    expect(item("supabase")).toBe("Server rack");
    expect(item("test")).toBe("Whiteboard");
    expect(item("docs")).toBe("Bookshelf");
    expect(item("scripts")).toBe("Toolbox");
    expect(item("public")).toBe("Plants");
    expect(item("weird")).toBe("Filing cabinet");
  });

  it("can be told what a folder is", () => {
    write("apps/a/package.json", "{}");
    write("apps/a/billing/queue/x.ts");
    write("apps/a/weird/y.ts");
    write("apps/b/package.json", "{}");
    const { root: top } = scanTree(root, { partTypes: { Vending: ["weird"] } });
    expect(find(top, "part:apps/a/weird")?.item).toBe("Vending");
  });
});

describe("counts and repos", () => {
  it("counts what git tracks, not build output", () => {
    write("apps/web/package.json", "{}");
    write("apps/web/src/a.ts");
    write("apps/api/package.json", "{}");
    for (let i = 0; i < 20; i++) write(`apps/web/.next-build/f${i}.js`);
    git("", "init", "-q");
    git("", "add", "apps/web/package.json", "apps/web/src/a.ts", "apps/api/package.json");
    expect(find(scanTree(root).root, "building:apps/web")?.files).toBe(2);
  });

  it("skips gitignored folders and other repos, unless a road opens them", () => {
    write(".gitignore", "external/\n");
    write("apps/web/package.json", "{}");
    write("apps/api/package.json", "{}");
    write("vendored/thing/package.json", "{}");
    write("external/shop/package.json", "{}");
    write("external/shop/src/a.ts");
    write("external/group/blkc/package.json", "{}");
    git("", "init", "-q");
    git("vendored/thing", "init", "-q");
    git("external/shop", "init", "-q");
    git("external/shop", "add", "package.json");
    const plain = scanTree(root).root;
    expect(find(plain, "road:external")).toBeUndefined();
    expect(find(plain, "building:vendored/thing")).toBeUndefined();

    const { root: top } = scanTree(root, { roads: ["external/"] });
    expect(find(top, "road:external")?.name).toBe("external/");
    expect(find(top, "building:external/shop")?.files).toBe(1);
    expect(find(top, "road:external/group")).toBeDefined();
    expect(find(top, "building:external/group/blkc")).toBeDefined();
    expect(find(top, "building:vendored/thing")).toBeUndefined();
  });

  it("never opens junk, even on an added road", () => {
    write("external/shop/package.json", "{}");
    write("external/shop/node_modules/dep/package.json", "{}");
    write("apps/web/package.json", "{}");
    const text = JSON.stringify(scanTree(root, { roads: ["external"] }).root);
    expect(text).not.toContain("node_modules");
  });
});

describe("links", () => {
  it("come from package files, between buildings anywhere in the tree", () => {
    write("packages/ui/package.json", JSON.stringify({ name: "@a/ui" }));
    write("apps/deep/web/package.json", JSON.stringify({ name: "web", dependencies: { "@a/ui": "*" } }));
    expect(scanTree(root).links).toEqual([{ from: "building:apps/deep/web", to: "building:packages/ui" }]);
  });
});

describe("a stable tree", () => {
  it("gives the same ids every time", () => {
    write("apps/web/package.json", "{}");
    write("apps/api/package.json", "{}");
    write("README.md");
    expect(scanTree(root)).toEqual(scanTree(root));
  });
});
