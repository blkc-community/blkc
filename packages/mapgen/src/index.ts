/**
 * BLKC Mapgen. Grows a building from a project. Every project gets its own map: the seed comes from its
 * name, and the rooms from its folders. The map evolves rather than regenerates: rooms that
 * exist stay where they are, new folders add rooms, bigger folders get bigger rooms, and a
 * room someone has edited by hand is never touched again.
 *
 * Only folder names and file counts are read here, never file contents.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface MapRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floor: string;
  paths: string[];
  /** lobby, lounge and quests are always there. vacant is a folder's room kept as a corridor. */
  role?: "lobby" | "lounge" | "quests" | "vacant";
  /** Edited by hand: the generator leaves it alone. */
  locked?: boolean;
  files?: number;
}
export interface MapItem { type: string; x: number; y: number; room?: string }
export interface MapDoor { x: number; y: number }
export interface OfficeMap {
  version: 1;
  seed: string;
  /** Follow the project as it changes. */
  evolve: boolean;
  cols: number;
  rows: number;
  rooms: MapRoom[];
  doors: MapDoor[];
  furniture: MapItem[];
  log: { at: string; text: string }[];
}

export interface ProjectArea { id: string; name: string; path: string; files: number }
export interface ProjectScan { areas: ProjectArea[]; rootFiles: number }

const MAX_COLS = 64;
const MAX_ROWS = 40;
const MAX_AREAS = 14;
const MAX_ENTRIES = 60000;
const MAX_DEPTH = 8;
const IGNORE = new Set(["node_modules", ".git", "dist", "build", "out", "target", "coverage", ".next", ".turbo", ".cache", "vendor", "venv", "__pycache__", ".venv", ".idea", ".vscode", ".claude", ".blkc", ".gemini", ".cursor"]);
const CONTAINERS = new Set(["src", "packages", "apps", "services", "libs", "lib", "modules", "crates", "cmd", "internal", "app"]);

