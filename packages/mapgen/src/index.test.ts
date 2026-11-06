import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWorld, findPath } from "@blkc-code/render-canvas";
import { OFFICE_PLAN, evolveMap, registerWorldPlan, roomForPath, scanProject, type OfficeMap, type ProjectScan, type WorldPlan } from "./index.js";

const area = (rel: string, files: number) => ({ id: rel.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: rel.split("/").pop() as string, path: `${rel}/`, files });
const scanOf = (...areas: [string, number][]): ProjectScan => ({ rootFiles: 3, areas: areas.map(([r, f]) => area(r, f)) });
const webapp = scanOf(["src/api", 120], ["src/ui", 80], ["docs", 15], ["tests", 40], ["public", 25], ["scripts", 6]);

/** Everyone can get everywhere. This is the promise the game depends on. */
function assertPlayable(map: OfficeMap): void {
  const world = createWorld(map as never);
  expect(world.cols).toBe(map.cols);
  expect(map.cols).toBeLessThanOrEqual(64);
  expect(map.rows).toBeLessThanOrEqual(40);
  const center = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x, y: r.y });
  const open = (room: OfficeMap["rooms"][number]) => {
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) if (world.walkable[y * world.cols + x]) return { x, y };
    return center(room);
  };
  const lobby = map.rooms.find((r) => r.role === "lobby") as OfficeMap["rooms"][number];
  const start = open(lobby);
  for (const room of map.rooms) {
    expect(findPath(world as never, start, open(room)), `${room.id} is cut off`).not.toBeNull();
    for (const other of map.rooms) {
      if (other === room) continue;
      const apart = room.x + room.w < other.x || other.x + other.w < room.x || room.y + room.h < other.y || other.y + other.h < room.y;
      expect(apart, `${room.id} overlaps ${other.id}`).toBe(true);
    }
  }
  for (const seat of world.seats) expect(findPath(world as never, start, seat), `desk ${seat.x},${seat.y} is cut off`).not.toBeNull();
  for (const spot of [...world.spots.lounge, ...world.spots.board]) expect(findPath(world as never, start, spot)).not.toBeNull();
  expect(world.spots.lounge.length).toBeGreaterThan(0);
  expect(world.spots.board.length).toBeGreaterThan(0);
}

describe("every project gets its own map", () => {
  it("differs between projects, even with the same folders", () => {
    const a = evolveMap(undefined, webapp, "shop").map;
    const b = evolveMap(undefined, webapp, "blog").map;
    expect(JSON.stringify(a.rooms)).not.toBe(JSON.stringify(b.rooms));
  });

  it("is the same every time for the same project", () => {
    const at = "2026-01-01T00:00:00.000Z";
    expect(evolveMap(undefined, webapp, "shop", at).map).toEqual(evolveMap(undefined, webapp, "shop", at).map);
  });

  it("has a room for every folder, themed by what the folder is", () => {
    const { map } = evolveMap(undefined, webapp, "shop");
    const room = (id: string) => map.rooms.find((r) => r.id === id) as OfficeMap["rooms"][number];
    expect(room("docs").floor).toBe("carpet");
    expect(room("public").floor).toBe("grass");
    expect(room("src-api").floor).toBe("concrete");
    expect(map.furniture.some((item) => item.room === "src-api" && item.type === "server")).toBe(true);
    expect(map.furniture.some((item) => item.room === "docs" && item.type === "shelf")).toBe(true);
    expect(map.furniture.filter((item) => item.room === "src-api" && item.type === "desk").length).toBeGreaterThan(1);
  });

  it("is always playable, for many projects of every shape", () => {
    const words = ["api", "web", "docs", "db", "tests", "scripts", "assets", "billing", "auth", "mobile", "infra", "ml", "search", "admin"];
    for (let i = 0; i < 40; i++) {
      const areas: [string, number][] = [];
      for (let j = 0; j <= i % words.length; j++) areas.push([`${i % 2 ? "packages/" : ""}${words[(i + j * 3) % words.length]}`, 1 + ((i * 37 + j * 11) % 400)]);
      const unique = [...new Map(areas.map((a) => [a[0], a])).values()];
      assertPlayable(evolveMap(undefined, scanOf(...unique), `project-${i}`).map);
    }
  });

  it("gives the biggest folders rooms first if space runs out", () => {
    const many = Array.from({ length: 14 }, (_, i) => [`service-${i}`, i === 13 ? 5000 : 5 + i] as [string, number]);
    const { map } = evolveMap(undefined, scanOf(...many), "crowded");
    expect(map.rooms.some((r) => r.id === "service-13")).toBe(true);
    const sized = evolveMap(undefined, scanOf(["src/api", 60], ["src/web", 90], ["src/auth", 20], ["docs", 12], ["tests", 35], ["public", 18], ["scripts", 5], ["db", 25], ["infra", 8], ["src/lib", 1], ["kits", 3]), "acme-shop").map;
    expect(sized.rooms.filter((r) => !r.role).length).toBe(11);
    assertPlayable(sized);
  });

  it("copes with an empty project, and a huge one", () => {
    assertPlayable(evolveMap(undefined, { areas: [], rootFiles: 0 }, "empty").map);
    const huge = Array.from({ length: 14 }, (_, i) => [`service-${i}`, 60000] as [string, number]);
    assertPlayable(evolveMap(undefined, scanOf(...huge), "huge").map);
  });
});

