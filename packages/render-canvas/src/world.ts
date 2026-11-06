/**
 * The office as data: which tiles can be walked on, who is where, and where they are
 * heading. Nothing in here touches a canvas, so all of it can be tested.
 */

import type { AgentState, FloorStyle, FurnitureType, OfficeAgent, OfficeDoor, OfficeFurniture, OfficeRoom, OfficeScene, OfficeTask, TaskState } from "./types.js";

export const MAX_COLS = 64;
export const MAX_ROWS = 40;
const MAX_AGENTS = 40;
const MAX_FURNITURE = 300;
const MAX_TASKS = 60;
export const WALK_SPEED = 3.2; // tiles a second

/** Footprint in tiles, and where someone stands to use it, relative to its corner. */
export const FURNITURE: Record<FurnitureType, { w: number; h: number; solid?: boolean; spot?: { x: number; y: number } }> = {
  desk: { w: 3, h: 2, spot: { x: 1, y: 2 } },
  coffee: { w: 2, h: 1, spot: { x: 0, y: 1 } },
  water: { w: 1, h: 1, spot: { x: 0, y: 1 } },
  sofa: { w: 3, h: 1, spot: { x: 1, y: 1 } },
  plant: { w: 1, h: 1 },
  board: { w: 4, h: 1, spot: { x: 1, y: 1 } },
  shelf: { w: 2, h: 1, spot: { x: 0, y: 1 } },
  server: { w: 1, h: 1 },
  table: { w: 3, h: 2, spot: { x: 1, y: 2 } },
  rug: { w: 4, h: 3, solid: false },
};

const AGENT_STATES: readonly string[] = ["working", "thinking", "blocked", "reviewing", "idle", "done", "away"];
const TASK_STATES: readonly string[] = ["todo", "doing", "done"];
const FLOORS: readonly string[] = ["wood", "carpet", "tile"];

export const DEFAULT_LAYOUT = {
  cols: 26,
  rows: 17,
  rooms: [
    { id: "studio", name: "Studio", x: 1, y: 3, w: 15, h: 13, floor: "wood" },
    { id: "lounge", name: "Lounge", x: 17, y: 3, w: 8, h: 6, floor: "carpet" },
    { id: "quests", name: "Quests", x: 17, y: 10, w: 8, h: 6, floor: "tile" },
  ] as OfficeRoom[],
  doors: [{ x: 16, y: 6 }, { x: 16, y: 13 }, { x: 23, y: 9 }] as OfficeDoor[],
  furniture: [
    { type: "desk", x: 2, y: 4 }, { type: "desk", x: 7, y: 4 }, { type: "desk", x: 12, y: 4 },
    { type: "desk", x: 2, y: 10 }, { type: "desk", x: 7, y: 10 }, { type: "desk", x: 12, y: 10 },
    { type: "plant", x: 1, y: 8 }, { type: "plant", x: 15, y: 8 }, { type: "server", x: 15, y: 15 }, { type: "server", x: 14, y: 15 },
    { type: "shelf", x: 1, y: 15 },
    { type: "coffee", x: 19, y: 3 }, { type: "water", x: 21, y: 3 }, { type: "sofa", x: 22, y: 3 }, { type: "rug", x: 20, y: 5 }, { type: "plant", x: 24, y: 8 },
    { type: "board", x: 19, y: 10 }, { type: "table", x: 19, y: 13 }, { type: "plant", x: 24, y: 15 },
  ] as OfficeFurniture[],
};

const int = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback);
const str = (value: unknown, max = 120): string => (typeof value === "string" ? value.slice(0, max) : "");
const list = <T>(value: unknown, max: number): T[] => (Array.isArray(value) ? (value.slice(0, max) as T[]) : []);

export interface Room { name: string; x: number; y: number; w: number; h: number; floor: FloorStyle }
export interface Item { type: FurnitureType; x: number; y: number }
export interface Task { title: string; state: TaskState; agent: string }

export interface Agent {
  id: string;
  name: string;
  role: string;
  state: AgentState;
  task: string;
  hair: string;
  skin: string;
  shirt: string;
  /** Position in tiles; x/y is the tile the feet are on. */
  x: number;
  y: number;
  path: { x: number; y: number }[];
  facing: "up" | "down" | "left" | "right";
  walking: boolean;
  seat?: { x: number; y: number };
  /** Seconds until an idle agent picks somewhere new. */
  rest: number;
  seed: number;
}

export interface World {
  cols: number;
  rows: number;
  rooms: Room[];
  doors: OfficeDoor[];
  furniture: Item[];
  agents: Agent[];
  tasks: Task[];
  walkable: boolean[];
  spots: { lounge: { x: number; y: number }[]; board: { x: number; y: number }[] };
  seats: { x: number; y: number }[];
}