const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const titled = (value: string): string =>
  value.replace(/^\./, "").split(/[-_]/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ").slice(0, 18) || value.slice(0, 18);

export function hashText(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

/** A small seeded generator, so the same project always grows the same way. */
function rng(seed: string): () => number {
  let state = hashText(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

/** Folder names and file counts. A .gitignore's plain folder names are skipped too. */
export function scanProject(root: string): ProjectScan {
  const ignored = new Set(IGNORE);
  try {
    for (const line of readFileSync(path.join(root, ".gitignore"), "utf8").split("\n")) {
      const name = line.trim().replace(/^\//, "").replace(/\/$/, "");
      if (name && !/[*!#/\s]/.test(name)) ignored.add(name);
    }
  } catch {
    // no .gitignore
  }

  let budget = MAX_ENTRIES;
  const countFiles = (dir: string, depth: number): number => {
    if (depth > MAX_DEPTH || budget <= 0) return 0;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return 0;
    }
    let files = 0;
    for (const entry of entries) {
      if (--budget <= 0) break;
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) files += countFiles(path.join(dir, entry.name), depth + 1);
      } else if (entry.isFile()) {
        files += 1;
      }
    }
    return files;
  };
  const subdirs = (dir: string): string[] => {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !ignored.has(entry.name) && (!entry.name.startsWith(".") || entry.name === ".github"))
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  };

  const areas: ProjectArea[] = [];
  const add = (rel: string): void => {
    const files = countFiles(path.join(root, rel), 0);
    if (files > 0) areas.push({ id: slug(rel), name: titled(path.basename(rel)), path: `${rel}/`, files });
  };
  for (const name of subdirs(root)) {
    const children = CONTAINERS.has(name) ? subdirs(path.join(root, name)) : [];
    if (children.length >= 2) for (const child of children) add(`${name}/${child}`);
    else add(name);
  }
  let rootFiles = 0;
  try {
    rootFiles = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile()).length;
  } catch {
    // leave it at 0
  }
  areas.sort((a, b) => b.files - a.files || a.id.localeCompare(b.id));
  return { areas: areas.slice(0, MAX_AREAS), rootFiles };
}

// --- What a folder looks like ---------------------------------------------------------------------------

interface Theme { floor: string; items: string[]; decor: string[] }

const THEMES: { match: RegExp; theme: Theme }[] = [
  { match: /doc|guide|wiki|spec|readme|manual/, theme: { floor: "carpet", items: ["shelf", "shelf", "lamp"], decor: ["poster", "clock"] } },
  { match: /test|spec|e2e|qa|fixture/, theme: { floor: "tile", items: ["whiteboard", "printer"], decor: ["clock", "poster"] } },
  { match: /api|server|backend|service|worker|core|engine|kernel/, theme: { floor: "concrete", items: ["server", "server", "server", "printer"], decor: ["clock"] } },
  { match: /db|data|migrat|schema|model|store|sql|supabase/, theme: { floor: "stone", items: ["server", "server", "shelf"], decor: ["clock"] } },
  { match: /ui|web|front|client|component|page|view|style|site|app/, theme: { floor: "wood", items: ["fern", "lamp", "beanbag"], decor: ["poster", "poster"] } },
  { match: /asset|public|image|media|static|font|icon/, theme: { floor: "grass", items: ["plant", "fern", "plant"], decor: [] } },
  { match: /script|tool|ci|github|infra|deploy|ops|docker|bin/, theme: { floor: "stone", items: ["server", "printer", "whiteboard"], decor: ["clock"] } },
  { match: /kit|block|circuit|plugin|ext|module|package/, theme: { floor: "carpet", items: ["whiteboard", "shelf"], decor: ["poster"] } },
];
const FALLBACK_FLOORS = ["wood", "carpet", "tile", "stone", "concrete"];

function themeFor(id: string, random: () => number): Theme {
  const found = THEMES.find(({ match }) => match.test(id));
  if (found) return found.theme;
  return { floor: FALLBACK_FLOORS[Math.floor(random() * FALLBACK_FLOORS.length)] as string, items: ["plant", "shelf", "lamp"], decor: ["poster"] };
}

const FOOTPRINT: Record<string, { w: number; h: number; spot?: [number, number]; solid?: boolean }> = {
  desk: { w: 3, h: 2, spot: [1, 2] }, coffee: { w: 2, h: 1, spot: [0, 1] }, water: { w: 1, h: 1, spot: [0, 1] }, sofa: { w: 3, h: 1, spot: [1, 1] },
  plant: { w: 1, h: 1 }, fern: { w: 1, h: 1 }, board: { w: 4, h: 1, spot: [1, 1] }, whiteboard: { w: 3, h: 1, spot: [1, 1] }, shelf: { w: 2, h: 1, spot: [0, 1] },
  server: { w: 1, h: 1 }, table: { w: 3, h: 2, spot: [1, 2] }, rug: { w: 4, h: 3, solid: false }, printer: { w: 1, h: 1, spot: [0, 1] }, lamp: { w: 1, h: 1 },
  beanbag: { w: 1, h: 1, spot: [0, 1] }, vending: { w: 1, h: 1, spot: [0, 1] }, fridge: { w: 1, h: 1, spot: [0, 1] }, arcade: { w: 1, h: 1, spot: [0, 1] },
};

/** Room size follows the folder: slow growth, so a huge folder doesn't swallow the map. */
function targetSize(id: string, files: number, seed: string): { w: number; h: number } {
  const scale = Math.log2(Math.max(files, 1) + 1);
  const random = rng(`${seed}:size:${id}`);
  return {
    w: Math.min(14, Math.max(7, Math.round(6 + scale * 0.9 + random() * 2))),
    h: Math.min(9, Math.max(5, Math.round(4 + scale * 0.55 + random() * 2))),
  };
}

const deskCount = (files: number): number => Math.min(9, Math.max(1, Math.round(Math.log2(files + 1) - 1)));

// --- Geometry -------------------------------------------------------------------------------------------

type Box = { x: number; y: number; w: number; h: number };

/** Rooms need a wall between them: one tile, which is what a door sits in. */
const clashes = (a: Box, b: Box): boolean => a.x < b.x + b.w + 1 && b.x < a.x + a.w + 1 && a.y < b.y + b.h + 1 && b.y < a.y + a.h + 1;

function bounds(rooms: Box[]): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Math.min(...rooms.map((r) => r.x)),
    minY: Math.min(...rooms.map((r) => r.y)),
    maxX: Math.max(...rooms.map((r) => r.x + r.w)),
    maxY: Math.max(...rooms.map((r) => r.y + r.h)),
  };
}

