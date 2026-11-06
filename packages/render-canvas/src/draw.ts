/**
 * Draws the office. Every piece of art here is original to this project, made in code at
 * 16 pixels a tile. The building is drawn once to a layer (drawBuilding); people, screens
 * and anything else that moves are drawn on top each frame (drawWorld).
 */

import { FURNITURE, isSeated, type Agent, type Item, type Room, type World } from "./world.js";

export const TILE = 16;

export interface Palette { primary: string; background: string; text: string; accent: string }

type Ctx = CanvasRenderingContext2D;

const LABEL_FONT = "bold 7px ui-monospace, Menlo, Consolas, monospace";
const BODY_FONT = "7px ui-monospace, Menlo, Consolas, monospace";
const OUTLINE = "#14141f";

const rect = (c: Ctx, color: string, x: number, y: number, w: number, h: number): void => {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
};

function shade(color: string, amount: number): string {
  if (!color.startsWith("#")) return color;
  const hex = color.length === 4 ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}` : color;
  const n = parseInt(hex.slice(1, 7), 16);
  const channel = (shift: number): number => Math.max(0, Math.min(255, ((n >> shift) & 255) + amount));
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}

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
      if (open.has(`${tx},${ty + 1}`)) {
        rect(c, WALL_FACE, x, y, TILE, TILE);
        rect(c, WALL_LIGHT, x, y, TILE, 1);
        rect(c, WALL_DARK, x, y + 12, TILE, 4);
        rect(c, palette.primary, x, y + 11, TILE, 1);
        if (tx % 4 === 3 && !world.furniture.some((item) => FURNITURE[item.type].wall && item.x === tx && item.y === ty)) {
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

function drawLabels(c: Ctx, world: World): void {
  c.font = LABEL_FONT;
  c.textBaseline = "top";
  for (const room of world.rooms) {
    if (!room.name) continue;
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
  for (const item of world.furniture) if (item.type === "rug") drawFurniture(c, item, world, 0, palette);
  for (const item of world.furniture) if (FURNITURE[item.type].wall) drawFurniture(c, item, world, 0, palette);
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

function drawDesk(c: Ctx, x: number, y: number, on: boolean, time: number, seed: number, palette: Palette, blocked: boolean): void {
  rect(c, "#55351d", x + 1, y + 22, 46, 8);
  rect(c, "#6b4427", x + 1, y + 13, 46, 10);
  rect(c, "#8a5a33", x + 1, y + 10, 46, 12);
  rect(c, "#a87545", x + 1, y + 10, 46, 2);
  rect(c, "#3b2413", x + 3, y + 22, 3, 9);
  rect(c, "#3b2413", x + 42, y + 22, 3, 9);
  rect(c, "#55351d", x + 30, y + 23, 12, 7);
  rect(c, "#7c5637", x + 31, y + 24, 10, 2);
  rect(c, "#d4a24e", x + 35, y + 24, 2, 1);
  rect(c, "#7c5637", x + 31, y + 27, 10, 2);
  rect(c, "#d4a24e", x + 35, y + 27, 2, 1);
  // Monitor
  rect(c, OUTLINE, x + 14, y - 3, 20, 15);
  rect(c, "#374151", x + 22, y + 12, 4, 2);
  rect(c, "#4b5563", x + 19, y + 14, 10, 1);
  if (blocked) {
    rect(c, "#3f0f14", x + 15, y - 2, 18, 13);
    if (Math.floor(time * 2) % 2 === 0) { rect(c, "#ef4444", x + 23, y, 2, 6); rect(c, "#ef4444", x + 23, y + 7, 2, 2); }
  } else if (on) {
    rect(c, "#0f2a2e", x + 15, y - 2, 18, 13);
    const scroll = Math.floor(time * 3 + (seed % 13));
    for (let line = 0; line < 5; line++) {
      const width = 3 + (((seed >> line) & 7) + (scroll + line) * 7) % 12;
      rect(c, line % 3 === 0 ? palette.primary : line % 3 === 1 ? "#7dd3fc" : "#fcd34d", x + 16 + (line % 2) * 2, y - 1 + line * 2.2, width, 1);
    }
    c.fillStyle = "rgba(125,211,252,0.12)";
    c.fillRect(x + 10, y + 11, 28, 8);
  } else {
    rect(c, "#1f2937", x + 15, y - 2, 18, 13);
    rect(c, "#374151", x + 17, y, 3, 1);
  }
  rect(c, "#d1d5db", x + 16, y + 15, 16, 5);
  for (let row = 0; row < 2; row++) for (let key = 0; key < 7; key++) rect(c, "#9ca3af", x + 17 + key * 2, y + 16 + row * 2, 1, 1);
  rect(c, "#e5e7eb", x + 34, y + 16, 3, 4);
  rect(c, "#f3f4f6", x + 40, y + 13, 5, 5);
  rect(c, palette.primary, x + 40, y + 15, 5, 1);
  rect(c, "#fde68a", x + 4, y + 13, 7, 6);
  rect(c, "#fbbf24", x + 5, y + 15, 5, 1);
}

function drawBoard(c: Ctx, x: number, y: number, world: World): void {
  rect(c, "#3a2c1e", x, y - 12, 64, 27);
  rect(c, "#d9c29c", x + 2, y - 10, 60, 23);
  for (let i = 0; i < 40; i++) rect(c, "#c9b08a", x + 3 + (i * 37) % 58, y - 9 + (i * 13) % 21, 1, 1);
  const colors = { todo: "#fde68a", doing: "#93c5fd", done: "#86efac" };
  const per = 8;
  world.tasks.slice(0, per * 2).forEach((task, index) => {
    const col = index % per;
    const row = Math.floor(index / per);
    rect(c, "#00000033", x + 5 + col * 7, y - 7 + row * 10, 6, 8);
    rect(c, colors[task.state], x + 4 + col * 7, y - 8 + row * 10, 6, 8);
    rect(c, "#ef4444", x + 6 + col * 7, y - 8 + row * 10, 2, 1);
    rect(c, "#00000040", x + 5 + col * 7, y - 5 + row * 10, 4, 1);
    rect(c, "#00000040", x + 5 + col * 7, y - 3 + row * 10, 3, 1);
  });
}

function drawFurniture(c: Ctx, item: Item, world: World, time: number, palette: Palette): void {
  const x = item.x * TILE;
  const y = item.y * TILE;
  switch (item.type) {
    case "desk": {
      const seatX = item.x + 1;
      const seatY = item.y + 2;
      const user = world.agents.find((a) => a.seat?.x === seatX && a.seat?.y === seatY && isSeated(a));
      drawDesk(c, x, y, Boolean(user), time, user?.seed ?? 0, palette, user?.state === "blocked");
      break;
    }
    case "coffee":
      rect(c, "#374151", x, y + 2, 32, 14);
      rect(c, "#6b7280", x, y + 2, 32, 2);
      rect(c, OUTLINE, x + 4, y - 9, 15, 15);
      rect(c, "#27272a", x + 5, y - 8, 13, 13);
      rect(c, Math.floor(time * 2) % 2 ? "#ef4444" : "#7f1d1d", x + 15, y - 6, 2, 2);
      rect(c, "#52525b", x + 7, y - 6, 6, 4);
      rect(c, "#f3f4f6", x + 8, y + 3, 5, 4);
      rect(c, "#f3f4f6", x + 23, y - 1, 5, 5);
      rect(c, "#92400e", x + 24, y, 3, 1);
      for (let i = 0; i < 3; i++) {
        c.fillStyle = "rgba(255,255,255,0.5)";
        c.fillRect(x + 9 + Math.round(Math.sin(time * 2 + i) * 1.5), y - 1 - ((time * 8 + i * 4) % 9), 1, 2);
      }
      break;
    case "water":
      rect(c, "#d1d5db", x + 3, y + 3, 10, 13);
      rect(c, "#9ca3af", x + 3, y + 14, 10, 2);
      rect(c, "#60a5fa", x + 4, y - 8, 8, 11);
      rect(c, "#bae6fd", x + 5, y - 7, 2, 9);
      rect(c, "#3b82f6", x + 5, y + 6, 2, 2);
      rect(c, "#ef4444", x + 9, y + 6, 2, 2);
      if (Math.floor(time * 0.4 + item.x) % 5 === 0) rect(c, "#e0f2fe", x + 8, y - 2 - ((time * 6) % 7), 1, 1);
      break;
    case "sofa":
      rect(c, shade(palette.primary, -60), x + 1, y - 7, 46, 11);
      rect(c, shade(palette.primary, -30), x + 2, y - 6, 44, 3);
      rect(c, "#4b5563", x, y + 3, 48, 11);
      rect(c, "#6b7280", x + 3, y + 3, 20, 7);
      rect(c, "#6b7280", x + 25, y + 3, 20, 7);
      rect(c, "#374151", x, y + 12, 48, 3);
      rect(c, "#374151", x - 1, y - 2, 4, 16);
      rect(c, "#374151", x + 45, y - 2, 4, 16);
      break;
    case "plant":
      rect(c, "#92400e", x + 4, y + 9, 8, 7);
      rect(c, "#b45309", x + 3, y + 8, 10, 2);
      for (const [lx, ly, lw, lh] of [[6, -3, 4, 11], [2, 0, 5, 6], [9, 1, 5, 6], [4, -6, 3, 6], [9, -5, 3, 5]] as const) rect(c, "#15803d", x + lx, y + ly, lw, lh);
      rect(c, "#22c55e", x + 7, y - 3, 2, 8);
      rect(c, "#22c55e", x + 3, y + 1, 2, 3);
      rect(c, "#4ade80", x + 10, y - 4, 1, 3);
      break;
    case "fern":
      rect(c, "#57534e", x + 3, y + 10, 10, 6);
      rect(c, "#78716c", x + 2, y + 9, 12, 2);
      for (let i = 0; i < 7; i++) {
        const lean = i - 3;
        for (let j = 0; j < 5; j++) rect(c, j % 2 ? "#16a34a" : "#15803d", x + 7 + lean * (j / 2 + 1), y + 8 - j * 2 + Math.abs(lean), 2, 2);
      }
      break;
    case "board":
      drawBoard(c, x, y, world);
      break;
    case "whiteboard":
      rect(c, "#9ca3af", x, y - 10, 48, 22);
      rect(c, "#f9fafb", x + 2, y - 8, 44, 18);
      rect(c, "#3b82f6", x + 5, y - 5, 14, 1); rect(c, "#3b82f6", x + 5, y - 2, 9, 1);
      rect(c, "#ef4444", x + 24, y - 6, 8, 6); rect(c, "#f9fafb", x + 25, y - 5, 6, 4);
      rect(c, "#10b981", x + 8, y + 3, 20, 1); rect(c, "#10b981", x + 27, y + 2, 1, 3);
      rect(c, "#6b7280", x + 2, y + 10, 44, 2);
      break;
    case "shelf":
      rect(c, "#5b3a21", x, y - 12, 32, 28);
      for (let shelf = 0; shelf < 2; shelf++) {
        rect(c, "#3b2413", x + 2, y - 10 + shelf * 13, 28, 11);
        for (let book = 0; book < 8; book++) {
          const color = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"][(book * 3 + shelf + item.x) % 5] as string;
          rect(c, color, x + 3 + book * 3, y - 8 + shelf * 13 + (book % 3), 2, 9 - (book % 3));
          rect(c, shade(color, 40), x + 3 + book * 3, y - 6 + shelf * 13, 2, 1);
        }
      }
      break;
    case "server":
      rect(c, OUTLINE, x, y - 13, 16, 29);
      rect(c, "#1f2937", x + 1, y - 12, 14, 27);
      for (let i = 0; i < 5; i++) {
        rect(c, "#111827", x + 2, y - 11 + i * 5, 12, 4);
        const on = Math.floor(time * 3 + i * 2 + item.x) % 3 !== 0;
        rect(c, on ? "#22c55e" : "#14532d", x + 3, y - 10 + i * 5, 1, 1);
        rect(c, i % 2 === 0 ? "#f59e0b" : "#3b82f6", x + 5, y - 10 + i * 5, 1, 1);
        rect(c, "#374151", x + 8, y - 10 + i * 5, 5, 1);
      }
      break;
    case "table":
      rect(c, "#44403c", x + 2, y + 16, 44, 12);
      rect(c, "#78716c", x + 2, y + 3, 44, 14);
      rect(c, "#a8a29e", x + 2, y + 3, 44, 2);
      rect(c, "#f9fafb", x + 10, y + 6, 8, 6);
      rect(c, "#f9fafb", x + 28, y + 8, 8, 6);
      rect(c, "#1f2937", x + 12, y + 8, 4, 1);
      rect(c, "#3b82f6", x + 30, y + 10, 4, 1);
      break;
    case "rug":
      rect(c, palette.primary, x, y, 64, 48);
      c.fillStyle = "rgba(0,0,0,0.42)";
      c.fillRect(x + 3, y + 3, 58, 42);
      rect(c, palette.primary, x + 6, y + 6, 52, 1);
      rect(c, palette.primary, x + 6, y + 41, 52, 1);
      rect(c, palette.primary, x + 6, y + 6, 1, 36);
      rect(c, palette.primary, x + 57, y + 6, 1, 36);
      for (let i = 0; i < 6; i++) rect(c, palette.primary, x + 12 + i * 8, y + 22, 4, 4);
      break;
    case "arcade":
      rect(c, OUTLINE, x, y - 14, 16, 30);
      rect(c, "#4c1d95", x + 1, y - 13, 14, 28);
      rect(c, "#111827", x + 3, y - 10, 10, 9);
      rect(c, ["#22c55e", "#ec4899", "#38bdf8"][Math.floor(time * 2) % 3] as string, x + 4 + (Math.floor(time * 4) % 7), y - 8 + (Math.floor(time * 3) % 5), 2, 2);
      rect(c, "#f59e0b", x + 3, y - 13, 10, 2);
      rect(c, "#27272a", x + 2, y + 1, 12, 4);
      rect(c, "#ef4444", x + 4, y + 2, 2, 2);
      rect(c, "#3b82f6", x + 9, y + 2, 2, 2);
      break;
    case "fridge":
      rect(c, OUTLINE, x + 1, y - 12, 14, 28);
      rect(c, "#e5e7eb", x + 2, y - 11, 12, 26);
      rect(c, "#9ca3af", x + 2, y - 3, 12, 1);
      rect(c, "#6b7280", x + 11, y - 8, 1, 3);
      rect(c, "#6b7280", x + 11, y, 1, 5);
      rect(c, "#fde68a", x + 4, y - 9, 3, 3);
      rect(c, "#fca5a5", x + 5, y + 3, 3, 3);
      break;
    case "printer":
      rect(c, "#4b5563", x + 2, y + 8, 12, 8);
      rect(c, OUTLINE, x + 1, y - 2, 14, 11);
      rect(c, "#d1d5db", x + 2, y - 1, 12, 9);
      rect(c, "#f9fafb", x + 4, y - 5 - (Math.floor(time) % 4 === 0 ? 1 : 0), 8, 5);
      rect(c, "#22c55e", x + 11, y + 1, 2, 1);
      rect(c, "#9ca3af", x + 3, y + 5, 10, 1);
      break;
    case "lamp":
      rect(c, "#374151", x + 5, y + 13, 6, 3);
      rect(c, "#4b5563", x + 7, y - 4, 2, 17);
      rect(c, OUTLINE, x + 2, y - 10, 12, 8);
      rect(c, "#fde68a", x + 3, y - 9, 10, 6);
      rect(c, "#fef3c7", x + 4, y - 8, 4, 2);
      break;
    case "beanbag":
      rect(c, OUTLINE, x, y + 3, 16, 13);
      rect(c, shade(palette.primary, -50), x + 1, y + 4, 14, 11);
      rect(c, shade(palette.primary, -20), x + 3, y + 5, 8, 4);
      rect(c, "#00000040", x + 1, y + 13, 14, 2);
      break;
    case "tv":
      rect(c, "#3b2413", x + 2, y + 8, 44, 8);
      rect(c, "#5b3a21", x + 2, y + 8, 44, 2);
      rect(c, OUTLINE, x + 4, y - 14, 40, 22);
      rect(c, "#0b1120", x + 5, y - 13, 38, 20);
      for (let i = 0; i < 9; i++) {
        const h = 2 + ((i * 5 + Math.floor(time * 3)) % 12);
        rect(c, i % 3 === 0 ? palette.primary : i % 3 === 1 ? "#38bdf8" : "#f472b6", x + 8 + i * 4, y + 5 - h, 3, h);
      }
      break;
    case "vending":
      rect(c, OUTLINE, x, y - 14, 16, 30);
      rect(c, "#b91c1c", x + 1, y - 13, 14, 28);
      rect(c, "#0f172a", x + 3, y - 11, 8, 16);
      for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) rect(c, ["#fbbf24", "#34d399", "#60a5fa", "#f472b6"][(row + col * 2) % 4] as string, x + 4 + col * 3, y - 10 + row * 5, 2, 4);
      rect(c, "#d1d5db", x + 12, y - 9, 2, 6);
      rect(c, "#111827", x + 3, y + 8, 10, 4);
      break;
    case "trophy":
      rect(c, "#6b4427", x + 2, y + 8, 12, 8);
      rect(c, "#8a5a33", x + 2, y + 8, 12, 2);
      rect(c, "#78350f", x + 5, y + 5, 6, 3);
      rect(c, "#f59e0b", x + 7, y + 1, 2, 4);
      rect(c, OUTLINE, x + 3, y - 8, 10, 10);
      rect(c, "#fbbf24", x + 4, y - 7, 8, 8);
      rect(c, "#fde68a", x + 5, y - 6, 2, 5);
      rect(c, "#fbbf24", x + 1, y - 6, 3, 1); rect(c, "#fbbf24", x + 12, y - 6, 3, 1);
      break;
    case "clock": {
      rect(c, OUTLINE, x + 3, y + 1, 10, 10);
      rect(c, "#f9fafb", x + 4, y + 2, 8, 8);
      rect(c, "#1f2937", x + 8, y + 3, 1, 3);
      rect(c, "#1f2937", x + 8, y + 6, 3, 1);
      break;
    }
    case "poster": {
      const colors = ["#7c3aed", "#0ea5e9", "#db2777", "#059669"];
      const color = colors[(item.x + item.y) % colors.length] as string;
      rect(c, OUTLINE, x + 2, y, 12, 11);
      rect(c, color, x + 3, y + 1, 10, 9);
      rect(c, shade(color, 60), x + 5, y + 3, 6, 3);
      rect(c, "#f9fafb", x + 5, y + 7, 6, 1);
      break;
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
  c.fillText(`QUESTS ${done}/${world.tasks.length}`, 8, 6.5);
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

  const scene: { depth: number; draw: () => void }[] = [];
  for (const item of world.furniture) {
    const spec = FURNITURE[item.type];
    if (spec.solid === false) continue;
    scene.push({ depth: (item.y + spec.h) * TILE - 2, draw: () => drawFurniture(c, item, world, time, palette) });
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
    for (const item of world.furniture) {
      if (item.type === "lamp") glow(item.x * TILE + 8, item.y * TILE, 36, "rgba(253,224,139,0.30)");
      if (item.type === "arcade" || item.type === "vending" || item.type === "tv") glow(item.x * TILE + 8, item.y * TILE, 26, "rgba(125,211,252,0.16)");
      if (item.type === "desk" && world.agents.some((a) => a.seat?.x === item.x + 1 && a.seat?.y === item.y + 2 && isSeated(a))) {
        glow(item.x * TILE + 24, item.y * TILE + 8, 30, "rgba(125,211,252,0.26)");
      }
    }
    c.restore();
  }

  // On top, so tall furniture against a wall can't hide a room's name.
  drawLabels(c, world);
  for (const agent of shown) nameTag(c, agent, agent.id === selected, width);
  for (const agent of shown) if (agent.id !== selected) drawStatus(c, agent, time);
  drawProgress(c, world, palette);
  const picked = shown.find((agent) => agent.id === selected);
  if (picked) drawCard(c, picked, world);
}
