/**
 * Draws the office. Every piece of art here is original to this project, made in code at
 * 16 pixels a tile. The building is drawn once to a layer (drawBuilding); people, screens
 * and anything else that moves are drawn on top each frame (drawWorld).
 */

import { drawLinks, linkRoutes } from "./links.js";
import { BODY_FONT, LABEL_FONT, OUTLINE, TILE, rect, shade, type Ctx, type Palette } from "./paint.js";
import { isSeated, specOf, type Agent, type Item, type Room, type World } from "./world.js";
import { OFFICE_PAINTER } from "./worlds/office-paint.js";

export { TILE, type Palette } from "./paint.js";

// --- Worlds ---------------------------------------------------------------------------------------

/** How one world looks. The engine draws the building, characters and labels around it. */
export interface Painter {
  furniture(c: Ctx, item: Item, world: World, time: number, palette: Palette): void;
  /** What lights up at night. Call `glow` for anything that does. */
  glow(item: Item, world: World, glow: (x: number, y: number, radius: number, color: string) => void): void;
}

const painters = new Map<string, Painter>([["office", OFFICE_PAINTER]]);

export function registerPainter(id: string, painter: Painter): void {
  painters.set(id, painter);
}

const painterFor = (world: World): Painter => painters.get(world.pack.id) ?? OFFICE_PAINTER;

// --- Time of day, from the viewer's own clock ------------------------------------------------------------

export interface Daylight { sky: string; sun: string; night: number }

export function daylightAt(hour: number): Daylight {
  if (hour >= 7 && hour < 17) return { sky: "#8ed0ff", sun: "rgba(255,244,214,0.10)", night: 0 };
  if (hour >= 17 && hour < 20) return { sky: "#ffae70", sun: "rgba(255,170,110,0.13)", night: 0.14 };
  if (hour >= 5 && hour < 7) return { sky: "#ffc9a3", sun: "rgba(255,200,170,0.08)", night: 0.16 };
  return { sky: "#16204a", sun: "rgba(0,0,0,0)", night: 0.24 };
}

// --- Characters ------------------------------------------------------------------------------------------

type Part = [color: string, x: number, y: number, w: number, h: number];

/** Parts draw with one outline around the whole figure, so characters read clearly on any floor. */
function drawParts(c: Ctx, parts: Part[]): void {
  c.fillStyle = OUTLINE;
  for (const [, x, y, w, h] of parts) c.fillRect(Math.round(x) - 1, Math.round(y) - 1, w + 2, h + 2);
  for (const [color, x, y, w, h] of parts) rect(c, color, x, y, w, h);
}