// Margins around the building: walls, plus space above for the top wall's face and the score.
const MARGIN_X = 2;
const MARGIN_TOP = 3;
const MARGIN_BOTTOM = 2;

const fits = (rooms: Box[]): boolean => {
  const b = bounds(rooms);
  return b.maxX - b.minX + MARGIN_X * 2 <= MAX_COLS && b.maxY - b.minY + MARGIN_TOP + MARGIN_BOTTOM <= MAX_ROWS;
};

/** Find a spot against an existing room, with a door between them. */
function attach(
  size: { w: number; h: number },
  rooms: MapRoom[],
  prefer: MapRoom[],
  random: () => number,
): { box: Box; door: MapDoor; host: MapRoom } | undefined {
  const center = (() => {
    const b = bounds(rooms);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  })();
  let best: { box: Box; door: MapDoor; host: MapRoom; score: number } | undefined;
  // A door can't be cut into a room edited by hand: its furniture may be in the way.
  for (const host of rooms.filter((room) => !room.locked)) {
    const near = prefer.includes(host) ? -8 : 0;
    const consider = (box: Box, door: MapDoor): void => {
      if (rooms.some((room) => clashes(box, room))) return;
      if (!fits([...rooms, box])) return;
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const score = Math.abs(cx - center.x) * 0.7 + Math.abs(cy - center.y) * 1.2 + near + random() * 7;
      if (!best || score < best.score) best = { box, door, host, score };
    };
    for (let offset = -size.h + 3; offset <= host.h - 3; offset++) {
      const y = host.y + offset;
      const low = Math.max(y, host.y) + 1;
      const high = Math.min(y + size.h, host.y + host.h) - 2;
      if (low > high) continue;
      const doorY = low + Math.floor(random() * (high - low + 1));
      consider({ x: host.x + host.w + 1, y, w: size.w, h: size.h }, { x: host.x + host.w, y: doorY });
      consider({ x: host.x - size.w - 1, y, w: size.w, h: size.h }, { x: host.x - 1, y: doorY });
    }
    for (let offset = -size.w + 3; offset <= host.w - 3; offset++) {
      const x = host.x + offset;
      const low = Math.max(x, host.x) + 1;
      const high = Math.min(x + size.w, host.x + host.w) - 2;
      if (low > high) continue;
      const doorX = low + Math.floor(random() * (high - low + 1));
      consider({ x, y: host.y + host.h + 1, w: size.w, h: size.h }, { x: doorX, y: host.y + host.h });
      consider({ x, y: host.y - size.h - 1, w: size.w, h: size.h }, { x: doorX, y: host.y - 1 });
    }
  }
  return best && { box: best.box, door: best.door, host: best.host };
}

/** A door opens into a room only along a side of it, not at a corner. */
const touches = (room: Box, door: MapDoor): boolean =>
  ((door.x === room.x - 1 || door.x === room.x + room.w) && door.y >= room.y && door.y < room.y + room.h) ||
  ((door.y === room.y - 1 || door.y === room.y + room.h) && door.x >= room.x && door.x < room.x + room.w);

