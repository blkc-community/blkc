/**
 * BLKC Mapgen. Grows a building from a project. Every project gets its own map: the seed comes from its
 * name, and the rooms from its folders. The map evolves rather than regenerates: rooms that
 * exist stay where they are, new folders add rooms, bigger folders get bigger rooms, and a
 * room someone has edited by hand is never touched again.
 *
 * Folder names, file counts and project manifests (package.json, pnpm-workspace.yaml) are read
 * here, never source code.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { OFFICE_PLAN, worldPlan, type RoomRole, type Theme, type WorldPlan } from "./plan.js";

export * from "./plan.js";

export interface MapRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floor: string;
  paths: string[];
  /** lobby, lounge and quests are always there. hall is a corridor. vacant is an empty room, free for the next folder. */
  role?: RoomRole;
  /** Edited by hand: the generator leaves it alone. */
  locked?: boolean;
  files?: number;
}
export interface MapItem { type: string; x: number; y: number; room?: string }
export interface MapDoor { x: number; y: number }
export interface OfficeMap {
  version: 1;
  /** Which world this map is for. The office if left out. */
  world?: string;
  /** halls: rooms in even rows along corridors. Left out on older maps, whose rooms were placed one against another. */
  layout?: "halls";
  /** How tall the rooms are in the first pair of rows. */
  roomHeight?: number;
  seed: string;
  /** Follow the project as it changes. */
  evolve: boolean;
  cols: number;
  rows: number;
  rooms: MapRoom[];
  doors: MapDoor[];
  furniture: MapItem[];
  log: { at: string; text: string }[];
  /** Which rooms depend on which, and whether a door joins them. */
  links?: MapLink[];
}
export interface MapLink { from: string; to: string; door: boolean }

/** A map, for any world. */
export type WorldMap = OfficeMap;

export interface ProjectArea {
  id: string;
  name: string;
  path: string;
  files: number;
  /** How many other areas depend on this one. */
  dependents?: number;
  /** The folder path it sits on, such as "apps/". */
  street?: string;
}

/** How to read a project. This is the part of a Kit's world.json the scan needs. */
export interface ScanOptions {
  /** File names that mark a folder as an application, such as "go.mod" or "*.xydsf". */
  markers?: string[];
  /** Use only `markers`, not the built-in ones as well. */
  replaceDefaults?: boolean;
  /** Folders that get a building even with no marker. */
  include?: string[];
  /** Folders that never get a building: a name, or a path from the top. */
  ignore?: string[];
}

/** What marks a folder as an application, out of the box. */
export const DEFAULT_APP_MARKERS = ["package.json", "pyproject.toml", "setup.py", "requirements.txt", "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts", "Gemfile", "composer.json", "mix.exs", "deno.json", "pubspec.yaml", "Package.swift", "CMakeLists.txt", "*.csproj", "*.sln"];
export interface ProjectScan {
  areas: ProjectArea[];
  rootFiles: number;
  /** `from` depends on `to`. */
  links?: { from: string; to: string }[];
  /** Folders that didn't make the map. */
  omitted?: number;
}

const MAX_COLS = 64;
const MAX_ROWS = 40;
const MAX_AREAS = 20;
/** Past these many rooms, they stay small so that more of the project fits. */
const COMPACT_ABOVE = 10;
const TIGHT_ABOVE = 14;
const MAX_ENTRIES = 200000;
/** One huge folder can't use up the scan and leave the rest uncounted. */
const MAX_ENTRIES_PER_AREA = 20000;
/** How deep to look for applications. */
const MAX_APP_DEPTH = 5;