export function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

const HAIR = ["#2b1b12", "#5a3a22", "#a8622d", "#d9b36c", "#20242e", "#7d2f3f", "#4a5568", "#e5e7eb"];
const SKIN = ["#f4d3b5", "#e8b98f", "#c98d62", "#9c6644", "#6f4530", "#4e2f20"];
const SHIRT = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

// A theme value becomes a canvas colour, so anything but a plain colour is refused.
const colour = (value: unknown, fallback: string): string =>
  typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;

const at = (world: { cols: number }, x: number, y: number): number => y * world.cols + x;

export function isWalkable(world: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.cols && y < world.rows && world.walkable[at(world, x, y)] === true;
}

/** Shortest walk between two tiles, or null if they aren't connected. Excludes the start. */
export function findPath(world: World, from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number }[] | null {
  if (!isWalkable(world, to.x, to.y)) return null;
  if (from.x === to.x && from.y === to.y) return [];
  const previous = new Int32Array(world.cols * world.rows).fill(-1);
  const start = at(world, from.x, from.y);
  previous[start] = start;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head] as number;
    const x = current % world.cols;
    const y = Math.floor(current / world.cols);
    if (x === to.x && y === to.y) {
      const path: { x: number; y: number }[] = [];
      for (let step = current; step !== start; step = previous[step] as number) {
        path.unshift({ x: step % world.cols, y: Math.floor(step / world.cols) });
      }
      return path;
    }
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(world, nx, ny)) continue;
      const index = at(world, nx, ny);
      if (previous[index] !== -1) continue;
      previous[index] = current;
      queue.push(index);
    }
  }
  return null;
}

function toAgent(raw: OfficeAgent, index: number): Agent {
  const id = str(raw?.id, 60) || `agent-${index + 1}`;
  const seed = hash(id);
  const state = AGENT_STATES.includes(raw?.state as string) ? (raw.state as AgentState) : "idle";
  return {
    id,
    name: str(raw?.name, 24) || id,
    role: str(raw?.role, 40),
    state,
    task: str(raw?.task, 120),
    hair: colour(raw?.hair, HAIR[seed % HAIR.length] as string),
    skin: colour(raw?.skin, SKIN[(seed >>> 4) % SKIN.length] as string),
    shirt: colour(raw?.shirt, SHIRT[(seed >>> 8) % SHIRT.length] as string),
    x: 0,
    y: 0,
    path: [],
    facing: "down",
    walking: false,
    rest: 0,
    seed,
  };
}

function toTask(raw: OfficeTask): Task {
  return { title: str(raw?.title, 80), state: TASK_STATES.includes(raw?.state as string) ? (raw.state as TaskState) : "todo", agent: str(raw?.agent, 60) };
}