function drawAgent(c: Ctx, agent: Agent, time: number, selected: boolean): void {
  const left = agent.x * TILE + 2; // sprite is 12 wide inside a 16 tile
  const feet = agent.y * TILE + 15;
  const seated = isSeated(agent);
  const walking = agent.walking;
  const side = agent.facing === "left" || agent.facing === "right";
  const back = agent.facing === "up";
  const flip = agent.facing === "left";
  const phase = Math.floor(time * 9 + (agent.seed % 5));
  const step = walking ? phase % 4 : 0; // 0 pass, 1 left forward, 2 pass, 3 right forward
  const bob = walking && step % 2 === 1 ? -1 : 0;
  const breathe = !walking && !seated && Math.floor(time * 1.4 + (agent.seed % 7)) % 2 === 0 ? 1 : 0;
  const party = agent.party > 0 ? -Math.abs(Math.round(Math.sin(time * 12) * 3)) : 0;

  const skin = agent.skin;
  const hair = agent.hair;
  const shirt = agent.shirt;
  const dark = shade(shirt, -40);
  const light = shade(shirt, 24);
  const legs = "#39415a";
  const shoe = "#1f2433";
  const style = agent.seed % 5; // short, long, bun, spiky, cap
  const outfit = (agent.seed >>> 5) % 3; // tee, hoodie, shirt and tie

  // Shadow, and a highlight under whoever is selected.
  c.fillStyle = "rgba(0,0,0,0.28)";
  c.fillRect(Math.round(left + 1), Math.round(feet - 1), 10, 2);
  if (selected) {
    c.fillStyle = "rgba(255,255,255,0.45)";
    c.fillRect(Math.round(left - 2), Math.round(feet - 2), 16, 4);
  }
  if (agent.state === "blocked") {
    c.fillStyle = Math.floor(time * 3) % 2 === 0 ? "rgba(239,68,68,0.55)" : "rgba(239,68,68,0.22)";
    c.fillRect(Math.round(left - 2), Math.round(feet - 2), 16, 4);
  }

  const lift = bob + party;
  const parts: Part[] = [];
  const bodyTop = feet - (seated ? 13 : 13) + lift + breathe * 0;
  const headTop = bodyTop - 8 + breathe;

  // Chair behind someone sitting at a desk.
  if (seated) {
    rect(c, "#1f2937", left + 1, agent.y * TILE + 3, 10, 9);
    rect(c, "#374151", left + 2, agent.y * TILE + 11, 8, 3);
    rect(c, "#111827", left + 5, agent.y * TILE + 14, 2, 2);
  }

  // Legs
  if (!seated) {
    const legTop = bodyTop + 7;
    if (side) {
      const swing = step === 1 ? 2 : step === 3 ? -2 : 0;
      parts.push([legs, left + 4 + swing, legTop, 3, 5], [shoe, left + 4 + swing + (flip ? -1 : 0), legTop + 5, 4, 1]);
      parts.push([shade(legs, -12), left + 5 - swing, legTop, 3, 5], [shoe, left + 5 - swing + (flip ? -1 : 0), legTop + 5, 4, 1]);
    } else {
      const leftUp = step === 1 ? 1 : 0;
      const rightUp = step === 3 ? 1 : 0;
      parts.push([legs, left + 2, legTop, 3, 5 - leftUp], [shoe, left + 2, legTop + 5 - leftUp, 3, 1]);
      parts.push([legs, left + 7, legTop, 3, 5 - rightUp], [shoe, left + 7, legTop + 5 - rightUp, 3, 1]);
    }
  }

  // Body and arms
  const swingArm = walking ? (step === 1 ? 1 : step === 3 ? -1 : 0) : 0;
  if (side) {
    parts.push([shirt, left + 3, bodyTop, 6, 7], [dark, left + 3, bodyTop + 6, 6, 1]);
    parts.push([dark, left + 5 + swingArm, bodyTop + 1, 2, 5], [skin, left + 5 + swingArm, bodyTop + 6, 2, 1]);
  } else {
    parts.push([shirt, left + 1, bodyTop, 10, 7], [dark, left + 1, bodyTop + 6, 10, 1]);
    const typing = seated && agent.state === "working";
    const type = Math.floor(time * 10 + agent.seed) % 2;
    parts.push([dark, left - 1, bodyTop + 1 + swingArm + (typing ? -type : 0), 2, 5]);
    parts.push([dark, left + 11, bodyTop + 1 - swingArm + (typing ? type - 1 : 0), 2, 5]);
    parts.push([skin, left - 1, bodyTop + 6 + swingArm + (typing ? -type : 0), 2, 1]);
    parts.push([skin, left + 11, bodyTop + 6 - swingArm + (typing ? type - 1 : 0), 2, 1]);
    if (!back && outfit === 2) parts.push(["#f3f4f6", left + 4, bodyTop, 4, 3], [agent.seed % 2 ? "#ef4444" : "#1d4ed8", left + 5, bodyTop, 2, 5]);
    if (!back && outfit === 1) parts.push([light, left + 3, bodyTop, 6, 2], [dark, left + 5, bodyTop + 2, 2, 4]);
    if (back && outfit === 1) parts.push([light, left + 2, bodyTop, 8, 3]);
  }

  // Head
  parts.push([skin, left + 1, headTop, 10, 8]);
  if (back) {
    parts.push([hair, left + 1, headTop, 10, 7]);
  } else if (side) {
    const backX = flip ? left + 7 : left + 1;
    parts.push([hair, left + 1, headTop, 10, 3], [hair, backX, headTop, 4, 6]);
    const blink = Math.floor(time * 0.7 + agent.seed % 11) % 7 === 0;
    parts.push([blink ? shade(skin, -40) : "#1a1a24", flip ? left + 3 : left + 8, headTop + 4, 1, blink ? 1 : 2]);
  } else {
    parts.push([hair, left + 1, headTop, 10, 3], [hair, left + 1, headTop + 3, 1, 2], [hair, left + 10, headTop + 3, 1, 2]);
    const blink = Math.floor(time * 0.7 + agent.seed % 11) % 7 === 0;
    parts.push([blink ? shade(skin, -40) : "#1a1a24", left + 3, headTop + 4, 2, blink ? 1 : 2]);
    parts.push([blink ? shade(skin, -40) : "#1a1a24", left + 7, headTop + 4, 2, blink ? 1 : 2]);
    parts.push([shade(skin, -28), left + 5, headTop + 6, 2, 1]);
  }
  if (style === 1) parts.push([hair, left, headTop + 2, 2, 8], [hair, left + 10, headTop + 2, 2, 8]); // long
  if (style === 2) parts.push([hair, left + 4, headTop - 3, 4, 3]); // bun
  if (style === 3) parts.push([hair, left + 2, headTop - 2, 2, 2], [hair, left + 5, headTop - 3, 2, 3], [hair, left + 8, headTop - 2, 2, 2]); // spiky
  if (style === 4) { // cap
    parts.push([light, left, headTop - 1, 12, 3]);
    if (!back && !side) parts.push([dark, left + 1, headTop + 2, 10, 1]);
    if (side) parts.push([dark, flip ? left - 2 : left + 9, headTop + 1, 5, 1]);
  }
  drawParts(c, parts);

  if (agent.party > 0) {
    const colors = ["#f59e0b", "#ec4899", "#22c55e", "#3b82f6", "#a855f7"];
    for (let i = 0; i < 10; i++) {
      const t = (time * 1.1 + i * 0.137) % 1;
      const angle = i * 2.4 + agent.seed;
      rect(c, colors[i % colors.length] as string, left + 6 + Math.cos(angle) * (4 + t * 14), feet - 22 - t * 6 + t * t * 26, 2, 2);
    }
  }
}

