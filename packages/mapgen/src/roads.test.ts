import { describe, expect, it } from "vitest";
import { createWorld } from "@blkc-code/render-canvas";
import { evolveRoads, layoutRoads, type MapRoom, type OfficeMap, type ProjectTree, type TreeNode } from "./index.js";

const part = (appPath: string, name: string, item = "Desk"): TreeNode => ({ id: `part:${appPath}/${name}`, kind: "part", name, path: `${appPath}/${name}`, files: 3, item, children: [] });
const app = (rel: string, parts = 3): TreeNode => ({ id: `building:${rel}`, kind: "building", name: rel.split("/").pop() as string, path: rel, files: 10, children: Array.from({ length: parts }, (_, i) => part(rel, `f${i}`, i === 0 ? "Server rack" : "Desk")) });
const group = (owner: string, name: string, n = 2): TreeNode => ({ id: `group:${owner}:${name}`, kind: "group", name, path: owner, children: Array.from({ length: n }, (_, i) => ({ id: `file:${owner}/${i}`, kind: "file" as const, name: `${i}`, path: `${owner}/${i}`, children: [] })) });
const road = (rel: string, children: TreeNode[]): TreeNode => ({ id: `road:${rel}`, kind: "road", name: rel ? `${rel.split("/").pop()}/` : "/", path: rel, children });
const treeOf = (children: TreeNode[], links: ProjectTree["links"] = []): ProjectTree => ({ root: road("", children), secrets: [], links, truncated: false });

const monorepo = (apps: number): ProjectTree => {
  const inApps = Array.from({ length: Math.ceil(apps * 0.7) }, (_, i) => app(`apps/a${i}`));
  const inPkg = Array.from({ length: Math.floor(apps * 0.2) }, (_, i) => app(`packages/p${i}`, 1));
  const deep = Array.from({ length: apps - inApps.length - inPkg.length }, (_, i) => app(`tools/cli/x${i}`, 2));
  return treeOf([
    road("apps", [...inApps, group("apps", "Docs")]),
    road("packages", inPkg),
    road("tools", [road("tools/cli", deep), group("tools", "Config")]),
    group("", "Docs", 5), group("", "Config", 8),
  ].filter((node) => node.children.length > 0));
};

/** Nothing overlaps, and everyone can walk everywhere. */
function assertSound(map: OfficeMap): void {
  const world = createWorld(map as never);
  const isWalkable = (_: unknown, x: number, y: number): boolean => world.walkable[y * world.cols + x] === true;
  expect(world.cols).toBe(map.cols);
  expect(world.rooms.length).toBe(map.rooms.length);
  const buildings = map.rooms.filter((room) => room.role !== "hall");
  const taken = new Map<string, string>();
  for (const room of buildings) {
    // A one-tile wall around each building, shared with its neighbours.
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) {
      const key = `${x},${y}`;
      expect(taken.get(key), `${room.id} overlaps ${taken.get(key)}`).toBeUndefined();
      taken.set(key, room.id);
    }
  }
  for (const room of map.rooms.filter((candidate) => candidate.role === "hall")) {
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) {
      expect(taken.has(`${x},${y}`), `${room.id} runs through ${taken.get(`${x},${y}`)}`).toBe(false);
    }
  }
  const lobby = map.rooms.find((room) => room.role === "lobby") as MapRoom;
  const seen = new Uint8Array(world.cols * world.rows);
  const start = (() => { for (let y = lobby.y; y < lobby.y + lobby.h; y++) for (let x = lobby.x; x < lobby.x + lobby.w; x++) if (isWalkable(world, x, y)) return [x, y] as const; throw new Error("lobby full"); })();
  const stack: (readonly [number, number])[] = [start];
  seen[start[1] * world.cols + start[0]] = 1;
  while (stack.length > 0) {
    const [x, y] = stack.pop() as readonly [number, number];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= world.cols || ny >= world.rows) continue;
      const at = ny * world.cols + nx;
      if (seen[at] || !isWalkable(world, nx, ny)) continue;
      seen[at] = 1;
      stack.push([nx, ny]);
    }
  }
  for (const room of map.rooms) {
    let reached = false;
    for (let y = room.y; y < room.y + room.h && !reached; y++) for (let x = room.x; x < room.x + room.w && !reached; x++) reached = seen[y * world.cols + x] === 1;
    expect(reached, `${room.id} is cut off`).toBe(true);
  }
  for (const seat of world.seats) expect(seen[seat.y * world.cols + seat.x], `seat ${seat.x},${seat.y} is cut off`).toBe(1);
}