describe("the map changes as the project does", () => {
  const relative = (map: OfficeMap, ids: string[]) => {
    const origin = map.rooms.find((r) => r.id === "lobby") as OfficeMap["rooms"][number];
    return ids.map((id) => {
      const room = map.rooms.find((r) => r.id === id) as OfficeMap["rooms"][number];
      return [id, room.x - origin.x, room.y - origin.y];
    });
  };

  it("adds a room for a new folder and leaves the others where they are", () => {
    const first = evolveMap(undefined, webapp, "shop").map;
    const ids = first.rooms.map((r) => r.id);
    const next = evolveMap(first, { ...webapp, areas: [...webapp.areas, area("src/billing", 12)] }, "shop");
    expect(next.changes).toContain("New room: billing");
    expect(next.map.rooms.some((r) => r.id === "src-billing")).toBe(true);
    expect(relative(next.map, ids)).toEqual(relative(first, ids));
    assertPlayable(next.map);
  });

  it("reports nothing and changes nothing when the project hasn't changed", () => {
    const first = evolveMap(undefined, webapp, "shop").map;
    const next = evolveMap(first, webapp, "shop");
    expect(next.changes).toEqual([]);
    expect(next.map).toEqual(first);
  });

  it("grows a room and adds desks as its folder grows, staying playable", () => {
    const small = scanOf(["src/api", 2], ["docs", 2]);
    const first = evolveMap(undefined, small, "grow").map;
    const before = first.rooms.find((r) => r.id === "src-api") as OfficeMap["rooms"][number];
    const desks = (map: OfficeMap) => map.furniture.filter((i) => i.room === "src-api" && i.type === "desk").length;
    const next = evolveMap(first, scanOf(["src/api", 900], ["docs", 2]), "grow").map;
    const after = next.rooms.find((r) => r.id === "src-api") as OfficeMap["rooms"][number];
    expect(after.w * after.h).toBeGreaterThanOrEqual(before.w * before.h);
    expect(desks(next)).toBeGreaterThanOrEqual(desks(first));
    assertPlayable(next);
  });

  it("closes a room when its folder goes, or keeps it as a corridor if others need it", () => {
    let map = evolveMap(undefined, webapp, "shop").map;
    const next = evolveMap(map, scanOf(["src/api", 120], ["src/ui", 80], ["docs", 15], ["tests", 40], ["public", 25]), "shop");
    expect(next.changes.join()).toMatch(/scripts/i);
    assertPlayable(next.map);
    // Take away every folder in turn: everyone must still be able to get everywhere.
    map = next.map;
    for (const gone of ["public", "tests", "docs", "src-ui", "src-api"]) {
      const keep = webapp.areas.filter((a) => map.rooms.some((r) => r.id === a.id) && a.id !== gone && a.id !== "scripts");
      map = evolveMap(map, { rootFiles: 1, areas: keep }, "shop").map;
      assertPlayable(map);
    }
  });

  it("never touches a room edited by hand, even if its folder goes", () => {
    const first = evolveMap(undefined, webapp, "shop").map;
    const docs = first.rooms.find((r) => r.id === "docs") as OfficeMap["rooms"][number];
    docs.locked = true;
    docs.name = "My Library";
    first.furniture.push({ type: "trophy", x: docs.x, y: docs.y, room: "docs" });
    const next = evolveMap(first, scanOf(["src/api", 120]), "shop").map;
    const after = next.rooms.find((r) => r.id === "docs") as OfficeMap["rooms"][number];
    expect(after.name).toBe("My Library");
    expect(next.furniture.some((i) => i.type === "trophy")).toBe(true);
    assertPlayable(next);
  });

  it("stays playable through a long, messy history", () => {
    let map: OfficeMap | undefined;
    const pool = ["api", "web", "docs", "db", "tests", "scripts", "assets", "billing", "auth", "mobile", "infra", "ml", "search", "admin", "cli", "sdk"];
    for (let turn = 0; turn < 30; turn++) {
      const areas = pool.filter((_, i) => (turn * 7 + i * i) % 5 !== 0).slice(0, 14).map((name, i) => [name, 1 + (turn * 31 + i * 17) % 500] as [string, number]);
      map = evolveMap(map, scanOf(...areas), "messy").map;
      assertPlayable(map);
    }
  });
});