function bubble(c: Ctx, x: number, y: number, draw: (x: number, y: number) => void): void {
  rect(c, OUTLINE, x - 1, y - 1, 13, 11);
  rect(c, "#ffffff", x, y, 11, 9);
  rect(c, "#ffffff", x + 4, y + 9, 3, 1);
  rect(c, OUTLINE, x + 4, y + 10, 3, 1);
  draw(x, y);
}

function drawStatus(c: Ctx, agent: Agent, time: number): void {
  const x = Math.round(agent.x * TILE + 2);
  const y = Math.round(agent.y * TILE - 22 + (isSeated(agent) ? 2 : -2));
  const pulse = Math.floor(time * 2 + (agent.seed % 3)) % 2 === 0;
  if (agent.state === "blocked") {
    bubble(c, x, y, (bx, by) => {
      rect(c, pulse ? "#dc2626" : "#991b1b", bx + 5, by + 1, 2, 5);
      rect(c, pulse ? "#dc2626" : "#991b1b", bx + 5, by + 7, 2, 1);
    });
  } else if (agent.state === "thinking") {
    const dots = Math.floor(time * 3) % 4;
    bubble(c, x, y, (bx, by) => {
      for (let i = 0; i < 3; i++) rect(c, i < dots ? "#111827" : "#d1d5db", bx + 2 + i * 3, by + 4, 2, 2);
    });
  } else if (agent.state === "reviewing" && !agent.walking) {
    bubble(c, x, y, (bx, by) => {
      rect(c, "#2563eb", bx + 4, by + 1, 4, 1); rect(c, "#2563eb", bx + 7, by + 2, 1, 2);
      rect(c, "#2563eb", bx + 5, by + 4, 2, 1); rect(c, "#2563eb", bx + 5, by + 5, 1, 1); rect(c, "#2563eb", bx + 5, by + 7, 1, 1);
    });
  } else if (agent.state === "done") {
    const color = pulse ? "#f59e0b" : "#fbbf24";
    bubble(c, x, y, (bx, by) => {
      rect(c, color, bx + 5, by + 1, 1, 7); rect(c, color, bx + 2, by + 3, 7, 2); rect(c, color, bx + 4, by + 2, 3, 5);
    });
  } else if (agent.state === "idle" && !agent.walking && agent.seed % 3 === 0) {
    bubble(c, x, y, (bx, by) => {
      rect(c, "#92400e", bx + 3, by + 3, 4, 4); rect(c, "#d97706", bx + 3, by + 3, 4, 1); rect(c, "#92400e", bx + 7, by + 4, 1, 2);
      if (pulse) rect(c, "#9ca3af", bx + 4, by + 1, 1, 1);
    });
  }
}