describe("a map that grows", () => {
  for (const size of [2, 50, 2000]) {
    it(`lays out ${size} applications with nothing overlapping or cut off`, () => {
      const map = layoutRoads(monorepo(size), "acme");
      assertSound(map);
      expect(map.rooms.filter((room) => room.paths[0]?.includes("/a") || room.paths[0]?.includes("/p") || room.paths[0]?.includes("/x")).length).toBe(size);
    }, 120000);
  }

  it("doesn't shrink buildings as a project gets bigger", () => {
    const size = (map: OfficeMap): string => { const room = map.rooms.find((candidate) => candidate.id === "apps-a0") as MapRoom; return `${room.w}x${room.h}`; };
    expect(size(layoutRoads(monorepo(2000), "acme"))).toBe(size(layoutRoads(monorepo(4), "acme")));
  }, 120000);

  it("makes a building big enough for every part, each traced to its folder", () => {
    const big = app("apps/big", 19);
    const map = layoutRoads(treeOf([road("apps", [big, app("apps/small", 1)])]), "acme");
    const items = map.furniture.filter((item) => item.room === "apps-big");
    expect(items.map((item) => item.part).sort()).toEqual(big.children.map((child) => child.path).sort());
    expect(items.find((item) => item.part === "apps/big/f0")?.type).toBe("server");
    assertSound(map);
  });

  it("names roads by their literal path, and nests them", () => {
    const map = layoutRoads(treeOf([road("apps", [app("apps/web"), road("apps/tools", [app("apps/tools/cli")])])]), "acme");
    const names = map.rooms.filter((room) => room.role === "hall").map((room) => room.name);
    expect(names).toEqual(expect.arrayContaining(["apps/", "apps/tools/"]));
    assertSound(map);
  });

  it("puts loose files on their own road, in groups", () => {
    const map = layoutRoads(treeOf([road("apps", [app("apps/web"), group("apps", "Docs", 3)]), group("", "Config", 13)]), "acme");
    const piles = map.furniture.filter((item) => item.type === "pile");
    expect(piles.map((item) => item.label).sort()).toEqual(["Config 13", "Docs 3"]);
    const apps = map.rooms.find((room) => room.name === "apps/") as MapRoom;
    expect(piles.find((item) => item.label === "Docs 3")?.y).toBe(apps.y);
    assertSound(map);
  });

  it("only draws roads that lead to an application, and folds the rest", () => {
    const tree = treeOf([
      road("apps", [app("apps/web")]),
      road("notes", [road("notes/deep", [group("notes/deep", "Docs")]), group("notes", "Docs")]),
      road("_tooling", [group("_tooling", "Config")]),
    ]);
    const map = layoutRoads(tree, "acme");
    const named = map.rooms.filter((room) => room.role === "hall" && room.name).map((room) => room.name);
    expect(named).toEqual(["apps/"]);
    const pile = map.furniture.find((item) => item.label === "Folders 2");
    expect(pile?.part).toBe("group::Folders");
    assertSound(map);
  });

  it("keeps a project that is one application working", () => {
    const tree: ProjectTree = { root: { ...app("", 0), name: "shop", children: [part("src", "api", "Server rack"), part("src", "web"), group("", "Docs")] }, secrets: [], links: [], truncated: false };
    const map = layoutRoads(tree, "shop");
    expect(map.rooms.some((room) => room.id === "src-api")).toBe(true);
    assertSound(map);
  });

  it("reports code links between buildings", () => {
    const map = layoutRoads(treeOf([road("apps", [app("apps/web")]), road("packages", [app("packages/ui")])], [{ from: "building:apps/web", to: "building:packages/ui" }]), "acme");
    expect(map.links?.[0]).toMatchObject({ from: "apps-web", to: "packages-ui" });
  });

  it("is the same every time", () => {
    expect(layoutRoads(monorepo(30), "acme")).toEqual(layoutRoads(monorepo(30), "acme"));
  });
});