describe("scanning a project", () => {
  it("reads folders and counts, skips junk, and opens container folders", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "blkc-scan-"));
    try {
      const put = (file: string) => { mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); writeFileSync(path.join(dir, file), "x"); };
      for (const file of ["README.md", "src/api/a.ts", "src/api/b.ts", "src/web/c.ts", "docs/d.md", "node_modules/x/i.js", "dist/o.js", ".git/h", "generated/g.js", ".github/w.yml", "empty.txt"]) put(file);
      mkdirSync(path.join(dir, "nothing-here"));
      writeFileSync(path.join(dir, ".gitignore"), "generated/\n*.log\n");
      const scan = scanProject(dir);
      expect(scan.areas.map((a) => a.path).sort()).toEqual([".github/", "docs/", "src/api/", "src/web/"]);
      expect(scan.areas.find((a) => a.id === "src-api")?.files).toBe(2);
      expect(scan.rootFiles).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("roomForPath", () => {
  const rooms = [{ id: "src", paths: ["src/"] }, { id: "api", paths: ["src/api/"] }, { id: "lobby", paths: [""] }];
  it("picks the longest match, and nothing for files with no room", () => {
    expect(roomForPath(rooms, "src/api/a.ts")).toBe("api");
    expect(roomForPath(rooms, "src/x.ts")).toBe("src");
    expect(roomForPath(rooms, "src\\api\\win.ts")).toBe("api");
    expect(roomForPath(rooms, "other/x.ts")).toBeUndefined();
  });
});

describe("a monorepo", () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), "blkc-mono-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const write = (file: string, content = "x"): void => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  };
  const pkg = (dir: string, name: string, deps: string[] = []): void =>
    write(`${dir}/package.json`, JSON.stringify({ name, dependencies: Object.fromEntries(deps.map((d) => [d, "*"])) }));

  it("reads links from package files, and ranks a shared package over a big unused folder", () => {
    pkg("packages/ui", "@acme/ui");
    pkg("packages/db", "@acme/db");
    pkg("apps/web", "web", ["@acme/ui", "@acme/db"]);
    pkg("apps/admin", "admin", ["@acme/ui"]);
    for (let i = 0; i < 300; i++) write(`_tooling/f${i}.md`);
    const scan = scanProject(root);
    expect(scan.areas.some((a) => a.id === "tooling"), "no application, no building").toBe(false);
    expect(scan.links).toContainEqual({ from: "apps-web", to: "packages-ui" });
    expect(scan.areas.find((a) => a.id === "packages-ui")?.dependents).toBe(2);
    expect(scan.areas[0]?.id).toBe("packages-ui");
  });

  it("keeps linked rooms on one corridor, joins neighbours, and reports every link", () => {
    pkg("packages/ui", "@acme/ui");
    pkg("apps/web", "web", ["@acme/ui"]);
    pkg("apps/admin", "admin", ["@acme/ui"]);
    const { map } = evolveMap(undefined, scanProject(root), "acme");
    expect(map.links).toHaveLength(2);
    const row = (id: string) => map.rooms.find((room) => room.id === id)?.y;
    expect(row("apps-web"), "a street keeps to its row").toBe(row("apps-admin"));
    expect(row("apps-web")).not.toBe(row("packages-ui"));
    assertPlayable(map);
  });

  it("opens folders named by a workspace config", () => {
    write("package.json", JSON.stringify({ workspaces: ["tools/*"] }));
    pkg("tools/a", "a");
    pkg("tools/b", "b");
    expect(scanProject(root).areas.map((a) => a.path).sort()).toEqual(["tools/a/", "tools/b/"]);
    rmSync(path.join(root, "package.json"));
    write("pnpm-workspace.yaml", "packages:\n  - 'tools/*'\n");
    expect(scanProject(root).areas.map((a) => a.path).sort()).toEqual(["tools/a/", "tools/b/"]);
  });

  it("skips gitignored folders and other repos", () => {
    write(".gitignore", "external/\n");
    write("external/thing/a.ts");
    write("src/a.ts");
    write("nested/.git/HEAD");
    write("nested/a.ts");
    expect(scanProject(root).areas.map((a) => a.path)).toEqual(["src/"]);
  });

  it("fits more than 14 folders, and says how many it left out", () => {
    for (let i = 0; i < 26; i++) write(`packages/p${i}/a.ts`);
    const scan = scanProject(root);
    expect(scan.areas).toHaveLength(20);
    expect(scan.omitted).toBe(6);
    const { map } = evolveMap(undefined, scan, "big");
    expect(map.rooms.filter((r) => !r.role).length).toBeGreaterThan(14);
    assertPlayable(map);
  });

  it("gives a room the look of its own name, not its parent's", () => {
    const { map } = evolveMap(undefined, { areas: [{ id: "apps-api", name: "Api", path: "apps/api/", files: 5 }], rootFiles: 0 }, "x");
    expect(map.rooms.find((r) => r.id === "apps-api")?.floor).toBe("concrete");
  });
});