// --- The building ----------------------------------------------------------------------------------------

function drawFloor(c: Ctx, room: Room): void {
  for (let ty = room.y; ty < room.y + room.h; ty++) {
    for (let tx = room.x; tx < room.x + room.w; tx++) {
      const x = tx * TILE;
      const y = ty * TILE;
      const noise = (tx * 73 + ty * 151) % 17;
      switch (room.floor) {
        case "carpet":
          rect(c, "#4c4f7a", x, y, TILE, TILE);
          for (let i = 0; i < 8; i++) rect(c, i % 2 ? "#55588a" : "#454874", x + ((tx * 7 + i * 5) % 15), y + ((ty * 3 + i * 7) % 15), 1, 1);
          break;
        case "tile":
          rect(c, (tx + ty) % 2 === 0 ? "#d6dee8" : "#c2ccd8", x, y, TILE, TILE);
          rect(c, "#aab5c2", x, y + 15, TILE, 1);
          rect(c, "#aab5c2", x + 15, y, 1, TILE);
          rect(c, "#e8eef5", x + 1, y + 1, 5, 1);
          break;
        case "stone":
          rect(c, noise % 3 === 0 ? "#8d93a3" : "#9aa0b0", x, y, TILE, TILE);
          rect(c, "#7a8090", x, y + 15, TILE, 1);
          rect(c, "#7a8090", x + (ty % 2 ? 7 : 15), y, 1, 15);
          rect(c, "#adb3c2", x + 2, y + 2, 3, 1);
          break;
        case "concrete":
          rect(c, "#6b7280", x, y, TILE, TILE);
          for (let i = 0; i < 5; i++) rect(c, i % 2 ? "#747b89" : "#636a78", x + ((tx * 11 + i * 3) % 15), y + ((ty * 5 + i * 5) % 15), 1, 1);
          if (noise === 3) rect(c, "#596070", x + 3, y + 8, 8, 1);
          break;
        case "hall": {
          // Polished floor, with a runner down the middle of a corridor's length.
          rect(c, "#cfc8b8", x, y, TILE, TILE);
          rect(c, "#bdb6a6", x, y + 15, TILE, 1);
          rect(c, "#bdb6a6", x + 15, y, 1, TILE);
          const along = room.w >= room.h;
          const offset = along ? ty - room.y : tx - room.x;
          const size = along ? room.h : room.w;
          if (along && offset === 0) rect(c, "#7f6a55", x, y + 12, TILE, 4);
          if (along && offset === size - 1) rect(c, "#7f6a55", x, y, TILE, 4);
          if (!along && offset === 0) rect(c, "#7f6a55", x + 12, y, 4, TILE);
          if (!along && offset === size - 1) rect(c, "#7f6a55", x, y, 4, TILE);
          break;
        }
        case "grass":
          rect(c, "#3f8f4f", x, y, TILE, TILE);
          for (let i = 0; i < 7; i++) rect(c, i % 3 ? "#4aa35c" : "#347a43", x + ((tx * 5 + i * 9) % 15), y + ((ty * 7 + i * 3) % 14), 1, 2);
          break;
        default: {
          const plank = ty % 2 === 0 ? "#a57448" : "#9c6c42";
          rect(c, plank, x, y, TILE, TILE);
          rect(c, "#8a5d36", x, y + 7, TILE, 1);
          rect(c, "#8a5d36", x, y + 15, TILE, 1);
          rect(c, "#8a5d36", x + ((tx * 8 + (ty % 2 ? 8 : 0)) % 16), y, 1, 7);
          rect(c, "#8a5d36", x + ((tx * 8 + (ty % 2 ? 0 : 8)) % 16), y + 8, 1, 7);
          rect(c, "#b4835a", x + (noise % 9) + 2, y + 3, 4, 1);
          rect(c, "#b4835a", x + (noise % 7) + 4, y + 11, 3, 1);
        }
      }
    }
  }
}