/** Build a world from a scene. Bad values are dropped or clamped, so it never throws. */
export function createWorld(scene: OfficeScene = {}): World {
  const custom = Array.isArray(scene?.rooms) && scene.rooms.length > 0;
  const cols = Math.min(Math.max(int(scene?.cols, custom ? 20 : DEFAULT_LAYOUT.cols), 6), MAX_COLS);
  const rows = Math.min(Math.max(int(scene?.rows, custom ? 14 : DEFAULT_LAYOUT.rows), 6), MAX_ROWS);
  const rawRooms = custom ? list<OfficeRoom>(scene.rooms, 40) : DEFAULT_LAYOUT.rooms;
  const rawDoors = custom ? list<OfficeDoor>(scene.doors, 60) : DEFAULT_LAYOUT.doors;
  const rawItems = Array.isArray(scene?.furniture) ? list<OfficeFurniture>(scene.furniture, MAX_FURNITURE) : custom ? [] : DEFAULT_LAYOUT.furniture;

  // Clamped to the grid: everything later loops over these, so a huge room must not hang the page.
  const rooms: Room[] = rawRooms.map((room) => {
    const x = Math.min(Math.max(int(room?.x, 0), 0), cols);
    const y = Math.min(Math.max(int(room?.y, 0), 0), rows);
    return {
      name: str(room?.name, 24),
      x, y,
      w: Math.min(Math.max(int(room?.w, 0), 0), cols - x),
      h: Math.min(Math.max(int(room?.h, 0), 0), rows - y),
      floor: FLOORS.includes(room?.floor as string) ? (room.floor as FloorStyle) : "wood",
    };
  });
  const walkable = new Array<boolean>(cols * rows).fill(false);
  const mark = (x: number, y: number, value: boolean): void => {
    if (x >= 0 && y >= 0 && x < cols && y < rows) walkable[y * cols + x] = value;
  };
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) mark(x, y, true);
  }
  const doors = rawDoors.map((door) => ({ x: int(door?.x, -1), y: int(door?.y, -1) })).filter((door) => door.x >= 0 && door.y >= 0);
  for (const door of doors) mark(door.x, door.y, true);

  const furniture: Item[] = rawItems
    .filter((item) => item && Object.hasOwn(FURNITURE, item.type))
    .map((item) => ({ type: item.type, x: int(item.x, -99), y: int(item.y, -99) }));
  for (const item of furniture) {
    const spec = FURNITURE[item.type];
    if (spec.solid === false) continue;
    for (let y = item.y; y < item.y + spec.h; y++) for (let x = item.x; x < item.x + spec.w; x++) mark(x, y, false);
  }

  const world: World = {
    cols, rows, rooms, doors, furniture, walkable,
    agents: list<OfficeAgent>(scene?.agents, MAX_AGENTS).map(toAgent),
    tasks: list<OfficeTask>(scene?.tasks, MAX_TASKS).map(toTask),
    spots: { lounge: [], board: [] },
    seats: [],
  };

  const spot = (item: Item): { x: number; y: number } | undefined => {
    const offset = FURNITURE[item.type].spot;
    if (!offset) return undefined;
    const point = { x: item.x + offset.x, y: item.y + offset.y };
    return isWalkable(world, point.x, point.y) ? point : undefined;
  };
  world.seats = furniture.filter((item) => item.type === "desk").map(spot).filter((p): p is { x: number; y: number } => Boolean(p));
  for (const item of furniture) {
    const point = spot(item);
    if (!point) continue;
    if (item.type === "coffee" || item.type === "sofa" || item.type === "water" || item.type === "shelf") world.spots.lounge.push(point);
    if (item.type === "board" || item.type === "table") world.spots.board.push(point);
  }

  for (const agent of world.agents) placeAgent(world, agent);
  return world;
}

function firstWalkable(world: World): { x: number; y: number } {
  for (let y = 0; y < world.rows; y++) for (let x = 0; x < world.cols; x++) if (isWalkable(world, x, y)) return { x, y };
  return { x: 0, y: 0 };
}

const NEEDS_DESK: readonly AgentState[] = ["working", "thinking", "blocked"];

/** Desks belong to whoever is working at one: claimed when an agent starts, freed when it stops. */
function updateSeat(world: World, agent: Agent): void {
  if (!NEEDS_DESK.includes(agent.state)) {
    agent.seat = undefined;
    return;
  }
  if (agent.seat) return;
  const taken = new Set(world.agents.filter((other) => other !== agent && other.seat).map((other) => `${other.seat?.x},${other.seat?.y}`));
  agent.seat = world.seats.find((seat) => !taken.has(`${seat.x},${seat.y}`));
}

/** Where an agent is standing, or heading to if it is walking. */
function standing(agent: Agent): { x: number; y: number } {
  const end = agent.path[agent.path.length - 1];
  return end ?? { x: Math.round(agent.x), y: Math.round(agent.y) };
}

/** The closest tile to a spot that no other agent is on, so they don't stand inside each other. */
function freeTileNear(world: World, agent: Agent, spot: { x: number; y: number }): { x: number; y: number } {
  const others = new Set(world.agents.filter((other) => other !== agent && other.state !== "away").map((other) => {
    const at = standing(other);
    return `${at.x},${at.y}`;
  }));
  for (let radius = 0; radius <= 4; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) !== radius) continue;
        const tile = { x: spot.x + dx, y: spot.y + dy };
        if (isWalkable(world, tile.x, tile.y) && !others.has(`${tile.x},${tile.y}`) && findPath(world, spot, tile)) return tile;
      }
    }
  }
  return spot;
}

/** Where this agent's current state wants it to be. */
export function goalFor(world: World, agent: Agent): { x: number; y: number } | undefined {
  const pick = (spots: { x: number; y: number }[]): { x: number; y: number } | undefined => {
    const spot = spots.length > 0 ? spots[(agent.seed + Math.floor(agent.rest * 1000)) % spots.length] : undefined;
    return spot && freeTileNear(world, agent, spot);
  };
  switch (agent.state) {
    case "working":
    case "thinking":
    case "blocked":
      return agent.seat ?? pick(world.spots.lounge);
    case "reviewing":
      return pick(world.spots.board) ?? agent.seat;
    case "idle":
    case "done":
      return pick(world.spots.lounge) ?? agent.seat;
    default:
      return undefined;
  }
}