describe("the office's maps don't change by accident", () => {
  const NOW = "2026-01-01T00:00:00.000Z";
  const fingerprint = (value: unknown): string => createHash("sha1").update(JSON.stringify(value)).digest("hex");
  const noLog = (map: OfficeMap): OfficeMap => ({ ...map, log: [] });

  it("a new project", () => {
    expect(fingerprint(noLog(evolveMap(undefined, webapp, "acme", NOW).map))).toMatchInlineSnapshot(`"bf3b0e93dca4e3544beddc62834a20824da4b511"`);
  });

  it("a project that grows and shrinks", () => {
    const first = evolveMap(undefined, webapp, "acme", NOW).map;
    const second = evolveMap(first, scanOf(["src/api", 400], ["src/ui", 80], ["docs", 15], ["infra", 30], ["public", 25]), "acme", NOW);
    expect(fingerprint(second)).toMatchInlineSnapshot(`"7476d66b8d69e36106f016a80f2436476120ff51"`);
  });

  it("many folders, and links", () => {
    const areas = Array.from({ length: 18 }, (_, i) => area(`packages/p${i}`, 5 + i * 3));
    const links = [{ from: "packages-p1", to: "packages-p0" }, { from: "packages-p2", to: "packages-p0" }];
    expect(fingerprint(noLog(evolveMap(undefined, { rootFiles: 1, areas, links }, "big", NOW).map))).toMatchInlineSnapshot(`"dc0ca71de1be710a7feeb3bbebbbb825d174d64e"`);
  });
});