const WALL_TOP = "#2a2d48";
const WALL_FACE = "#5c628f";
const WALL_DARK = "#4a4f78";
const WALL_LIGHT = "#6d74a4";

/** Outside the building: lawn, with the odd shrub and tree. */
function drawGrounds(c: Ctx, tx: number, ty: number): void {
  const x = tx * TILE;
  const y = ty * TILE;
  rect(c, (tx + ty) % 2 === 0 ? "#4b8a4f" : "#478549", x, y, TILE, TILE);
  const noise = (tx * 73 + ty * 151) % 29;
  for (let i = 0; i < 4; i++) rect(c, "#5a9b5c", x + ((tx * 5 + i * 7) % 15), y + ((ty * 3 + i * 5) % 15), 1, 2);
  if (noise === 4) {
    rect(c, "#2f6a38", x + 3, y + 7, 10, 7);
    rect(c, "#3c7f45", x + 5, y + 8, 5, 3);
  } else if (noise === 11) {
    rect(c, "#5b3a22", x + 7, y + 10, 2, 5);
    rect(c, "#24592e", x + 2, y + 1, 12, 10);
    rect(c, "#2f6f3a", x + 4, y + 2, 7, 5);
  }
}

function drawWalls(c: Ctx, world: World, palette: Palette, daylight: Daylight): void {
  const open = new Set<string>();
  for (const room of world.rooms) {
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) open.add(`${x},${y}`);
  }
  const doors = new Set(world.doors.map((door) => `${door.x},${door.y}`));

  for (let ty = 0; ty < world.rows; ty++) {
    for (let tx = 0; tx < world.cols; tx++) {
      const key = `${tx},${ty}`;
      if (open.has(key) || doors.has(key)) continue;
      const x = tx * TILE;
      const y = ty * TILE;
      const nearBuilding = (cx: number, cy: number): boolean => {
        for (let ay = cy - 1; ay <= cy + 1; ay++) {
          for (let ax = cx - 1; ax <= cx + 1; ax++) if (open.has(`${ax},${ay}`) || doors.has(`${ax},${ay}`)) return true;
        }
        return false;
      };
      if (!nearBuilding(tx, ty)) {
        drawGrounds(c, tx, ty);
        continue;
      }
      if (open.has(`${tx},${ty + 1}`)) {
        rect(c, WALL_FACE, x, y, TILE, TILE);
        rect(c, WALL_LIGHT, x, y, TILE, 1);
        rect(c, WALL_DARK, x, y + 12, TILE, 4);
        rect(c, palette.primary, x, y + 11, TILE, 1);
        // Windows look outside, so only an outer wall has them.
        if (tx % 4 === 3 && !nearBuilding(tx, ty - 1) && !world.furniture.some((item) => specOf(world, item).wall && item.x === tx && item.y === ty)) {
          // A window, in the colour of the sky right now.
          rect(c, "#1f2937", x + 1, y + 1, 14, 9);
          rect(c, daylight.sky, x + 2, y + 2, 12, 7);
          rect(c, shade(daylight.sky, 40), x + 3, y + 3, 4, 2);
          rect(c, "#1f2937", x + 8, y + 2, 1, 7);
          if (daylight.night > 0.3) { rect(c, "#fef3c7", x + 4, y + 3, 1, 1); rect(c, "#fef3c7", x + 11, y + 5, 1, 1); }
        }
      } else {
        rect(c, WALL_TOP, x, y, TILE, TILE);
        if (open.has(`${tx},${ty - 1}`)) rect(c, "#20233a", x, y, TILE, 3);
        if (open.has(`${tx - 1},${ty}`)) rect(c, "#20233a", x, y, 2, TILE);
        if (open.has(`${tx + 1},${ty}`)) rect(c, "#20233a", x + 14, y, 2, TILE);
      }
    }
  }
  for (const door of world.doors) {
    const x = door.x * TILE;
    const y = door.y * TILE;
    const horizontal = open.has(`${door.x},${door.y - 1}`) || open.has(`${door.x},${door.y + 1}`);
    rect(c, "#7c5637", x, y, TILE, TILE);
    for (let i = 2; i < 16; i += 4) rect(c, "#6b4a2f", horizontal ? x : x + i, horizontal ? y + i : y, horizontal ? TILE : 1, horizontal ? 1 : TILE);
    if (horizontal) { rect(c, WALL_DARK, x, y, 2, TILE); rect(c, WALL_DARK, x + 14, y, 2, TILE); }
    else { rect(c, WALL_DARK, x, y, TILE, 2); rect(c, WALL_DARK, x, y + 14, TILE, 2); }
  }
}