describe("as the project changes", () => {
  const places = (map: OfficeMap, ids: string[]): (number[] | undefined)[] => {
    const lobby = map.rooms.find((room) => room.role === "lobby") as MapRoom;
    return ids.map((id) => { const room = map.rooms.find((candidate) => candidate.id === id); return room && [room.x - lobby.x, room.y - lobby.y, room.w, room.h]; });
  };

  it("changes nothing when nothing changed", () => {
    const tree = monorepo(12);
    const first = layoutRoads(tree, "acme");
    const next = evolveRoads(first, tree, "acme");
    expect(next.changes).toEqual([]);
    expect(next.map).toEqual(first);
  });

  it("moves a new folder into a spare lot, and moves nothing else", () => {
    const small = treeOf([road("apps", [app("apps/a"), app("apps/b"), app("apps/c"), app("apps/d")])]);
    const first = layoutRoads(small, "acme");
    const ids = first.rooms.filter((room) => !room.role).map((room) => room.id);
    const next = evolveRoads(first, treeOf([road("apps", [app("apps/a"), app("apps/b"), app("apps/c"), app("apps/d"), app("apps/e", 1)])]), "acme");
    expect(next.changes).toContain("New room: E");
    expect(places(next.map, ids)).toEqual(places(first, ids));
    assertSound(next.map);
  });

  it("adds a new stretch of road when the lots run out, and moves nothing", () => {
    const first = layoutRoads(treeOf([road("apps", [app("apps/a")])]), "acme");
    const ids = first.rooms.filter((room) => !room.role).map((room) => room.id);
    const many = Array.from({ length: 12 }, (_, i) => app(`apps/n${i}`, 8));
    const next = evolveRoads(first, treeOf([road("apps", [app("apps/a"), ...many]), road("services", [app("services/s")])]), "acme");
    expect(places(next.map, ids)).toEqual(places(first, ids));
    expect(next.map.rooms.some((room) => room.id === "services-s")).toBe(true);
    expect(next.map.rooms.some((room) => room.id === "apps-n11")).toBe(true);
    assertSound(next.map);
  });

  it("keeps a room empty when its folder goes, and gives it back", () => {
    const first = layoutRoads(treeOf([road("apps", [app("apps/a"), app("apps/b")])]), "acme");
    const gone = evolveRoads(first, treeOf([road("apps", [app("apps/a")])]), "acme");
    expect(gone.map.rooms.find((room) => room.id === "apps-b")?.role).toBe("vacant");
    const back = evolveRoads(gone.map, treeOf([road("apps", [app("apps/a"), app("apps/b")])]), "acme");
    expect(back.map.rooms.find((room) => room.id === "apps-b")?.role).toBeUndefined();
    expect(back.changes).toContain("B is back");
    assertSound(back.map);
  });

  it("updates items when a building's parts change", () => {
    const first = layoutRoads(treeOf([road("apps", [app("apps/a", 3)])]), "acme");
    const next = evolveRoads(first, treeOf([road("apps", [app("apps/a", 2)])]), "acme");
    expect(next.map.furniture.filter((item) => item.room === "apps-a")).toHaveLength(2);
  });

  it("never touches a building edited by hand", () => {
    const first = layoutRoads(treeOf([road("apps", [app("apps/a"), app("apps/b")])]), "acme");
    const room = first.rooms.find((candidate) => candidate.id === "apps-a") as MapRoom;
    room.locked = true;
    room.name = "Mine";
    const next = evolveRoads(first, treeOf([road("apps", [app("apps/b")])]), "acme").map;
    expect(next.rooms.find((candidate) => candidate.id === "apps-a")?.name).toBe("Mine");
  });

  it("stays sound, and keeps everything in place, through a long messy history", () => {
    let map = layoutRoads(monorepo(10), "messy");
    const seen = new Map<string, number[]>();
    for (let turn = 0; turn < 30; turn++) {
      const apps = Array.from({ length: 4 + (turn * 7) % 13 }, (_, i) => app(`apps/a${(i + turn) % 20}`, 1 + (i % 3)));
      map = evolveRoads(map, treeOf([road("apps", apps), road(`x${turn % 3}`, [app(`x${turn % 3}/y`)])]), "messy").map;
      assertSound(map);
      const lobby = map.rooms.find((room) => room.role === "lobby") as MapRoom;
      // A building that stays never moves. One that left may lose its lot to a newcomer.
      for (const id of [...seen.keys()]) if (!map.rooms.some((room) => room.id === id && !room.role)) seen.delete(id);
      for (const room of map.rooms.filter((candidate) => !candidate.role)) {
        const place = [room.x - lobby.x, room.y - lobby.y];
        if (seen.has(room.id)) expect(place, `${room.id} moved`).toEqual(seen.get(room.id));
        seen.set(room.id, place);
      }
    }
  }, 60000);
});