const markerMatcher = (marker: string): RegExp =>
  new RegExp(`^${marker.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
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

/** The plain folder names in a .gitignore. Patterns with wildcards aren't followed. */
export function gitignoredNames(root: string): Set<string> {
  const names = new Set<string>();
  try {
    for (const line of readFileSync(path.join(root, ".gitignore"), "utf8").split("\n")) {
      const name = line.trim().replace(/^\//, "").replace(/\/$/, "");
      if (name && !/[*!#/\s]/.test(name)) names.add(name);
    }
  } catch {
    // no .gitignore
  }
  return names;
}

/** A folder with its own .git is another project, even if it sits inside this one. */
export const isOwnRepo = (dir: string): boolean => existsSync(path.join(dir, ".git"));

type Json = Record<string, unknown>;

const readPackage = (dir: string): Json | undefined => {
  try {
    return JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as Json;
  } catch {
    return undefined;
  }
};

/** Top-level folders a workspace config says hold packages, such as tools from "tools/*". */
function workspaceFolders(root: string): string[] {
  const globs: string[] = [];
  const workspaces = readPackage(root)?.["workspaces"];
  const listed = Array.isArray(workspaces) ? workspaces : (workspaces as Json | undefined)?.["packages"];
  if (Array.isArray(listed)) globs.push(...listed.filter((item): item is string => typeof item === "string"));
  try {
    for (const line of readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8").split("\n")) {
      const match = /^\s*-\s*['"]?([^'"#\s]+)/.exec(line);
      if (match?.[1]) globs.push(match[1]);
    }
  } catch {
    // not pnpm
  }
  return globs.flatMap((glob) => /^[^/!*]+\/\*{1,2}$/.test(glob) ? [glob.split("/")[0] as string] : []);
}

/** Who depends on whom, from each area's package.json. */
function findLinks(root: string, areas: ProjectArea[]): { from: string; to: string }[] {
  const owners = new Map<string, string>();
  const manifests = new Map<string, Json>();
  for (const area of areas) {
    const manifest = readPackage(path.join(root, area.path));
    if (!manifest) continue;
    manifests.set(area.id, manifest);
    if (typeof manifest["name"] === "string") owners.set(manifest["name"], area.id);
  }
  const links: { from: string; to: string }[] = [];
  for (const [from, manifest] of manifests) {
    const seen = new Set<string>();
    for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
      for (const name of Object.keys((manifest[field] ?? {}) as Json)) {
        const to = owners.get(name);
        if (to && to !== from && !seen.has(to)) {
          seen.add(to);
          links.push({ from, to });
        }
      }
    }
  }
  return links;
}

/** Folder names, file counts and how the folders depend on each other. */
export function scanProject(root: string, options: ScanOptions = {}): ProjectScan {
  const ignored = new Set([...IGNORE, ...gitignoredNames(root)]);
  const clean = (value: string): string => value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  const skipped = new Set((options.ignore ?? []).map(clean));
  const isSkipped = (rel: string): boolean => skipped.has(rel) || skipped.has(path.posix.basename(rel));

  // What git tracks is the truth. Build output on disk isn't part of the project.
  let tracked: string[] | undefined;
  try {
    tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).split("\0").filter(Boolean);
  } catch {
    // not a git repo, so the folders are all there is
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
        const child = path.join(dir, entry.name);
        if (!ignored.has(entry.name) && !entry.name.startsWith(".") && !isOwnRepo(child)) files += countFiles(child, depth + 1);
      } else if (entry.isFile()) {
        files += 1;
      }
    }
    return files;
  };
  const subdirs = (dir: string): string[] => {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !ignored.has(entry.name) && (!entry.name.startsWith(".") || entry.name === ".github") && !isOwnRepo(path.join(dir, entry.name)))
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  };

  const markers = [...(options.replaceDefaults ? [] : DEFAULT_APP_MARKERS), ...(options.markers ?? [])].map(markerMatcher);
  const isApp = (dir: string): boolean => {
    try {
      return readdirSync(dir, { withFileTypes: true }).some((entry) => entry.isFile() && markers.some((marker) => marker.test(entry.name)));
    } catch {
      return false;
    }
  };
  const below = (rel: string): string[] => subdirs(path.join(root, rel)).map((name) => (rel ? `${rel}/${name}` : name)).filter((child) => !isSkipped(child));

  // An application is a building. A folder holding applications is a street. Everything else doesn't count.
  const apps: string[] = [];
  const findApps = (rel: string, depth: number): void => {
    for (const child of below(rel)) {
      if (isApp(path.join(root, child))) apps.push(child);
      else if (depth < MAX_APP_DEPTH) findApps(child, depth + 1);
    }
  };
  findApps("", 1);
  const included = (options.include ?? []).map(clean).filter((rel) => !apps.includes(rel) && existsSync(path.join(root, rel)));

  const containers = new Set([...CONTAINERS, ...workspaceFolders(root)]);
  const areas: ProjectArea[] = [];
  let remaining = MAX_ENTRIES;
  const add = (rel: string, street?: string): void => {
    let files = tracked ? tracked.filter((file) => file.startsWith(`${rel}/`)).length : 0;
    if (files === 0) {
      // New and not committed yet.
      budget = Math.min(MAX_ENTRIES_PER_AREA, remaining);
      const before = budget;
      files = countFiles(path.join(root, rel), 0);
      remaining -= before - Math.max(budget, 0);
    }
    if (files > 0) areas.push({ id: slug(rel), name: titled(path.basename(rel)), path: `${rel}/`, files, ...(street === undefined ? {} : { street }) });
  };
  const readsAsOneApp = apps.length + included.length <= 1 && (isApp(root) || apps.length === 0);
  const insideOneApp = apps.length === 1 && included.length === 0 && !isApp(root);
  if (readsAsOneApp || insideOneApp) {
    // One application: its own folders are the rooms.
    const base = insideOneApp ? (apps[0] as string) : "";
    for (const rel of below(base)) {
      const name = path.posix.basename(rel);
      const children = containers.has(name) ? below(rel) : [];
      // One package in packages/ is still a package, but one folder in src/ is just a folder.
      const open = children.length >= 2 || children.some((child) => readPackage(path.join(root, child)));
      if (open) for (const child of children) add(child);
      else add(rel);
    }
    for (const rel of included) add(rel);
  } else {
    for (const rel of [...apps, ...included]) {
      const parent = path.posix.dirname(rel);
      add(rel, parent === "." ? "" : `${parent}/`);
    }
  }
  let rootFiles = 0;
  try {
    rootFiles = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile()).length;
  } catch {
    // leave it at 0
  }

  // Code that's linked to other code comes first, and a package many use before a big folder few do.
  const links = findLinks(root, areas);
  const linked = new Set(links.flatMap((link) => [link.from, link.to]));
  for (const area of areas) {
    const dependents = links.filter((link) => link.to === area.id).length;
    if (dependents > 0) area.dependents = dependents;
  }
  const score = (area: ProjectArea): number => Math.log2(area.files + 1) + (area.dependents ?? 0) * 2 + (linked.has(area.id) ? 20 : 0);
  areas.sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));

  const kept = areas.slice(0, MAX_AREAS);
  const keptIds = new Set(kept.map((area) => area.id));
  return {
    areas: kept,
    rootFiles,
    ...(links.length > 0 ? { links: links.filter((link) => keptIds.has(link.from) && keptIds.has(link.to)) } : {}),
    ...(areas.length > MAX_AREAS ? { omitted: areas.length - MAX_AREAS } : {}),
  };
}

// --- What a folder looks like ---------------------------------------------------------------------------

/** The look comes from a folder's own name, so everything in apps/ doesn't look like a front end. */
function themeFor(folder: string, plan: WorldPlan, random: () => number): Theme {
  const own = folder.replace(/\/$/, "").split("/").pop() ?? folder;
  const found = plan.themes.find(({ match }) => match.test(own));
  if (found) return found.theme;
  const { floors, items, decor } = plan.fallback;
  return { floor: floors[Math.floor(random() * floors.length)] as string, items, decor };
}

/** Room size follows the folder: slow growth, so a huge folder doesn't swallow the map. */
function targetSize(id: string, files: number, seed: string, compact: false | number = false): { w: number; h: number } {
  const scale = Math.log2(Math.max(files, 1) + 1);
  const random = rng(`${seed}:size:${id}`);
  return {
    w: Math.min(compact || 14, Math.max(7, Math.round(6 + scale * 0.9 + random() * 2))),
    h: Math.min(compact ? 6 : 9, Math.max(5, Math.round(4 + scale * 0.55 + random() * 2))),
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
  pull = 8,
): { box: Box; door: MapDoor; host: MapRoom } | undefined {
  const center = (() => {
    const b = bounds(rooms);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  })();
  let best: { box: Box; door: MapDoor; host: MapRoom; score: number } | undefined;
  // A door can't be cut into a room edited by hand: its furniture may be in the way.
  for (const host of rooms.filter((room) => !room.locked)) {
    const near = prefer.includes(host) ? -pull : 0;
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

// --- Floor plans --------------------------------------------------------------------------------------
//
// A building: a corridor with a row of rooms on each side, sharing walls and with one door each.
// When that's as wide as it can be, stairs lead to a second corridor below. Rows are squared off
// with empty rooms, so the outline stays a rectangle, and the next new folder moves into one.

const HALL_H = 2;
const MIN_ROOM_W = 7;
const SPARE_W = 9;
const LOWER_ROOM_H = 6;
/** The widest a corridor's rooms can reach, leaving space for stairs and the margins. */
const MAX_ROW_END = MAX_COLS - MARGIN_X * 2 - 3;

interface HallRow { hall: MapRoom; y: number; h: number; doorY: number; rooms: MapRoom[]; end: number; limit: number; edge?: number }

const corridors = (map: OfficeMap): MapRoom[] =>
  map.rooms.filter((room) => room.role === "hall" && room.id.startsWith("hall-")).sort((a, b) => a.y - b.y);

const stairsOf = (map: OfficeMap): MapRoom | undefined => map.rooms.find((room) => room.id === "stairs");

function hallRows(map: OfficeMap): HallRow[] {
  const rows: HallRow[] = [];
  const stairs = stairsOf(map);
  corridors(map).forEach((hall, band, halls) => {
    const h = band === 0 ? (map.roomHeight ?? LOWER_ROOM_H) : LOWER_ROOM_H;
    for (const [y, doorY, faces] of [[hall.y - 1 - h, hall.y - 1, band], [hall.y + HALL_H + 1, hall.y + HALL_H, band === halls.length - 1 ? 0 : 1]] as const) {
      // Rows between the corridors stop at the stairs. The outer ones run past them, for a straight edge.
      const inner = stairs !== undefined && faces !== 0;
      const edge = stairs ? (inner ? stairs.x - 1 : stairs.x + HALL_H) : undefined;
      const rooms = map.rooms.filter((room) => room.role !== "hall" && room.y === y).sort((a, b) => a.x - b.x);
      const last = rooms[rooms.length - 1];
      rows.push({ hall, y, h, doorY, rooms, end: last ? last.x + last.w + 1 : hall.x, limit: edge ?? MAX_ROW_END, ...(edge === undefined ? {} : { edge }) });
    }
  });
  return rows;
}

const doorInto = (x: number, w: number, y: number, random: () => number): MapDoor =>
  ({ x: x + 1 + Math.floor(random() * Math.max(1, w - 2)), y });

/** Where a new room goes: an empty room, or the end of a row, near what it's linked to. */
function placeInHalls(
  map: OfficeMap,
  id: string,
  width: number,
  related: MapRoom[],
  family: MapRoom[],
  random: () => number,
  street?: string,
): { box: Box; door?: MapDoor; replaces?: MapRoom } | undefined {
  const streetOf = (room: MapRoom): string => {
    const parent = path.posix.dirname((room.paths[0] ?? "").replace(/\/$/, ""));
    return parent === "." ? "" : `${parent}/`;
  };
  const beside = (x: number, w: number, y: number, room: MapRoom): boolean => room.y === y && (room.x + room.w + 1 === x || x + w + 1 === room.x);
  const empty = map.rooms
    .filter((room) => room.role === "vacant" && !room.locked && room.w >= MIN_ROOM_W)
    .map((room) => ({ room, score: Math.abs(room.w - width) - (related.some((other) => beside(room.x, room.w, room.y, other)) ? 20 : 0) - (family.some((other) => other.y === room.y) ? 4 : 0) }))
    .sort((a, b) => a.score - b.score || a.room.x - b.room.x)[0]?.room;
  if (empty) return { box: { x: empty.x, y: empty.y, w: empty.w, h: empty.h }, replaces: empty };

  const stairs = stairsOf(map);
  for (const w of [width, MIN_ROOM_W]) {
    const open = hallRows(map).filter((row) => row.end + w <= row.limit);
    const score = (row: HallRow): number => row.end
      - (related.some((other) => other.y === row.y) ? 20 : 0)
      - (family.some((other) => other.y === row.y) ? 30 : 0)
      // A new street starts its own row, where it can.
      + (street !== undefined && row.rooms.some((other) => !other.role && streetOf(other) !== street) ? 25 : 0)
      + random() * 3;
    const row = open.map((candidate) => ({ candidate, value: score(candidate) })).sort((a, b) => a.value - b.value)[0]?.candidate;
    if (row) return { box: { x: row.end, y: row.y, w, h: row.h }, door: doorInto(row.end, w, row.doorY, random) };
  }

  // This corridor is full. Stairs to a second one below.
  const halls = corridors(map);
  const top = halls[0];
  if (!top || halls.length > 1 || stairs) return undefined;
  const upperHeight = map.roomHeight ?? LOWER_ROOM_H;
  const y = top.y + HALL_H + 1 + upperHeight + 1 + LOWER_ROOM_H + 1;
  const span = bounds(map.rooms.filter((room) => room.role !== "hall"));
  const landing = span.maxX + 1;
  const total = y + HALL_H + 1 + LOWER_ROOM_H - (top.y - 1 - upperHeight);
  if (landing + HALL_H > MAX_COLS - MARGIN_X * 2 || total + MARGIN_TOP + MARGIN_BOTTOM > MAX_ROWS) return undefined;
  map.rooms.push({ id: "stairs", name: "", x: landing, y: top.y + HALL_H + 1, w: HALL_H, h: y - 1 - (top.y + HALL_H + 1), floor: "hall", paths: [], role: "hall" });
  map.rooms.push({ id: "hall-1", name: "", x: top.x, y, w: landing + HALL_H - top.x, h: HALL_H, floor: "hall", paths: [], role: "hall" });
  map.doors.push({ x: landing, y: top.y + HALL_H }, { x: landing, y: y - 1 });
  return placeInHalls(map, id, width, related, family, random, street);
}

/** Corridors reach the end of their rows, and rows fill out to a straight edge with empty rooms. */
function squareUp(map: OfficeMap, seed: string, touched: Set<string>): void {
  const stairs = stairsOf(map);
  const rows = hallRows(map);
  const widest = Math.max(...rows.map((row) => row.end - 1), corridors(map)[0]?.x ?? 0);
  for (const row of rows) {
    let gap = (row.edge ?? widest) - row.end;
    if (gap <= 0) continue;
    const last = row.rooms[row.rooms.length - 1];
    if (gap < MIN_ROOM_W + 1 && last && !last.locked && row.rooms.length > 0) {
      last.w += gap + 1;
      touched.add(last.id);
      continue;
    }
    let x = row.end;
    while (gap >= MIN_ROOM_W) {
      const w = gap - SPARE_W - 1 >= MIN_ROOM_W ? SPARE_W : gap;
      let n = 1;
      while (map.rooms.some((room) => room.id === `spare-${n}`)) n += 1;
      const id = `spare-${n}`;
      map.rooms.push({ id, name: "Empty", x, y: row.y, w, h: row.h, floor: "concrete", paths: [], role: "vacant" });
      map.doors.push(doorInto(x, w, row.doorY, rng(`${seed}:door:${id}`)));
      touched.add(id);
      x += w + 1;
      gap -= w + 1;
    }
  }
  for (const hall of corridors(map)) {
    const w = (stairs ? stairs.x + HALL_H : widest) - hall.x;
    if (w !== hall.w) {
      hall.w = w;
      touched.add(hall.id);
    }
  }
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

function furnish(room: MapRoom, doors: MapDoor[], seed: string, plan: WorldPlan): MapItem[] {
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
    const spec = plan.footprint[type];
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
    const spec = plan.footprint[type];
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

  if (room.role) {
    for (const step of plan.furnishing[room.role] ?? []) {
      if ("wall" in step) wallItem(step.wall);
      else if ("scatter" in step) scatter(step.scatter);
      else if (step.at === "center") {
        const spec = plan.footprint[step.place];
        if (spec) place(step.place, room.x + Math.max(0, (room.w - spec.w) >> 1), room.y + Math.max(0, (room.h - spec.h) >> 1));
      } else if (!place(step.place, room.x + 1, room.y)) scatter(step.place);
    }
    return items;
  }

  const theme = themeFor(room.paths[0] ?? room.id, plan, random);
  let placed = 0;
  const wanted = deskCount(room.files ?? 1);
  const stepX = 4 + (random() < 0.3 ? 1 : 0);
  for (let y = room.y + 1; y + 2 < room.y + room.h && placed < wanted; y += 4) {
    for (let x = room.x + 1; x + 2 < room.x + room.w && placed < wanted; x += stepX) {
      if (place(plan.workstation, x, y)) placed += 1;
    }
  }
  for (let i = placed; i < wanted; i++) if (scatter(plan.workstation)) placed += 1;
  for (const type of theme.items) scatter(type);
  if (room.w * room.h > 70) scatter(random() < 0.5 ? plan.filler[0] : plan.filler[1]);
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
export function evolveMap(previous: OfficeMap | undefined, scan: ProjectScan, seed: string, now = new Date().toISOString(), newWorld: WorldPlan = OFFICE_PLAN): { map: OfficeMap; changes: string[] } {
  const map: OfficeMap = previous
    ? (JSON.parse(JSON.stringify(previous)) as OfficeMap)
    : { version: 1, ...(newWorld === OFFICE_PLAN ? {} : { world: newWorld.id }), layout: "halls", roomHeight: scan.areas.length > 8 ? LOWER_ROOM_H : LOWER_ROOM_H + 1, seed, evolve: true, cols: 0, rows: 0, rooms: [], doors: [], furniture: [], log: [] };
  // A map stays the world it was made for.
  const plan = previous ? worldPlan(previous.world) : newWorld;
  const changes: string[] = [];
  const touched = new Set<string>();

  if (!previous) {
    if (plan.specials.length === 0) throw new Error(`The ${plan.id} world has no first room.`);
    map.rooms.push({ id: "hall-0", name: "", x: 0, y: 0, w: 1, h: HALL_H, floor: "hall", paths: [], role: "hall" });
    // The first room faces the others across the corridor.
    plan.specials.forEach((special, index) => {
      const rows = hallRows(map);
      const row = rows[index === 0 ? 1 : 0] as HallRow;
      map.rooms.push({ id: special.id, name: special.name, role: special.role, floor: special.floor, paths: index === 0 ? [""] : [], x: row.end, y: row.y, w: special.w, h: row.h });
      map.doors.push(doorInto(row.end, special.w, row.doorY, rng(`${map.seed}:place:${special.id}`)));
      touched.add(special.id);
    });
  }

  const wanted = new Map(scan.areas.map((area) => [area.id, area]));

  // Folders that have gone. A room others walk through stays, as an empty corridor.
  for (const room of [...map.rooms]) {
    if (room.role || room.locked || wanted.has(room.id)) continue;
    const others = map.rooms.filter((candidate) => candidate !== room);
    const keptDoors = map.doors.filter((door) => others.filter((other) => touches(other, door)).length >= 2);
    const start = others[0];
    const stillJoined = start ? reachable(others, keptDoors, start).size === others.length : true;
    // In a floor plan an empty room stays, ready for the next folder.
    if (stillJoined && map.layout !== "halls") {
      map.rooms = others;
      map.doors = keptDoors;
      map.furniture = map.furniture.filter((item) => item.room !== room.id);
      changes.push(`${room.name} closed: its folder has gone, or is no longer one of the main ones`);
    } else {
      changes.push(map.layout === "halls" ? `${room.name} is now empty: its folder has gone, or is no longer one of the main ones` : `${room.name} is now empty: its folder has gone, and it stays as a way through`);
      room.role = "vacant";
      room.paths = [];
      room.name = `Old ${room.name}`.slice(0, 18);
      touched.add(room.id);
    }
  }

  // Folders that exist: update those we know, and add new ones. Biggest first, so if the map
  // ever runs out of space, it's the smallest folders that share the lobby.
  const compact = scan.areas.length > TIGHT_ABOVE ? 8 : scan.areas.length > COMPACT_ABOVE ? 10 : false;
  const links = scan.links ?? [];
  const isLinked = (area: ProjectArea): number => links.some((link) => link.from === area.id || link.to === area.id) ? 1 : 0;
  // Linked rooms go first, while there's still space beside what they depend on.
  const ordered = scan.areas.slice().sort((a, b) => isLinked(b) - isLinked(a) || (b.dependents ?? 0) - (a.dependents ?? 0) || b.files - a.files || hashText(`${map.seed}:${a.id}`) - hashText(`${map.seed}:${b.id}`));
  for (const area of ordered) {
    const room = map.rooms.find((candidate) => candidate.id === area.id);
    if (room) {
      if (room.locked) continue;
      if (room.role === "vacant") {
        room.role = undefined;
        room.name = area.name;
        room.paths = [area.path];
        touched.add(room.id);
        changes.push(`${room.name} is back`);
      }
      const beforeDesks = deskCount(room.files ?? 1);
      room.files = area.files;
      const target = targetSize(room.id, area.files, map.seed, compact);
      const others = map.rooms.filter((candidate) => candidate !== room);
      const doorStaysOutside = (box: Box): boolean => map.doors.every((door) => !(door.x >= box.x && door.x < box.x + box.w && door.y >= box.y && door.y < box.y + box.h));
      let grew = false;
      // Rows keep one height, so a room in a floor plan only grows along its row.
      for (const change of map.layout === "halls" ? [{ w: target.w, h: room.h }] : [{ w: target.w, h: room.h }, { w: room.w, h: target.h }] as const) {
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
    const wantedSize = targetSize(area.id, area.files, map.seed, compact);
    // A room goes beside what it depends on, if there's space, so a door there means something.
    const partners = links.flatMap((link) => link.from === area.id ? [link.to] : link.to === area.id ? [link.from] : []);
    const related = map.rooms.filter((candidate) => partners.includes(candidate.id));
    const prefer = related.length > 0 ? related : family;
    const pull = related.length > 0 ? 40 : 8;
    if (map.layout === "halls") {
      const spot = placeInHalls(map, area.id, wantedSize.w, related, family, rng(`${map.seed}:place:${area.id}`), area.street);
      if (!spot) continue; // the building is full; this folder's agents use the lobby
      if (spot.replaces) {
        const old = spot.replaces.id;
        map.rooms = map.rooms.filter((candidate) => candidate !== spot.replaces);
        map.furniture = map.furniture.filter((item) => item.room !== old);
      }
      if (spot.door) map.doors.push(spot.door);
      const random = rng(`${map.seed}:theme:${area.id}`);
      const added: MapRoom = { id: area.id, name: area.name, floor: themeFor(area.path, plan, random).floor, paths: [area.path], files: area.files, ...spot.box };
      map.rooms.push(added);
      touched.add(area.id);
      // A door straight through to a neighbour it depends on.
      for (const other of related) {
        const wall = other.y !== added.y ? undefined : other.x + other.w + 1 === added.x ? added.x - 1 : added.x + added.w + 1 === other.x ? added.x + added.w : undefined;
        if (wall === undefined || other.locked) continue;
        map.doors.push({ x: wall, y: added.y + (added.h >> 1) });
        touched.add(other.id);
      }
      if (previous) changes.push(`New room: ${area.name}`);
      continue;
    }
    const spot = attach(wantedSize, map.rooms, prefer, rng(`${map.seed}:place:${area.id}`), pull)
      ?? attach({ w: 7, h: 5 }, map.rooms, prefer, rng(`${map.seed}:place:${area.id}`), pull);
    if (!spot) continue; // the map is full; this folder's agents use the lobby
    const random = rng(`${map.seed}:theme:${area.id}`);
    map.rooms.push({ id: area.id, name: area.name, floor: themeFor(area.path, plan, random).floor, paths: [area.path], files: area.files, ...spot.box });
    map.doors.push(spot.door);
    touched.add(area.id);
    touched.add(spot.host.id);
    if (previous) changes.push(`New room: ${area.name}`);
  }

  if (map.layout === "halls") {
    squareUp(map, map.seed, touched);
    // A corridor is named for the literal paths along it.
    const streetFor = new Map(scan.areas.map((area) => [area.id, area.street]));
    for (const hall of corridors(map)) {
      const streets = new Set<string>();
      for (const row of hallRows(map).filter((candidate) => candidate.hall === hall)) {
        for (const room of row.rooms) {
          const street = streetFor.get(room.id);
          if (street) streets.add(street);
        }
      }
      hall.paths = [...streets];
      hall.name = hall.paths.join(" + ").slice(0, 24);
    }
  }

  // A new door or a bigger room can change what fits, so those rooms are furnished again.
  for (const id of touched) {
    const room = map.rooms.find((candidate) => candidate.id === id);
    if (!room || room.locked) continue;
    map.furniture = map.furniture.filter((item) => item.room !== id);
    map.furniture.push(...furnish(room, map.doors, map.seed, plan));
  }

  const onMap = (id: string): MapRoom | undefined => map.rooms.find((room) => room.id === id);
  const mapped = links.flatMap((link) => {
    const from = onMap(link.from);
    const to = onMap(link.to);
    return from && to ? [{ ...link, door: map.doors.some((door) => touches(from, door) && touches(to, door)) }] : [];
  });
  if (mapped.length > 0) map.links = mapped;
  else delete map.links;

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
