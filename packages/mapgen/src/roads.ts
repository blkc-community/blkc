/**
 * A map that grows from the project tree, with no size limit. Each road is sized from what's
 * on it, and its parent road makes room. Buildings are as big as their contents need and
 * never shrink. Once placed, nothing moves: a new folder takes a spare lot on its road, or
 * a new stretch of road at the edge of the map.
 */

import { deskCount, furnish, rng, slug, themeFor, titled, type MapDoor, type MapItem, type MapRoom, type OfficeMap } from "./index.js";
import { OFFICE_PLAN, worldPlan, type WorldPlan } from "./plan.js";
import type { ProjectTree, TreeNode } from "./tree.js";

const ROAD_H = 2;
const CELL = 4;
const SPARE = { w: 9, h: 6 };
const PILE_STEP = 8;
const MARGIN = 2;
const MARGIN_TOP = 3;

interface Placed { room: MapRoom; node?: TreeNode; side?: "n" | "s" }
interface Block { w: number; h: number; rooms: Placed[]; doors: MapDoor[] }
interface Lot { w: number; h: number; key: string; room?: () => MapRoom; node?: TreeNode; block?: Block }

const road = (id: string, name: string, x: number, y: number, w: number, h: number, paths: string[]): MapRoom =>
  ({ id, name, x, y, w, h, floor: "hall", paths, role: "hall" });

const leadsToBuilding = (node: TreeNode): boolean =>
  node.children.some((child) => child.kind === "building" || (child.kind === "road" && leadsToBuilding(child)));

/**
 * Only a road that leads to an application is drawn. Other folders fold into a Folders group
 * on their parent's road, so tooling and notes can't crowd out the project.
 */
function foldFolders(node: TreeNode): TreeNode {
  const folded = node.children.filter((child) => child.kind === "road" && !leadsToBuilding(child));
  const kept = node.children.filter((child) => !folded.includes(child)).map((child) => (child.kind === "road" ? foldFolders(child) : child));
  return {
    ...node,
    children: folded.length > 0 ? [...kept, { id: `group:${node.path}:Folders`, kind: "group", name: "Folders", path: node.path, children: folded }] : kept,
  };
}

/** A project that is one application has its own folders as buildings. */
function asRoads(tree: ProjectTree): TreeNode {
  if (tree.root.kind === "road") return foldFolders(tree.root);
  return {
    ...tree.root,
    id: "road:",
    kind: "road",
    name: "/",
    children: tree.root.children.map((child) => (child.kind === "part" ? { ...child, id: `building:${child.path}`, kind: "building" as const, children: [] } : child)),
  };
}

const partsIn = (node: TreeNode): TreeNode[] => node.children.filter((child) => child.kind === "part");

/** Big enough for every part, in cells an agent can walk between. */
function buildingSize(node: TreeNode): { w: number; h: number } {
  const parts = partsIn(node).length || deskCount(node.files ?? 1);
  const across = Math.ceil(Math.sqrt(parts * 1.4));
  const down = Math.ceil(parts / across);
  return { w: Math.max(9, across * CELL + 1), h: Math.max(6, down * CELL + 1) };
}

/** One item for each real part, all reachable: every cell has a free row and column around it. */
function fillBuilding(room: MapRoom, node: TreeNode, plan: WorldPlan): MapItem[] {
  const across = Math.max(1, Math.floor((room.w - 1) / CELL));
  const down = Math.max(1, Math.floor((room.h - 1) / CELL));
  const parts = partsIn(node);
  const entries = parts.length > 0
    ? parts.map((part) => ({ type: plan.partItems?.[part.item ?? ""] ?? plan.workstation, part: part.path }))
    : Array.from({ length: deskCount(node.files ?? 1) }, () => ({ type: plan.workstation, part: node.path }));
  return entries.slice(0, across * down).map((entry, index) => ({
    type: entry.type,
    x: room.x + 1 + (index % across) * CELL,
    y: room.y + 1 + Math.floor(index / across) * CELL,
    room: room.id,
    part: entry.part,
  }));
}

