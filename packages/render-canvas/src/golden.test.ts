/**
 * The office must not change by accident. These fingerprint every canvas call the renderer
 * makes. If one fails and you meant to change how the office looks, update the snapshot.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { daylightAt, drawBuilding, drawWorld, registerPainter, type Palette } from "./draw.js";
import { registerWorld } from "./pack.js";
import { DEFAULT_LAYOUT, applyUpdate, createWorld, step, type World } from "./world.js";

const palette: Palette = { primary: "#3b82f6", background: "#1a1a2e", text: "#ffffff", accent: "#f59e0b" };

function recorder(): { ctx: CanvasRenderingContext2D; hash: () => string } {
  const sha = createHash("sha1");
  const note = (...parts: unknown[]): void => { sha.update(JSON.stringify(parts)); };
  const gradient = { addColorStop: (...args: unknown[]) => note("stop", ...args) };
  const props = new Map<string, unknown>();
  const ctx = new Proxy({}, {
    get(_, name: string) {
      if (props.has(name)) return props.get(name);
      if (name === "measureText") return (text: string) => ({ width: text.length * 4 });
      if (name === "createRadialGradient" || name === "createLinearGradient") return (...args: unknown[]) => { note(name, ...args); return gradient; };
      return (...args: unknown[]) => note(name, ...args);
    },
    set(_, name: string, value: unknown) {
      props.set(name, value);
      note("set", name, value === gradient ? "gradient" : value);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, hash: () => sha.digest("hex") };
}

const EVERYTHING = [
  "desk", "coffee", "water", "sofa", "plant", "fern", "board", "whiteboard", "shelf", "server", "table", "rug",
  "arcade", "fridge", "printer", "lamp", "beanbag", "tv", "vending", "trophy", "clock", "poster",
] as const;

const agents = [
  { id: "ada", name: "Ada", state: "working" as const, task: "Fix the login" },
  { id: "grace", name: "Grace", state: "blocked" as const, task: "Needs a key" },
  { id: "linus", name: "Linus", state: "reviewing" as const },
  { id: "joan", name: "Joan", state: "idle" as const },
  { id: "alan", name: "Alan", state: "done" as const },
];
const tasks = [{ title: "One", state: "done" as const }, { title: "Two", state: "doing" as const, agent: "ada" }, { title: "Three" }];

function frames(world: World, hour: number): string {
  const { ctx, hash } = recorder();
  const daylight = daylightAt(hour);
  drawBuilding(ctx, world, palette, daylight);
  for (let frame = 0; frame < 40; frame++) {
    step(world, 0.1);
    drawWorld(ctx, world, frame * 0.1, palette, daylight, undefined, "ada");
  }
  return hash();
}

describe("the office, drawn", () => {
  it("the default layout, by day", () => {
    expect(frames(createWorld({ agents, tasks }), 12)).toMatchInlineSnapshot(`"d9ce54efc4cdbce4231cee07e6e67f95fd4007ca"`);
  });

  it("the default layout, at night", () => {
    expect(frames(createWorld({ agents, tasks }), 23)).toMatchInlineSnapshot(`"d32cdac765c22e9f5b5e6d034c6eaec855e58725"`);
  });

  it("every piece of furniture", () => {
    const furniture = EVERYTHING.map((type, i) => ({ type, x: 1 + (i % 6) * 5, y: 2 + Math.floor(i / 6) * 4 }));
    const scene = { cols: 34, rows: 22, rooms: [{ id: "all", name: "All", x: 1, y: 1, w: 32, h: 20 }], doors: [], furniture };
    expect(frames(createWorld({ ...scene, agents, tasks }), 23)).toMatchInlineSnapshot(`"38b45c65984e2292f9e41050f40607cb4af54e88"`);
  });

  it("agents who change state while it runs", () => {
    const world = createWorld({ agents, tasks });
    for (let i = 0; i < 20; i++) step(world, 0.2);
    applyUpdate(world, { agents: agents.map((agent) => ({ ...agent, state: "working" as const })), tasks: [] });
    expect(frames(world, 8)).toMatchInlineSnapshot(`"8e4be6ffc7caae4090b9d5f29c6f5b94b0334d50"`);
  });

  it("the layout's shape", () => {
    const world = createWorld({ ...DEFAULT_LAYOUT, agents });
    const shape = { seats: world.seats, spots: world.spots, cols: world.cols, rows: world.rows, walkable: world.walkable };
    expect(createHash("sha1").update(JSON.stringify(shape)).digest("hex")).toMatchInlineSnapshot(`"8987cbced854e183e67c97d665fd1a095a2b25c9"`);
  });
});

describe("another world", () => {
  it("runs on the same engine, with its own items, words and painter", () => {
    const painted: string[] = [];
    registerWorld({
      id: "test-kitchen",
      name: "Test Kitchen",
      words: { quests: "ORDERS" },
      items: { stove: { w: 2, h: 1, spot: { x: 0, y: 1 }, use: "seat" }, pantry: { w: 1, h: 1, spot: { x: 0, y: 1 }, use: "lounge" } },
      layout: { cols: 12, rows: 10, rooms: [{ id: "line", name: "Line", x: 1, y: 2, w: 10, h: 7 }], doors: [], furniture: [{ type: "stove", x: 2, y: 3 }, { type: "pantry", x: 8, y: 3 }, { type: "desk", x: 4, y: 6 }] },
    });
    registerPainter("test-kitchen", { furniture: (_c, item) => { painted.push(item.type); }, glow: () => undefined });

    const world = createWorld({ world: "test-kitchen", agents: [{ id: "ada", state: "working" }], tasks: [{ title: "Soup" }] });
    expect(world.furniture.map((item) => item.type)).toEqual(["stove", "pantry"]); // desk isn't in this world
    expect(world.seats).toEqual([{ x: 2, y: 4 }]);
    expect(world.spots.lounge).toEqual([{ x: 8, y: 4 }]);
    for (let i = 0; i < 30; i++) step(world, 0.2);
    expect(world.agents[0]).toMatchObject({ x: 2, y: 4 });

    const texts: string[] = [];
    const { ctx } = recorder();
    (ctx as unknown as { fillText: (text: string) => void }).fillText = (text) => { texts.push(text); };
    drawWorld(ctx, world, 0, palette, daylightAt(12), undefined);
    expect(painted).toContain("stove");
    expect(texts).toContain("ORDERS 0/1");
  });

  it("falls back to the office for a world it doesn't know", () => {
    expect(createWorld({ world: "nowhere" }).pack.id).toBe("office");
  });
});