function reachable(rooms: Box[], doors: MapDoor[], from: Box): Set<Box> {
  const seen = new Set<Box>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const room = queue.pop() as Box;
    for (const door of doors) {
      if (!touches(room, door)) continue;
      for (const other of rooms) {
        if (!seen.has(other) && touches(other, door)) {
          seen.add(other);
          queue.push(other);
        }
      }
    }
  }
  return seen;
}

// --- Furnishing ------------------------------------------------------------------------------------------

function furnish(room: MapRoom, doors: MapDoor[], seed: string): MapItem[] {
  const random = rng(`${seed}:furnish:${room.id}:${room.w}x${room.h}`);
  const blocked = new Set<string>();
  const reserved = new Set<string>();
  const key = (x: number, y: number): string => `${x},${y}`;
  const inside = (x: number, y: number): boolean => x >= room.x && y >= room.y && x < room.x + room.w && y < room.y + room.h;

  // Keep the way in clear.
  for (const door of doors) {
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      if (inside(door.x + dx, door.y + dy)) reserved.add(key(door.x + dx, door.y + dy));
    }
  }

  const connected = (): boolean => {
    const open: string[] = [];
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) if (!blocked.has(key(x, y))) open.push(key(x, y));
    if (open.length === 0) return false;
    const seen = new Set<string>([open[0] as string]);
    const queue = [open[0] as string];
    while (queue.length > 0) {
      const [x, y] = (queue.pop() as string).split(",").map(Number) as [number, number];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const next = key(x + dx, y + dy);
        if (inside(x + dx, y + dy) && !blocked.has(next) && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return seen.size === open.length;
  };

  const items: MapItem[] = [];
  const place = (type: string, x: number, y: number): boolean => {
    const spec = FOOTPRINT[type];
    if (!spec) return false;
    const cells: string[] = [];
    for (let dy = 0; dy < spec.h; dy++) {
      for (let dx = 0; dx < spec.w; dx++) {
        const cell = key(x + dx, y + dy);
        if (!inside(x + dx, y + dy) || reserved.has(cell) || blocked.has(cell)) return false;
        cells.push(cell);
      }
    }
    if (spec.spot && (!inside(x + spec.spot[0], y + spec.spot[1]) || blocked.has(key(x + spec.spot[0], y + spec.spot[1])))) return false;
    if (spec.solid !== false) {
      for (const cell of cells) blocked.add(cell);
      if (!connected()) {
        for (const cell of cells) blocked.delete(cell);
        return false;
      }
      if (spec.spot) reserved.add(key(x + spec.spot[0], y + spec.spot[1]));
    }
    items.push({ type, x, y, room: room.id });
    return true;
  };
  const scatter = (type: string, tries = 24): boolean => {
    const spec = FOOTPRINT[type];
    if (!spec) return false;
    for (let i = 0; i < tries; i++) {
      const x = room.x + Math.floor(random() * Math.max(1, room.w - spec.w + 1));
      const y = room.y + Math.floor(random() * Math.max(1, room.h - spec.h + 1));
      if (place(type, x, y)) return true;
    }
    return false;
  };
  const wallItem = (type: string): void => {
    for (let i = 0; i < 8; i++) {
      const x = room.x + Math.floor(random() * room.w);
      const y = room.y - 1;
      if (x % 4 === 3 || doors.some((d) => d.x === x && d.y === y) || items.some((it) => it.x === x && it.y === y)) continue;
      items.push({ type, x, y, room: room.id });
      return;
    }
  };

  if (room.role === "lobby") {
    place("rug", room.x + Math.max(0, (room.w - 4) >> 1), room.y + Math.max(0, (room.h - 3) >> 1));
    scatter("plant"); scatter("fern"); scatter("lamp"); wallItem("clock"); wallItem("poster");
    return items;
  }
  if (room.role === "lounge") {
    scatter("coffee"); scatter("water"); scatter("sofa"); scatter("fridge"); scatter("plant"); scatter("beanbag"); scatter("lamp"); wallItem("poster");
    return items;
  }
  if (room.role === "quests") {
    if (!place("board", room.x + 1, room.y)) scatter("board");
    scatter("table"); scatter("whiteboard"); scatter("plant"); wallItem("clock");
    return items;
  }
  if (room.role === "vacant") {
    scatter("plant"); scatter("shelf");
    return items;
  }

  const theme = themeFor(room.id, random);
  let placed = 0;
  const wanted = deskCount(room.files ?? 1);
  const stepX = 4 + (random() < 0.3 ? 1 : 0);
  for (let y = room.y + 1; y + 2 < room.y + room.h && placed < wanted; y += 4) {
    for (let x = room.x + 1; x + 2 < room.x + room.w && placed < wanted; x += stepX) {
      if (place("desk", x, y)) placed += 1;
    }
  }
  for (let i = placed; i < wanted; i++) if (scatter("desk")) placed += 1;
  for (const type of theme.items) scatter(type);
  if (room.w * room.h > 70) scatter(random() < 0.5 ? "plant" : "fern");
  for (const type of theme.decor) wallItem(type);
  return items;
}