function buildBlock(node: TreeNode, seed: string, plan: WorldPlan, suffix: string, top: boolean, spares: boolean): Block {
  const id = slug(node.path) || "root";
  const lots: Lot[] = [];
  if (top) {
    plan.specials.forEach((special, index) => {
      lots.push({ w: special.w, h: special.h, key: special.id, room: () => ({ id: special.id, name: special.name, role: special.role, floor: special.floor, paths: index === 0 ? [""] : [], road: "", x: 0, y: 0, w: special.w, h: special.h }) });
    });
  }
  let buildings = 0;
  for (const child of node.children) {
    if (child.kind === "building") {
      buildings += 1;
      const size = buildingSize(child);
      lots.push({
        ...size,
        key: child.id,
        node: child,
        room: () => ({ id: slug(child.path), name: titled(child.name), floor: themeFor(child.path, plan, rng(`${seed}:theme:${child.path}`)).floor, paths: [`${child.path}/`], files: child.files ?? 0, road: node.path, x: 0, y: 0, ...size }),
      });
    } else if (child.kind === "road") {
      const block = buildBlock(child, seed, plan, suffix, false, spares);
      lots.push({ w: block.w, h: block.h, key: child.id, block });
    }
  }
  if (spares && buildings > 0) {
    const count = Math.ceil(buildings / 4);
    for (let n = 1; n <= count; n++) {
      lots.push({ ...SPARE, key: `spare:${node.path}:${n}`, room: () => ({ id: `spare-${id}-${n}${suffix}`, name: "Empty", floor: "concrete", paths: [], role: "vacant", road: node.path, x: 0, y: 0, ...SPARE }) });
    }
  }

  // Roads wrap into bands, so a long one stays roughly square rather than running forever.
  const area = lots.reduce((sum, lot) => sum + (lot.w + 1) * (lot.h + 1), 0);
  const limit = Math.max(44, Math.ceil(Math.sqrt(area) * 1.5), ...lots.map((lot) => lot.w + 4));
  interface Band { north: Lot[]; south: Lot[]; n: number; s: number }
  const bands: Band[] = [{ north: [], south: [], n: 3, s: 3 }];
  for (const lot of lots) {
    let band = bands[bands.length - 1] as Band;
    if (Math.min(band.n, band.s) + lot.w > limit) {
      band = { north: [], south: [], n: 3, s: 3 };
      bands.push(band);
    }
    if (band.n <= band.s) { band.north.push(lot); band.n += lot.w + 1; }
    else { band.south.push(lot); band.s += lot.w + 1; }
  }

  const piles = node.children.filter((child) => child.kind === "group");
  const label = node.path ? `${node.path}/` : "";
  const wanted = 4 + Math.ceil(label.length * 0.4) + piles.length * PILE_STEP;
  const width = Math.max(wanted, ...bands.map((band) => Math.max(band.n, band.s) - 1));

  const out: Block = { w: width, h: 0, rooms: [], doors: [] };
  const place = (lot: Lot, x: number, y: number, side: "n" | "s", wall: number): void => {
    const random = rng(`${seed}:door:${lot.key}`);
    if (lot.block) {
      for (const placed of lot.block.rooms) out.rooms.push({ ...placed, room: { ...placed.room, x: placed.room.x + x, y: placed.room.y + y } });
      for (const door of lot.block.doors) out.doors.push({ x: door.x + x, y: door.y + y });
      // The side road's spine runs through the wall to meet this road.
      out.rooms.push({ room: road(`link-${slug(lot.key)}${suffix}`, "", x, wall, ROAD_H, 1, []) });
      return;
    }
    const room = (lot.room as () => MapRoom)();
    room.x = x;
    room.y = y;
    out.rooms.push({ room, ...(lot.node ? { node: lot.node } : {}), side });
    out.doors.push({ x: x + 1 + Math.floor(random() * Math.max(1, lot.w - 2)), y: wall });
  };

  let y = 0;
  bands.forEach((band, index) => {
    const north = Math.max(0, ...band.north.map((lot) => lot.h));
    const south = Math.max(0, ...band.south.map((lot) => lot.h));
    const street = y + north + (north > 0 ? 1 : 0);
    let x = 3;
    for (const lot of band.north) {
      place(lot, x, street - 1 - lot.h, "n", street - 1);
      x += lot.w + 1;
    }
    x = 3;
    for (const lot of band.south) {
      place(lot, x, street + ROAD_H + 1, "s", street + ROAD_H);
      x += lot.w + 1;
    }
    out.rooms.push({ room: road(`road-${id}-${index}${suffix}`, index === 0 ? label : "", 2, street, width - 2, ROAD_H, node.path ? [`${node.path}/`] : []) });
    y = street + ROAD_H + 1 + (south > 0 ? south + 1 : 0);
  });
  out.h = Math.max(1, y - 1);
  out.rooms.push({ room: road(`road-${id}-spine${suffix}`, "", 0, 0, ROAD_H, out.h, node.path ? [`${node.path}/`] : []) });
  return out;
}