describe("what counts as an application", () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), "blkc-apps-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });
  const write = (file: string, content = "x"): void => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  };
  const paths = (options = {}) => scanProject(root, options).areas.map((a) => a.path).sort();

  it("gives a building to applications only, in any language", () => {
    write("apps/web/package.json", "{}");
    write("services/api/go.mod");
    write("tools/cli/Cargo.toml");
    write("docs/guide.md");
    write("loose.txt");
    write("notes/ideas/a.md");
    expect(paths()).toEqual(["apps/web/", "services/api/", "tools/cli/"]);
  });

  it("finds an application at any depth, and its folder path is the street", () => {
    write("platform/backend/billing/pyproject.toml");
    write("apps/web/package.json", "{}");
    const scan = scanProject(root);
    expect(scan.areas.find((a) => a.id === "platform-backend-billing")?.street).toBe("platform/backend/");
    expect(scan.areas.find((a) => a.id === "apps-web")?.street).toBe("apps/");
  });

  it("doesn't look inside an application for more buildings", () => {
    write("apps/web/package.json", "{}");
    write("apps/web/vendor-tool/package.json", "{}");
    write("apps/api/package.json", "{}");
    expect(paths()).toEqual(["apps/api/", "apps/web/"]);
  });

  it("recognises a made-up application type from config", () => {
    write("studio/alpha/project.xydsf");
    write("studio/beta/other.xydsf");
    write("studio/gamma/readme.md");
    expect(paths()).not.toContain("studio/alpha/");
    expect(paths({ markers: ["*.xydsf"] })).toEqual(["studio/alpha/", "studio/beta/"]);
  });

  it("can use only your own markers", () => {
    write("a/package.json", "{}");
    write("b/app.xydsf");
    write("c/app.xydsf");
    expect(paths({ markers: ["*.xydsf"], replaceDefaults: true })).toEqual(["b/", "c/"]);
  });

  it("treats a marker's dots literally", () => {
    write("a/appxydsf");
    write("b/app.xydsf");
    write("c/app.xydsf");
    expect(paths({ markers: ["*.xydsf"], replaceDefaults: true })).toEqual(["b/", "c/"]);
  });

  it("lets config add and remove buildings", () => {
    write("apps/web/package.json", "{}");
    write("apps/old/package.json", "{}");
    write("apps/api/package.json", "{}");
    write("docs/guide.md");
    expect(paths({ include: ["docs"], ignore: ["apps/old"] })).toEqual(["apps/api/", "apps/web/", "docs/"]);
    expect(paths({ ignore: ["old"] })).toEqual(["apps/api/", "apps/web/"]);
  });

  it("uses a single application's own folders as its rooms", () => {
    write("package.json", "{}");
    write("src/api/a.ts");
    write("src/web/b.ts");
    write("docs/c.md");
    expect(paths()).toEqual(["docs/", "src/api/", "src/web/"]);
  });

  it("opens the only application when it isn't at the top", () => {
    write("web/package.json", "{}");
    write("web/src/a.ts");
    write("web/lib/b.ts");
    expect(paths()).toEqual(["web/lib/", "web/src/"]);
  });

  it("counts what git tracks, not build output", () => {
    write("apps/web/package.json", "{}");
    write("apps/web/src/a.ts");
    write("apps/api/package.json", "{}");
    write(".gitignore", "generated\n");
    for (let i = 0; i < 50; i++) write(`apps/web/.next-build/f${i}.js`);
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "apps/web/package.json", "apps/web/src/a.ts", "apps/api/package.json"], { cwd: root });
    expect(scanProject(root).areas.find((a) => a.id === "apps-web")?.files).toBe(2);
  });

  it("names a corridor for the streets along it, and agents on a street stand in it", () => {
    write("apps/web/package.json", "{}");
    write("apps/api/package.json", "{}");
    write("packages/ui/package.json", "{}");
    const { map } = evolveMap(undefined, scanProject(root), "streets");
    const hall = map.rooms.find((room) => room.id === "hall-0");
    expect(hall?.name).toContain("apps/");
    expect(hall?.name).toContain("packages/");
    expect(roomForPath(map.rooms, "apps/not-an-app/a.ts")).toBe("hall-0");
    expect(roomForPath(map.rooms, "apps/web/src/a.ts")).toBe("apps-web");
    assertPlayable(map);
  });
});