const ROAD_TINTS = ["#38bdf8", "#f97316", "#a78bfa", "#34d399", "#f472b6", "#facc15", "#60a5fa", "#fb7185"];

/** What the map stands for: each road tinted by its top folder, with real paths on roads and buildings. */
function drawPaths(c: Ctx, world: World): void {
  const size = 11 / world.labelScale;
  const pad = 3 / world.labelScale;
  const tag = (text: string, x: number, y: number, fill: string, ink: string): number => {
    const width = c.measureText(text).width + pad * 2;
    c.fillStyle = fill;
    c.fillRect(x, y, width, size + pad * 2);
    c.fillStyle = ink;
    c.fillText(text, x + pad, y + pad);
    return width;
  };
  const tops = [...new Set(world.rooms.filter((room) => room.floor === "hall" && room.paths[0]).map((room) => (room.paths[0] as string).split("/")[0]))].sort();
  c.save();
  c.font = `bold ${size}px ui-monospace, Menlo, Consolas, monospace`;
  c.textBaseline = "top";
  for (const room of world.rooms) {
    if (room.floor !== "hall") continue;
    const top = room.paths[0]?.split("/")[0];
    c.globalAlpha = 0.3;
    c.fillStyle = top ? (ROAD_TINTS[tops.indexOf(top) % ROAD_TINTS.length] as string) : "#cbd5e1";
    c.fillRect(room.x * TILE, room.y * TILE, room.w * TILE, room.h * TILE);
    c.globalAlpha = 1;
  }
  for (const room of world.rooms) {
    if (room.floor !== "hall" || !room.name) continue;
    tag(room.name, room.x * TILE + pad, (room.y + room.h / 2) * TILE - size / 2 - pad, "#0d0f22", "#ffffff");
  }
  for (const room of world.rooms) {
    const where = room.paths[0];
    if (room.floor === "hall" || !where) continue;
    const width = c.measureText(where).width + pad * 2;
    if (width > room.w * TILE) continue;
    tag(where, room.x * TILE, (room.y + room.h) * TILE - size - pad * 2, "rgba(13,15,34,0.85)", "#dfe3ff");
  }
  c.restore();
}