/** Loose files, in groups, on the first stretch of their own road. Redrawn whenever they change. */
function placePiles(map: OfficeMap, top: TreeNode): void {
  map.furniture = map.furniture.filter((item) => item.type !== "pile");
  const visit = (node: TreeNode): void => {
    const street = map.rooms.find((room) => room.role === "hall" && room.id === `road-${slug(node.path) || "root"}-0`);
    if (street) {
      const start = street.x + 2 + Math.ceil((node.path ? node.path.length + 1 : 0) * 0.4);
      const fits = Math.max(1, Math.floor((street.x + street.w - start) / PILE_STEP));
      node.children.filter((child) => child.kind === "group").slice(0, fits).forEach((group, index) => {
        map.furniture.push({ type: "pile", x: start + index * PILE_STEP, y: street.y, room: street.id, part: group.id, label: `${group.name} ${group.children.length}` });
      });
    }
    for (const child of node.children) if (child.kind === "road") visit(child);
  };
  visit(top);
}

function shift(map: OfficeMap): void {
  if (map.rooms.length === 0) return;
  const minX = Math.min(...map.rooms.map((room) => room.x));
  const minY = Math.min(...map.rooms.map((room) => room.y));
  const dx = MARGIN - minX;
  const dy = MARGIN_TOP - minY;
  for (const room of map.rooms) { room.x += dx; room.y += dy; }
  for (const door of map.doors) { door.x += dx; door.y += dy; }
  for (const item of map.furniture) { item.x += dx; item.y += dy; }
  map.cols = Math.max(...map.rooms.map((room) => room.x + room.w)) + MARGIN;
  map.rows = Math.max(...map.rooms.map((room) => room.y + room.h)) + MARGIN;
}

function collectBuildings(node: TreeNode, into: Map<string, { node: TreeNode; road: TreeNode }> = new Map()): Map<string, { node: TreeNode; road: TreeNode }> {
  for (const child of node.children) {
    if (child.kind === "building") into.set(slug(child.path), { node: child, road: node });
    else if (child.kind === "road") collectBuildings(child, into);
  }
  return into;
}

const setLinks = (map: OfficeMap, tree: ProjectTree): void => {
  const on = new Set(map.rooms.map((room) => room.id));
  const links = tree.links
    .map((link) => ({ from: slug(link.from.replace(/^building:/, "")), to: slug(link.to.replace(/^building:/, "")), door: false }))
    .filter((link) => on.has(link.from) && on.has(link.to));
  if (links.length > 0) map.links = links;
  else delete map.links;
};

/** Absorb a block into the map, furnishing what it holds. */
function addBlock(map: OfficeMap, block: Block, x: number, y: number, seed: string, plan: WorldPlan): void {
  for (const placed of block.rooms) {
    const room = { ...placed.room, x: placed.room.x + x, y: placed.room.y + y };
    map.rooms.push(room);
    if (placed.node) map.furniture.push(...fillBuilding(room, placed.node, plan));
  }
  for (const door of block.doors) map.doors.push({ x: door.x + x, y: door.y + y });
  for (const placed of block.rooms) {
    const { role, id } = placed.room;
    if (!role || role === "hall") continue;
    const room = map.rooms.find((candidate) => candidate.id === id) as MapRoom;
    map.furniture.push(...furnish(room, map.doors, seed, plan));
  }
}

export function layoutRoads(tree: ProjectTree, seed: string, plan: WorldPlan = OFFICE_PLAN): OfficeMap {
  const top = asRoads(tree);
  const map: OfficeMap = { version: 1, ...(plan === OFFICE_PLAN ? {} : { world: plan.id }), layout: "roads", seed, evolve: true, cols: 0, rows: 0, rooms: [], doors: [], furniture: [], log: [] };
  addBlock(map, buildBlock(top, seed, plan, "", true, true), 0, 0, seed, plan);
  // The first room stays first in the file.
  map.rooms.sort((a, b) => Number(b.role === "lobby") - Number(a.role === "lobby"));
  placePiles(map, top);
  setLinks(map, tree);
  shift(map);
  return map;
}