describe("the floor plan", () => {
  const big = (n: number) => scanOf(...Array.from({ length: n }, (_, i) => [`packages/p${i}`, 5 + i * 9] as [string, number]));
  const built = (map: OfficeMap) => map.rooms.filter((room) => room.role !== "hall");

  it("puts every room on a corridor, in even rows, with a straight edge", () => {
    for (const scan of [webapp, big(12), big(20)]) {
      const { map } = evolveMap(undefined, scan, "plan");
      expect(map.layout).toBe("halls");
      const halls = map.rooms.filter((room) => room.id.startsWith("hall-"));
      for (const room of built(map)) {
        const onHall = halls.some((hall) => room.y + room.h + 1 === hall.y || hall.y + hall.h + 1 === room.y);
        expect(onHall, room.id).toBe(true);
        const door = map.doors.some((d) => d.x >= room.x && d.x < room.x + room.w && halls.some((hall) => (d.y === hall.y - 1 && d.y === room.y + room.h) || (d.y === hall.y + hall.h && d.y === room.y - 1)));
        expect(door, `${room.id} has no door on the corridor`).toBe(true);
      }
      const rows = new Map<number, number>();
      for (const room of built(map)) rows.set(room.y, Math.max(rows.get(room.y) ?? 0, room.x + room.w));
      const ends = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, end]) => end);
      expect(ends[0], "the top and bottom rows make a straight edge").toBe(ends[ends.length - 1]);
      const halls2 = map.rooms.filter((room) => room.id.startsWith("hall-"));
      for (const hall of halls2) expect(hall.x + hall.w, "corridors reach the edge").toBe(ends[0]);
      assertPlayable(map);
    }
  });

  it("uses every wall tile, with no space left between rooms in a row", () => {
    const { map } = evolveMap(undefined, big(12), "plan");
    const byRow = new Map<number, OfficeMap["rooms"]>();
    for (const room of built(map)) byRow.set(room.y, [...(byRow.get(room.y) ?? []), room]);
    for (const rooms of byRow.values()) {
      const sorted = rooms.sort((a, b) => a.x - b.x);
      sorted.slice(1).forEach((room, i) => expect(room.x - ((sorted[i] as OfficeMap["rooms"][number]).x + (sorted[i] as OfficeMap["rooms"][number]).w)).toBe(1));
    }
  });

  it("opens a second corridor when the first is full, up to every folder the scan keeps", () => {
    const { map } = evolveMap(undefined, big(20), "plan");
    expect(map.rooms.some((room) => room.id === "stairs")).toBe(true);
    expect(built(map).filter((room) => room.paths.length > 0 && room.paths[0] !== "").length).toBe(20);
    assertPlayable(map);
  });

  it("moves a new folder into an empty room, and leaves everyone else where they are", () => {
    const first = evolveMap(undefined, webapp, "plan").map;
    const without = evolveMap(first, { ...webapp, areas: webapp.areas.filter((a) => a.id !== "docs") }, "plan");
    const empty = without.map.rooms.find((room) => room.id === "docs");
    expect(empty?.role).toBe("vacant");
    const next = evolveMap(without.map, { ...webapp, areas: [...webapp.areas.filter((a) => a.id !== "docs"), area("billing", 30)] }, "plan");
    const moved = next.map.rooms.find((room) => room.id === "billing");
    expect(moved?.role).toBeUndefined();
    expect(next.map.rooms.filter((room) => room.role === "vacant").length).toBeLessThan(without.map.rooms.filter((room) => room.role === "vacant").length + 1);
    assertPlayable(next.map);
  });

  it("brings a folder back into its own old room", () => {
    const first = evolveMap(undefined, webapp, "plan").map;
    const gone = evolveMap(first, { ...webapp, areas: webapp.areas.filter((a) => a.id !== "docs") }, "plan").map;
    const back = evolveMap(gone, webapp, "plan");
    const room = back.map.rooms.find((candidate) => candidate.id === "docs");
    expect(room?.role).toBeUndefined();
    expect(room?.paths).toEqual(["docs/"]);
    assertPlayable(back.map);
  });

  it("joins neighbours that depend on each other", () => {
    const areas = [area("packages/ui", 20), area("packages/web", 40)];
    const { map } = evolveMap(undefined, { rootFiles: 0, areas, links: [{ from: "packages-web", to: "packages-ui" }] }, "plan");
    const link = map.links?.[0];
    const web = map.rooms.find((room) => room.id === "packages-web");
    const ui = map.rooms.find((room) => room.id === "packages-ui");
    expect(web?.y).toBe(ui?.y);
    expect(link?.door).toBe(true);
    assertPlayable(map);
  });

  it("keeps growing an older map the way it was made", () => {
    const old: OfficeMap = {
      version: 1, seed: "old", evolve: true, cols: 40, rows: 24, log: [], furniture: [
        { type: "coffee", x: 16, y: 5, room: "lounge" }, { type: "board", x: 16, y: 13, room: "quests" },
      ],
      rooms: [
        { id: "lobby", name: "Lobby", x: 2, y: 3, w: 9, h: 6, floor: "stone", paths: [""], role: "lobby" },
        { id: "lounge", name: "Lounge", x: 12, y: 3, w: 10, h: 6, floor: "carpet", paths: [], role: "lounge" },
        { id: "quests", name: "Quests", x: 12, y: 10, w: 9, h: 6, floor: "tile", paths: [], role: "quests" },
      ],
      doors: [{ x: 11, y: 5 }, { x: 15, y: 9 }],
    };
    const { map } = evolveMap(old, webapp, "old");
    expect(map.layout).toBeUndefined();
    expect(map.rooms.some((room) => room.role === "hall")).toBe(false);
    expect(map.rooms.find((room) => room.id === "src-api")).toBeDefined();
    assertPlayable(map);
  });
});