function drawLabels(c: Ctx, world: World): void {
  c.font = LABEL_FONT;
  c.textBaseline = "top";
  for (const item of world.furniture) {
    if (!item.label) continue;
    const width = Math.ceil(c.measureText(item.label).width) + 4;
    rect(c, "#f4ecd8", item.x * TILE + 17, item.y * TILE + 3, width, 10);
    c.fillStyle = "#1c1408";
    c.fillText(item.label, item.x * TILE + 19, item.y * TILE + 4.5);
  }
  for (const room of world.rooms) {
    if (!room.name || (world.showPaths && room.floor === "hall")) continue;
    const label = room.name.toUpperCase();
    const width = Math.ceil(c.measureText(label).width) + 6;
    const x = room.x * TILE + 3;
    const y = room.y * TILE - 13;
    rect(c, "#1c1f33", x, y, width, 10);
    rect(c, "#2f3350", x + 1, y + 1, width - 2, 8);
    c.fillStyle = "#f8fafc";
    c.fillText(label, x + 3, y + 1.5);
  }
}

/** Everything that doesn't move. Redrawn only when the building or the hour changes. */
export function drawBuilding(c: Ctx, world: World, palette: Palette, daylight: Daylight): void {
  rect(c, WALL_TOP, 0, 0, world.cols * TILE, world.rows * TILE);
  for (const room of world.rooms) drawFloor(c, room);
  drawWalls(c, world, palette, daylight);
  for (const item of world.furniture) if (item.type === "rug" || item.type === "pile") painterFor(world).furniture(c, item, world, 0, palette);
  for (const item of world.furniture) if (specOf(world, item).wall) painterFor(world).furniture(c, item, world, 0, palette);
  // Light from the windows falling across the floor.
  if (daylight.sun !== "rgba(0,0,0,0)") {
    c.fillStyle = daylight.sun;
    for (const room of world.rooms) {
      for (let tx = room.x; tx < room.x + room.w; tx++) {
        if (tx % 4 !== 3) continue;
        c.fillRect(tx * TILE + 2, room.y * TILE, 12, Math.min(room.h, 3) * TILE);
      }
    }
  }
}

function nameTag(c: Ctx, agent: Agent, selected: boolean, width: number): void {
  c.font = LABEL_FONT;
  c.textBaseline = "top";
  const w = Math.ceil(c.measureText(agent.name).width) + 5;
  const x = Math.round(Math.max(1, Math.min(width - w - 1, agent.x * TILE + 8 - w / 2)));
  const y = Math.round(agent.y * TILE + 16);
  c.fillStyle = selected ? "#ffffff" : "rgba(17,24,39,0.82)";
  c.fillRect(x, y, w, 10);
  c.fillStyle = selected ? "#111827" : "#ffffff";
  c.fillText(agent.name, x + 2.5, y + 1.5);
}