export function evolveRoads(previous: OfficeMap | undefined, tree: ProjectTree, seed: string, now = new Date().toISOString()): { map: OfficeMap; changes: string[] } {
  if (!previous) return { map: layoutRoads(tree, seed), changes: [] };
  const plan = worldPlan(previous.world);
  const map = JSON.parse(JSON.stringify(previous)) as OfficeMap;
  const changes: string[] = [];
  const top = asRoads(tree);
  const wanted = collectBuildings(top);
  for (const id of map.removed ?? []) wanted.delete(id);

  const clearItems = (id: string): void => { map.furniture = map.furniture.filter((item) => item.room !== id); };
  for (const room of map.rooms) {
    if (room.role || room.locked || wanted.has(room.id)) continue;
    changes.push(`${room.name} is now empty: its folder has gone`);
    clearItems(room.id);
    room.role = "vacant";
    room.name = "Empty";
    room.paths = [];
    delete room.files;
    map.furniture.push(...furnish(room, map.doors, map.seed, plan));
  }

  const newOnRoad = new Map<string, TreeNode[]>();
  const signature = (items: MapItem[]): string => items.map((item) => `${item.type}:${item.part}`).sort().join("|");
  for (const [id, { node, road: parent }] of wanted) {
    const room = map.rooms.find((candidate) => candidate.id === id);
    if (room?.locked) continue;
    if (room) {
      const back = room.role === "vacant";
      if (back) {
        delete room.role;
        room.name = titled(node.name);
        room.paths = [`${node.path}/`];
        room.floor = themeFor(node.path, plan, rng(`${map.seed}:theme:${node.path}`)).floor;
        changes.push(`${room.name} is back`);
      }
      room.files = node.files ?? 0;
      const items = fillBuilding(room, node, plan);
      if (back || signature(items) !== signature(map.furniture.filter((item) => item.room === id))) {
        clearItems(id);
        map.furniture.push(...items);
      }
      continue;
    }
    // A spare lot on its own road, if there's one big enough.
    const size = buildingSize(node);
    const lot = map.rooms.find((candidate) => candidate.role === "vacant" && !candidate.locked && candidate.road === parent.path && candidate.w >= size.w && candidate.h >= size.h);
    if (lot) {
      clearItems(lot.id);
      lot.id = id;
      delete lot.role;
      lot.name = titled(node.name);
      lot.floor = themeFor(node.path, plan, rng(`${map.seed}:theme:${node.path}`)).floor;
      lot.paths = [`${node.path}/`];
      lot.files = node.files ?? 0;
      map.furniture.push(...fillBuilding(lot, node, plan));
      changes.push(`New room: ${lot.name}`);
      continue;
    }
    newOnRoad.set(parent.path, [...(newOnRoad.get(parent.path) ?? []), node]);
  }

  // No lot left: a new stretch of road, below everything, so nothing else has to move.
  const spine = map.rooms.find((room) => room.id === "road-root-spine");
  for (const [path, nodes] of newOnRoad) {
    const bottom = Math.max(...map.rooms.map((room) => room.y + room.h));
    const startX = spine?.x ?? Math.min(...map.rooms.map((room) => room.x));
    const stretch = map.rooms.filter((room) => room.id.startsWith("road-") && room.id.endsWith("spine")).length;
    const node: TreeNode = { id: `road:${path}`, kind: "road", name: `${path}/`, path, children: nodes };
    const y = bottom + 1;
    addBlock(map, buildBlock(node, map.seed, plan, `-more${stretch}`, false, false), startX, y, map.seed, plan);
    if (spine) spine.h = y - spine.y;
    for (const added of nodes) changes.push(`New room: ${titled(added.name)}`);
  }

  placePiles(map, top);

  setLinks(map, tree);
  shift(map);
  if (changes.length > 0) map.log = [...map.log, ...changes.map((text) => ({ at: now, text }))].slice(-30);
  return { map, changes };
}