describe("another world", () => {
  const kitchen: WorldPlan = {
    ...OFFICE_PLAN,
    id: "test-kitchen",
    footprint: { stove: { w: 2, h: 1, spot: [0, 1] }, crate: { w: 1, h: 1 }, pass: { w: 4, h: 1, spot: [1, 1] }, bench: { w: 2, h: 1, spot: [0, 1] } },
    specials: [
      { id: "door", name: "Back Door", role: "lobby", floor: "tile", w: 8, h: 5 },
      { id: "yard", name: "Yard", role: "lounge", floor: "stone", w: 8, h: 5 },
      { id: "pass", name: "The Pass", role: "quests", floor: "tile", w: 8, h: 5 },
    ],
    furnishing: { lobby: [{ scatter: "crate" }], lounge: [{ scatter: "bench" }], quests: [{ place: "pass", at: "top" }], vacant: [{ scatter: "crate" }] },
    workstation: "stove",
    themes: [],
    fallback: { floor: "", floors: ["tile"], items: ["crate"], decor: [] },
    filler: ["crate", "crate"],
  };

  it("grows its own rooms and furniture on the same engine", () => {
    const { map } = evolveMap(undefined, webapp, "acme", "now", kitchen);
    expect(map.world).toBe("test-kitchen");
    expect(map.rooms.filter((room) => room.name).slice(0, 3).map((room) => room.name)).toEqual(["Back Door", "Yard", "The Pass"]);
    const types = new Set(map.furniture.map((item) => item.type));
    expect([...types].every((type) => type in kitchen.footprint)).toBe(true);
    expect(types.has("stove")).toBe(true);
  });

  it("stays that world as the project changes", () => {
    registerWorldPlan(kitchen);
    const first = evolveMap(undefined, webapp, "acme", "now", kitchen).map;
    const next = evolveMap(first, scanOf(["src/api", 900], ["src/ui", 80], ["brand-new", 40]), "acme", "now").map;
    expect(next.world).toBe("test-kitchen");
    expect(next.furniture.every((item) => item.type in kitchen.footprint)).toBe(true);
  });

  it("leaves an office map's file exactly as it was", () => {
    expect("world" in evolveMap(undefined, webapp, "acme", "now").map).toBe(false);
  });
});