function wrap(c: Ctx, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (c.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

const STATE_LABEL: Record<string, string> = { working: "Working", thinking: "Thinking", blocked: "Blocked", reviewing: "Reviewing", idle: "On a break", done: "Finished", away: "Away" };

function drawCard(c: Ctx, agent: Agent, world: World): void {
  c.font = BODY_FONT;
  c.textBaseline = "top";
  const room = world.rooms.find((candidate) => candidate.id === agent.area);
  const body = wrap(c, agent.task || STATE_LABEL[agent.state] || "", 110);
  const w = 120;
  const h = 18 + body.length * 9 + (room ? 9 : 0) + 3;
  const x = Math.round(Math.max(2, Math.min(world.cols * TILE - w - 2, agent.x * TILE + 8 - w / 2)));
  const y = Math.round(Math.max(2, agent.y * TILE - h - 24));
  rect(c, OUTLINE, x - 1, y - 1, w + 2, h + 2);
  rect(c, "#ffffff", x, y, w, h);
  c.fillStyle = "#111827";
  c.font = LABEL_FONT;
  c.fillText(`${agent.name}: ${STATE_LABEL[agent.state] ?? ""}`.slice(0, 28), x + 4, y + 4);
  c.fillStyle = "#374151";
  c.font = BODY_FONT;
  body.forEach((line, index) => c.fillText(line, x + 4, y + 15 + index * 9));
  if (room) {
    c.fillStyle = "#6b7280";
    c.fillText(`In ${room.name}`.slice(0, 28), x + 4, y + 15 + body.length * 9);
  }
}

function drawProgress(c: Ctx, world: World, palette: Palette): void {
  if (world.tasks.length === 0) return;
  const done = world.tasks.filter((task) => task.state === "done").length;
  c.font = LABEL_FONT;
  c.textBaseline = "top";
  const w = 96;
  rect(c, "rgba(17,24,39,0.85)", 4, 4, w, 20);
  c.fillStyle = "#ffffff";
  c.fillText(`${world.pack.words.quests} ${done}/${world.tasks.length}`, 8, 6.5);
  rect(c, "#374151", 8, 16, w - 8, 4);
  rect(c, palette.primary, 8, 16, Math.round(((w - 8) * done) / world.tasks.length), 4);
}

/** Everything that moves. `building` is the layer from drawBuilding. */
export function drawWorld(
  c: Ctx,
  world: World,
  time: number,
  palette: Palette,
  daylight: Daylight,
  building: CanvasImageSource | undefined,
  selected?: string,
): void {
  const width = world.cols * TILE;
  const height = world.rows * TILE;
  if (building) c.drawImage(building, 0, 0, width, height);
  else drawBuilding(c, world, palette, daylight);

  // On the floor, so people and furniture stay in front of the lines.
  if (world.showLinks && world.links.length > 0) {
    world.routes ??= linkRoutes(world);
    drawLinks(c, world.routes, time);
  }

  const painter = painterFor(world);
  const scene: { depth: number; draw: () => void }[] = [];
  for (const item of world.furniture) {
    const spec = specOf(world, item);
    if (spec.solid === false) continue;
    scene.push({ depth: (item.y + spec.h) * TILE - 2, draw: () => painterFor(world).furniture(c, item, world, time, palette) });
  }
  const shown = world.agents.filter((agent) => agent.state !== "away");
  for (const agent of shown) scene.push({ depth: agent.y * TILE + 14, draw: () => drawAgent(c, agent, time, agent.id === selected) });
  scene.sort((a, b) => a.depth - b.depth);
  for (const item of scene) item.draw();

  // Night: the room dims, and screens and lamps light it.
  if (daylight.night > 0) {
    c.fillStyle = `rgba(12,14,48,${daylight.night})`;
    c.fillRect(0, 0, width, height);
    c.save();
    c.globalCompositeOperation = "lighter";
    const glow = (x: number, y: number, radius: number, color: string): void => {
      const gradient = c.createRadialGradient(x, y, 1, x, y, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = gradient;
      c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    for (const item of world.furniture) painter.glow(item, world, glow);
    c.restore();
  }

  // On top, so tall furniture against a wall can't hide a room's name.
  drawLabels(c, world);
  if (world.showPaths && world.rooms.some((room) => room.floor === "hall")) drawPaths(c, world);
  for (const agent of shown) nameTag(c, agent, agent.id === selected, width);
  for (const agent of shown) if (agent.id !== selected) drawStatus(c, agent, time);
  drawProgress(c, world, palette);
  const picked = shown.find((agent) => agent.id === selected);
  if (picked) drawCard(c, picked, world);
}