// --- Growing ---------------------------------------------------------------------------------------------

function normalize(map: OfficeMap): void {
  if (map.rooms.length === 0) return;
  const b = bounds(map.rooms);
  const dx = MARGIN_X - b.minX;
  const dy = MARGIN_TOP - b.minY;
  for (const room of map.rooms) { room.x += dx; room.y += dy; }
  for (const door of map.doors) { door.x += dx; door.y += dy; }
  for (const item of map.furniture) { item.x += dx; item.y += dy; }
  map.cols = Math.min(MAX_COLS, b.maxX - b.minX + MARGIN_X * 2);
  map.rows = Math.min(MAX_ROWS, b.maxY - b.minY + MARGIN_TOP + MARGIN_BOTTOM);
}

/**
 * The map after the project's latest changes, or a new one. Returns what changed in words.
 * Pure: the same map, scan and seed always give the same result.
 */
export function evolveMap(previous: OfficeMap | undefined, scan: ProjectScan, seed: string, now = new Date().toISOString()): { map: OfficeMap; changes: string[] } {
  const map: OfficeMap = previous
    ? (JSON.parse(JSON.stringify(previous)) as OfficeMap)
    : { version: 1, seed, evolve: true, cols: 0, rows: 0, rooms: [], doors: [], furniture: [], log: [] };
  const changes: string[] = [];
  const touched = new Set<string>();

  if (!previous) {
    const lobby: MapRoom = { id: "lobby", name: "Lobby", x: 0, y: 0, w: 9, h: 6, floor: "stone", paths: [""], role: "lobby" };
    map.rooms.push(lobby);
    touched.add(lobby.id);
    for (const special of [{ id: "lounge", name: "Lounge", role: "lounge", floor: "carpet", w: 10, h: 6 }, { id: "quests", name: "Quests", role: "quests", floor: "tile", w: 9, h: 6 }] as const) {
      const spot = attach(special, map.rooms, [lobby], rng(`${map.seed}:place:${special.id}`));
      if (!spot) continue;
      map.rooms.push({ id: special.id, name: special.name, role: special.role, floor: special.floor, paths: [], ...spot.box });
      map.doors.push(spot.door);
      touched.add(special.id);
      touched.add(spot.host.id);
    }
  }

  const wanted = new Map(scan.areas.map((area) => [area.id, area]));

  // Folders that have gone. A room others walk through stays, as an empty corridor.
  for (const room of [...map.rooms]) {
    if (room.role || room.locked || wanted.has(room.id)) continue;
    const others = map.rooms.filter((candidate) => candidate !== room);
    const keptDoors = map.doors.filter((door) => others.filter((other) => touches(other, door)).length >= 2);
    const start = others[0];
    const stillJoined = start ? reachable(others, keptDoors, start).size === others.length : true;
    if (stillJoined) {
      map.rooms = others;
      map.doors = keptDoors;
      map.furniture = map.furniture.filter((item) => item.room !== room.id);
      changes.push(`${room.name} closed: its folder has gone`);
    } else {
      changes.push(`${room.name} is now empty: its folder has gone, and it stays as a way through`);
      room.role = "vacant";
      room.paths = [];
      room.name = `Old ${room.name}`.slice(0, 18);
      touched.add(room.id);
    }
  }

  // Folders that exist: update those we know, and add new ones. Biggest first, so if the map
  // ever runs out of space, it's the smallest folders that share the lobby.
  const ordered = scan.areas.slice().sort((a, b) => b.files - a.files || hashText(`${map.seed}:${a.id}`) - hashText(`${map.seed}:${b.id}`));
  for (const area of ordered) {
    const room = map.rooms.find((candidate) => candidate.id === area.id);
    if (room) {
      if (room.locked) continue;
      const beforeDesks = deskCount(room.files ?? 1);
      room.files = area.files;
      const target = targetSize(room.id, area.files, map.seed);
      const others = map.rooms.filter((candidate) => candidate !== room);
      const doorStaysOutside = (box: Box): boolean => map.doors.every((door) => !(door.x >= box.x && door.x < box.x + box.w && door.y >= box.y && door.y < box.y + box.h));
      let grew = false;
      for (const change of [{ w: target.w, h: room.h }, { w: room.w, h: target.h }] as const) {
        if (change.w <= room.w && change.h <= room.h) continue;
        const box = { x: room.x, y: room.y, w: Math.max(room.w, change.w), h: Math.max(room.h, change.h) };
        if (!others.some((other) => clashes(box, other)) && doorStaysOutside(box) && fits([...others, box])) {
          room.w = box.w;
          room.h = box.h;
          grew = true;
        }
      }
      if (grew) {
        touched.add(room.id);
        changes.push(`${room.name} grew`);
      }
      if (deskCount(area.files) !== beforeDesks) touched.add(room.id);
      continue;
    }
    const parent = area.path.split("/").slice(0, -2).join("/");
    const family = map.rooms.filter((candidate) => candidate.paths.some((p) => parent && p.startsWith(`${parent}/`)));
    const wantedSize = targetSize(area.id, area.files, map.seed);
    const spot = attach(wantedSize, map.rooms, family, rng(`${map.seed}:place:${area.id}`))
      ?? attach({ w: 7, h: 5 }, map.rooms, family, rng(`${map.seed}:place:${area.id}`));
    if (!spot) continue; // the map is full; this folder's agents use the lobby
    const random = rng(`${map.seed}:theme:${area.id}`);
    map.rooms.push({ id: area.id, name: area.name, floor: themeFor(area.id, random).floor, paths: [area.path], files: area.files, ...spot.box });
    map.doors.push(spot.door);
    touched.add(area.id);
    touched.add(spot.host.id);
    if (previous) changes.push(`New room: ${area.name}`);
  }

  // A new door or a bigger room can change what fits, so those rooms are furnished again.
  for (const id of touched) {
    const room = map.rooms.find((candidate) => candidate.id === id);
    if (!room || room.locked) continue;
    map.furniture = map.furniture.filter((item) => item.room !== id);
    map.furniture.push(...furnish(room, map.doors, map.seed));
  }

  normalize(map);
  if (changes.length > 0) map.log = [...map.log, ...changes.map((text) => ({ at: now, text }))].slice(-30);
  return { map, changes };
}

/** The room a project file belongs to: the longest matching folder. */
export function roomForPath(rooms: { id: string; paths?: string[] }[], relative: string): string | undefined {
  const file = relative.split("\\").join("/").replace(/^\.\//, "");
  let best: string | undefined;
  let bestLength = -1;
  for (const room of rooms) {
    for (const prefix of room.paths ?? []) {
      if (prefix && file.startsWith(prefix) && prefix.length > bestLength) {
        best = room.id;
        bestLength = prefix.length;
      }
    }
  }
  return best;
}
