import { describe, expect, it } from "vitest";
import { agentAt, applyUpdate, createWorld, DEFAULT_LAYOUT, findPath, FURNITURE, goalFor, isSeated, isWalkable, step, MAX_COLS } from "./world.js";
import type { OfficeScene } from "./types.js";

const scene: OfficeScene = {
  agents: [
    { id: "ada", name: "Ada", state: "working", task: "Build it" },
    { id: "bob", name: "Bob", state: "idle" },
    { id: "cy", name: "Cy", state: "blocked" },
    { id: "dee", name: "Dee", state: "reviewing" },
    { id: "eve", name: "Eve", state: "done" },
    { id: "fay", name: "Fay", state: "away" },
  ],
  tasks: [{ title: "One", state: "done" }, { title: "Two", state: "doing" }],
};

const run = (world: ReturnType<typeof createWorld>, seconds: number): void => {
  for (let t = 0; t < seconds; t += 1 / 30) step(world, 1 / 30);
};

describe("the default layout", () => {
  const world = createWorld(scene);

  it("connects every room and every spot someone can walk to", () => {
    const seats = world.agents.map((agent) => agent.seat).filter(Boolean) as { x: number; y: number }[];
    expect(seats.length).toBe(6);
    const start = seats[0] as { x: number; y: number };
    for (const target of [...seats, ...world.spots.lounge, ...world.spots.board]) {
      expect(findPath(world, start, target), JSON.stringify(target)).not.toBeNull();
    }
    expect(world.spots.lounge.length).toBeGreaterThan(0);
    expect(world.spots.board.length).toBeGreaterThan(0);
  });

  it("keeps furniture inside the grid and off the doors", () => {
    for (const item of DEFAULT_LAYOUT.furniture) {
      const spec = FURNITURE[item.type];
      expect(item.x + spec.w).toBeLessThanOrEqual(DEFAULT_LAYOUT.cols);
      expect(item.y + spec.h).toBeLessThanOrEqual(DEFAULT_LAYOUT.rows);
    }
    for (const door of DEFAULT_LAYOUT.doors) {
      expect(isWalkable(world, door.x, door.y)).toBe(true);
      // A door must lead somewhere on both sides, not into furniture.
      const across = [[door.x - 1, door.y], [door.x + 1, door.y], [door.x, door.y - 1], [door.x, door.y + 1]] as const;
      expect(across.filter(([x, y]) => isWalkable(world, x, y)).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("findPath", () => {
  const world = createWorld({});
  it("walks only on walkable tiles, one step at a time", () => {
    const from = { x: 3, y: 6 };
    const path = findPath(world, from, { x: 20, y: 12 }) as { x: number; y: number }[];
    expect(path.length).toBeGreaterThan(0);
    let previous = from;
    for (const tile of path) {
      expect(isWalkable(world, tile.x, tile.y)).toBe(true);
      expect(Math.abs(tile.x - previous.x) + Math.abs(tile.y - previous.y)).toBe(1);
      previous = tile;
    }
  });

  it("returns null for a wall, and nothing to do when already there", () => {
    expect(findPath(world, { x: 3, y: 6 }, { x: 0, y: 0 })).toBeNull();
    expect(findPath(world, { x: 3, y: 6 }, { x: 3, y: 6 })).toEqual([]);
  });
});

describe("what state does", () => {
  it("seats working, thinking and blocked agents at their desks", () => {
    const world = createWorld(scene);
    const [ada, , cy] = world.agents;
    expect(isSeated(ada!)).toBe(true);
    expect(isSeated(cy!)).toBe(true);
    expect(ada!.facing).toBe("up");
  });

  it("sends reviewers to the board and leaves away agents out", () => {
    const world = createWorld(scene);
    const dee = world.agents[3]!;
    expect(world.spots.board).toContainEqual({ x: dee.x, y: dee.y });
    expect(agentAt(world, world.agents[5]!.x + 0.5, world.agents[5]!.y)?.id).not.toBe("fay");
  });

  it("gets idle agents up and moving, always on walkable ground", () => {
    const world = createWorld(scene);
    const bob = world.agents[1]!;
    const seen = new Set<string>();
    for (let i = 0; i < 30 * 120; i++) {
      step(world, 1 / 30);
      seen.add(`${Math.round(bob.x)},${Math.round(bob.y)}`);
      expect(isWalkable(world, Math.round(bob.x), Math.round(bob.y))).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("is the same every run", () => {
    const a = createWorld(scene);
    const b = createWorld(scene);
    run(a, 20);
    run(b, 20);
    expect(a.agents.map((x) => [x.x, x.y])).toEqual(b.agents.map((x) => [x.x, x.y]));
  });
});

describe("applyUpdate", () => {
  it("walks someone to their new goal instead of teleporting", () => {
    const world = createWorld(scene);
    const ada = world.agents[0]!;
    const start = { x: ada.x, y: ada.y };
    applyUpdate(world, { agents: [{ id: "ada", state: "reviewing" }] });
    expect(world.agents[0]).toBe(ada);
    expect({ x: ada.x, y: ada.y }).toEqual(start);
    expect(ada.path.length).toBeGreaterThan(0);
    run(world, 30);
    expect(world.spots.board).toContainEqual({ x: ada.x, y: ada.y });
  });

  it("adds, removes and updates tasks", () => {
    const world = createWorld(scene);
    applyUpdate(world, { agents: [{ id: "new-one", state: "working" }], tasks: [{ title: "Only", state: "done" }] });
    expect(world.agents.map((a) => a.id)).toEqual(["new-one"]);
    expect(world.tasks).toEqual([{ title: "Only", state: "done", agent: "" }]);
  });
});

describe("bad input", () => {
  it("never throws and stays within limits", () => {
    const junk = [
      null, 1, "x", [], { cols: 1e9, rows: -5 }, { rooms: "no", agents: "no", tasks: 4 },
      { rooms: [null, {}, { x: "a", y: 2, w: 1e6, h: 1e6 }], furniture: [null, { type: "nope", x: 1, y: 1 }, { type: "__proto__", x: 1, y: 1 }, { type: "desk" }] },
      { agents: [null, {}, { id: 5, state: "dancing", hair: "url(evil)", name: {} }], tasks: [null, { title: 3, state: "bad" }] },
    ];
    for (const value of junk) {
      const world = createWorld(value as OfficeScene);
      expect(world.cols).toBeLessThanOrEqual(MAX_COLS);
      for (const room of world.rooms) expect(room.x + room.w).toBeLessThanOrEqual(world.cols);
      run(world, 1);
    }
  });

  it("refuses a colour that is not a colour", () => {
    const world = createWorld({ agents: [{ id: "abc", hair: "red;background:url(x)", shirt: "#123456" }] });
    expect(world.agents[0]!.hair).toMatch(/^#/);
    expect(world.agents[0]!.shirt).toBe("#123456");
  });

  it("copes with an office with no desks or rooms to go to", () => {
    const world = createWorld({ rooms: [{ x: 1, y: 1, w: 3, h: 3 }], agents: [{ id: "abc", state: "working" }, { id: "def", state: "idle" }] });
    run(world, 5);
    expect(goalFor(world, world.agents[0]!)).toBeUndefined();
    expect(isWalkable(world, world.agents[0]!.x, world.agents[0]!.y)).toBe(true);
  });
});

describe("agentAt", () => {
  it("finds someone by where they are drawn", () => {
    const world = createWorld(scene);
    const ada = world.agents[0]!;
    expect(agentAt(world, ada.x + 0.5, ada.y - 0.5)?.id).toBe("ada");
    expect(agentAt(world, 0, 0)).toBeUndefined();
  });
});