function placeAgent(world: World, agent: Agent): void {
  updateSeat(world, agent);
  const goal = goalFor(world, agent) ?? agent.seat ?? firstWalkable(world);
  agent.x = goal.x;
  agent.y = goal.y;
  agent.path = [];
  agent.walking = false;
  agent.facing = isSeated(agent) ? "up" : "down";
  agent.rest = 2 + (agent.seed % 50) / 10;
}

export const isSeated = (agent: Agent): boolean =>
  (agent.state === "working" || agent.state === "thinking" || agent.state === "blocked") &&
  agent.seat !== undefined && agent.seat.x === agent.x && agent.seat.y === agent.y && agent.path.length === 0;

function routeTo(world: World, agent: Agent, goal: { x: number; y: number } | undefined): void {
  if (!goal) return;
  const from = { x: Math.round(agent.x), y: Math.round(agent.y) };
  agent.path = findPath(world, from, goal) ?? [];
}

/** Advance the whole office by `dt` seconds. */
export function step(world: World, dt: number): void {
  for (const agent of world.agents) {
    if (agent.state === "away") continue;

    if (agent.path.length > 0) {
      const target = agent.path[0] as { x: number; y: number };
      const dx = target.x - agent.x;
      const dy = target.y - agent.y;
      const distance = Math.hypot(dx, dy);
      const move = WALK_SPEED * dt;
      if (Math.abs(dx) > Math.abs(dy)) agent.facing = dx > 0 ? "right" : "left";
      else if (dy !== 0) agent.facing = dy > 0 ? "down" : "up";
      agent.walking = true;
      if (distance <= move) {
        agent.x = target.x;
        agent.y = target.y;
        agent.path.shift();
      } else {
        agent.x += (dx / distance) * move;
        agent.y += (dy / distance) * move;
      }
      continue;
    }

    agent.walking = false;
    if (agent.state === "idle") {
      agent.rest -= dt;
      if (agent.rest <= 0) {
        agent.seed = hash(String(agent.seed)); // somewhere new, the same way each run
        agent.rest = 3 + (agent.seed % 60) / 10;
        routeTo(world, agent, goalFor(world, agent));
      }
    }
    if (isSeated(agent)) agent.facing = "up";
  }
}

/** Change what people are doing without restarting them. New agents appear at their goal. */
export function applyUpdate(world: World, scene: Pick<OfficeScene, "agents" | "tasks">): void {
  if (Array.isArray(scene.tasks)) world.tasks = list<OfficeTask>(scene.tasks, MAX_TASKS).map(toTask);
  if (!Array.isArray(scene.agents)) return;
  const existing = new Map(world.agents.map((agent) => [agent.id, agent]));
  const incoming = list<OfficeAgent>(scene.agents, MAX_AGENTS).map(toAgent);
  world.agents = incoming.map((next) => existing.get(next.id)).filter((agent): agent is Agent => Boolean(agent));
  const updated = incoming.map((next) => {
    const current = existing.get(next.id);
    if (!current) {
      placeAgent(world, next);
      world.agents = [...world.agents, next];
      // New arrivals come in through a door and walk to where they are going.
      const door = world.doors[0];
      const goal = { x: next.x, y: next.y };
      if (door && next.state !== "away") {
        next.x = door.x;
        next.y = door.y;
        routeTo(world, next, goal);
      }
      return next;
    }
    Object.assign(current, { name: next.name, role: next.role, task: next.task, hair: next.hair, skin: next.skin, shirt: next.shirt });
    if (current.state !== next.state) {
      current.state = next.state;
      updateSeat(world, current);
      if (next.state !== "away") routeTo(world, current, goalFor(world, current));
    } else if (NEEDS_DESK.includes(current.state) && !current.seat) {
      // No desk was free before. One may be now.
      updateSeat(world, current);
      if (current.seat) routeTo(world, current, current.seat);
    }
    return current;
  });
  world.agents = updated;
}

/** Agent under a point given in tiles, nearest first. */
export function agentAt(world: World, x: number, y: number): Agent | undefined {
  let best: Agent | undefined;
  let bestDistance = Infinity;
  for (const agent of world.agents) {
    if (agent.state === "away") continue;
    const dx = x - (agent.x + 0.5);
    const dy = y - (agent.y + 0.1);
    const distance = Math.hypot(dx, dy);
    if (Math.abs(dx) < 0.8 && dy > -1.6 && dy < 1.1 && distance < bestDistance) {
      best = agent;
      bestDistance = distance;
    }
  }
  return best;
}
