/**
 * Draws the office. Every piece of art here is original to this project, made of
 * rectangles and the character maps below at 16 pixels a tile.
 */

import { FURNITURE, isSeated, type Agent, type Item, type Room, type World } from "./world.js";

export const TILE = 16;

export interface Palette { primary: string; background: string; text: string; accent: string }

type Ctx = CanvasRenderingContext2D;

const rect = (c: Ctx, color: string, x: number, y: number, w: number, h: number): void => {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
};

// --- Characters: 12 wide. h hair, s skin, e eye, t shirt, T shirt shadow, l legs, b shoes -----------------

const HEAD_FRONT = ["...hhhhhh...", "..hhhhhhhh..", "..hhhhhhhh..", "..hssssssh..", "..ssessess..", "..ssssssss..", "...ssssss..."];
const HEAD_BACK = ["...hhhhhh...", "..hhhhhhhh..", "..hhhhhhhh..", "..hhhhhhhh..", "..hhhhhhhh..", "..hhhhhhhh..", "...ssssss..."];
const HEAD_SIDE = ["...hhhhhh...", "..hhhhhhhh..", "..hhhhhhhh..", "..hhssssss..", "..hhsssess..", "..hsssssss..", "...ssssss..."];
const BODY = ["..tttttttt..", ".tttttttttt.", ".stttttttts.", ".stTTTTTTts."];
const BODY_SIDE = ["...tttttt...", "...tttttt...", "...ttsttt...", "...TTsTTT..."];
const LEGS_STAND = ["..llllllll..", "..lll..lll..", "..lll..lll..", "..bbb..bbb.."];
const LEGS_A = ["..llllllll..", "..lll..lll..", "..bbb..lll..", ".......bbb.."];
const LEGS_B = ["..llllllll..", "..lll..lll..", "..lll..bbb..", "..bbb......."];
const LEGS_SIDE_STAND = ["...llllll...", "...lll.lll..", "...lll.lll..", "...bbb.bbb.."];
const LEGS_SIDE_A = ["...llllll...", "..lll..lll..", ".lll....lll.", ".bb......bb."];
const LEGS_SIDE_B = ["...llllll...", "...llllll...", "....llll....", "....bbbb...."];

function drawMap(c: Ctx, map: string[], x: number, y: number, colors: Record<string, string>, flip = false): void {
  map.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const key = row[flip ? row.length - 1 - rx : rx] as string;
      const color = colors[key];
      if (color) rect(c, color, x + rx, y + ry, 1, 1);
    }
  });
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1).padEnd(6, hex.slice(-1)), 16);
  const channel = (shift: number): number => Math.max(0, Math.min(255, ((n >> shift) & 255) + amount));
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}

function drawAgent(c: Ctx, agent: Agent, time: number, selected: boolean): void {
  const px = agent.x * TILE + 2;
  const seated = isSeated(agent);
  const colors = { h: agent.hair, s: agent.skin, e: "#1a1a24", t: agent.shirt, T: shade(agent.shirt, -36), l: "#39415a", b: "#1f2433" };
  const stride = Math.floor(time * 8 + agent.seed) % 2 === 0;
  const breathe = !agent.walking && Math.floor(time * 1.5 + agent.seed % 7) % 2 === 0 ? 1 : 0;
  const height = seated ? 11 : 15;
  // Seated people sit just in front of the desk, on a chair, with their heads clear of the keyboard.
  const py = agent.y * TILE + (seated ? 6 : -1) - (agent.walking && stride ? 1 : 0);

  if (seated) {
    rect(c, "#1f2937", px + 1, agent.y * TILE + 3, 10, 9);
    rect(c, "#374151", px + 2, agent.y * TILE + 11, 8, 3);
    rect(c, "#111827", px + 5, agent.y * TILE + 14, 2, 2);
  }

  // Shadow
  c.fillStyle = "rgba(0,0,0,0.25)";
  c.fillRect(Math.round(px + 2), Math.round(agent.y * TILE + 14), 8, 2);

  if (selected) {
    c.fillStyle = "rgba(255,255,255,0.28)";
    c.fillRect(Math.round(px - 1), Math.round(agent.y * TILE + 13), 14, 4);
  }

  const side = agent.facing === "left" || agent.facing === "right";
  const head = side ? HEAD_SIDE : agent.facing === "up" ? HEAD_BACK : HEAD_FRONT;
  const body = side ? BODY_SIDE : BODY;
  const legs = !agent.walking
    ? side ? LEGS_SIDE_STAND : LEGS_STAND
    : side ? (stride ? LEGS_SIDE_A : LEGS_SIDE_B) : stride ? LEGS_A : LEGS_B;
  const flip = agent.facing === "left";

  drawMap(c, head, px, py - height + breathe * 0, colors, flip);
  drawMap(c, body, px, py - height + head.length, colors, flip);
  if (!seated) drawMap(c, legs, px, py - height + head.length + body.length, colors, flip);
  else if (agent.state === "working") {
    // Hands on the keys.
    const typing = Math.floor(time * 9 + agent.seed) % 2;
    rect(c, agent.skin, px + 1 + typing, py - height + head.length + 3, 1, 1);
    rect(c, agent.skin, px + 10 - (1 - typing), py - height + head.length + 3, 1, 1);
  }
}

function bubble(c: Ctx, x: number, y: number, draw: (x: number, y: number) => void): void {
  rect(c, "#111827", x - 1, y - 1, 13, 11);
  rect(c, "#ffffff", x, y, 11, 9);
  rect(c, "#ffffff", x + 4, y + 9, 3, 1);
  rect(c, "#111827", x + 4, y + 10, 3, 1);
  draw(x, y);
}

function drawStatus(c: Ctx, agent: Agent, time: number): void {
  const x = Math.round(agent.x * TILE + 2);
  const y = Math.round(agent.y * TILE - 26 + (isSeated(agent) ? 8 : 0));
  const pulse = Math.floor(time * 2 + agent.seed % 3) % 2 === 0;
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
  }
}

// --- The room -------------------------------------------------------------------------------------------

function drawFloor(c: Ctx, room: Room, palette: Palette): void {
  for (let ty = room.y; ty < room.y + room.h; ty++) {
    for (let tx = room.x; tx < room.x + room.w; tx++) {
      const x = tx * TILE;
      const y = ty * TILE;
      if (room.floor === "carpet") {
        rect(c, "#4c4f7a", x, y, TILE, TILE);
        for (let i = 0; i < 6; i++) rect(c, "#55588a", x + ((tx * 7 + i * 5) % 15), y + ((ty * 3 + i * 7) % 15), 1, 1);
      } else if (room.floor === "tile") {
        rect(c, (tx + ty) % 2 === 0 ? "#cfd8e3" : "#bcc7d4", x, y, TILE, TILE);
        rect(c, "#aab5c2", x, y + 15, TILE, 1);
        rect(c, "#aab5c2", x + 15, y, 1, TILE);
      } else {
        rect(c, "#a06f45", x, y, TILE, TILE);
        const offset = ty % 2 === 0 ? 0 : 8;
        rect(c, "#8f6039", x, y + 7, TILE, 1);
        rect(c, "#8f6039", x, y + 15, TILE, 1);
        rect(c, "#8f6039", x + ((offset + tx * 8) % 16), y, 1, 7);
        rect(c, "#ad7c52", x + 3, y + 3, 4, 1);
      }
    }
  }
  void palette;
}

const WALL_TOP = "#2f3350";
const WALL_FACE = "#565c86";
const WALL_LINE = "#454a70";

function drawWalls(c: Ctx, world: World, palette: Palette): void {
  const open = new Set<string>();
  for (const room of world.rooms) {
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) open.add(`${x},${y}`);
  }
  for (const door of world.doors) open.add(`${door.x},${door.y}`);

  for (let ty = 0; ty < world.rows; ty++) {
    for (let tx = 0; tx < world.cols; tx++) {
      if (open.has(`${tx},${ty}`)) continue;
      const x = tx * TILE;
      const y = ty * TILE;
      const faceBelow = open.has(`${tx},${ty + 1}`);
      if (faceBelow) {
        // The wall's front, with a band in the Kit's colour and a window every few tiles.
        rect(c, WALL_FACE, x, y, TILE, TILE);
        rect(c, WALL_LINE, x, y + 13, TILE, 3);
        rect(c, palette.primary, x, y + 12, TILE, 1);
        if (tx % 4 === 3 && ty <= 3) {
          rect(c, "#1f2937", x + 1, y + 1, 14, 9);
          rect(c, "#8ed0ff", x + 2, y + 2, 12, 7);
          rect(c, "#bfe6ff", x + 3, y + 3, 4, 2);
          rect(c, "#1f2937", x + 8, y + 2, 1, 7);
        }
      } else {
        rect(c, WALL_TOP, x, y, TILE, TILE);
      }
    }
  }
  for (const door of world.doors) {
    rect(c, "#6b4a2f", door.x * TILE, door.y * TILE, TILE, TILE);
    rect(c, "#7c5637", door.x * TILE + 2, door.y * TILE, 12, TILE);
  }
}

function drawDesk(c: Ctx, x: number, y: number, on: boolean, time: number, seed: number, palette: Palette): void {
  rect(c, "#6b4427", x + 1, y + 13, 46, 17);
  rect(c, "#8a5a33", x + 1, y + 11, 46, 11);
  rect(c, "#a06c3f", x + 1, y + 11, 46, 2);
  rect(c, "#4a2e1a", x + 3, y + 22, 3, 9);
  rect(c, "#4a2e1a", x + 42, y + 22, 3, 9);
  // Monitor
  rect(c, "#111827", x + 15, y - 1, 18, 13);
  rect(c, "#374151", x + 22, y + 12, 4, 2);
  if (on) {
    rect(c, "#0f2a2e", x + 16, y, 16, 11);
    const scroll = Math.floor(time * 3 + seed % 13);
    for (let line = 0; line < 4; line++) {
      const width = 3 + ((seed >> line) + (scroll + line) * 7) % 11;
      rect(c, line % 2 === 0 ? palette.primary : "#7dd3fc", x + 17, y + 1 + line * 2.5, width, 1);
    }
    c.fillStyle = "rgba(125,211,252,0.10)";
    c.fillRect(x + 11, y + 11, 26, 8);
  } else {
    rect(c, "#1f2937", x + 16, y, 16, 11);
    rect(c, "#374151", x + 18, y + 2, 3, 1);
  }
  // Keyboard and mug
  rect(c, "#d1d5db", x + 17, y + 15, 14, 4);
  rect(c, "#9ca3af", x + 18, y + 16, 12, 1);
  rect(c, "#f3f4f6", x + 38, y + 14, 4, 4);
  rect(c, palette.primary, x + 38, y + 16, 4, 1);
}

function drawBoard(c: Ctx, x: number, y: number, world: World): void {
  rect(c, "#2b2118", x, y - 11, 64, 26);
  rect(c, "#d9c29c", x + 2, y - 9, 60, 22);
  const colors = { todo: "#fde68a", doing: "#93c5fd", done: "#86efac" };
  const per = 8;
  world.tasks.slice(0, per * 2).forEach((task, index) => {
    const col = index % per;
    const row = Math.floor(index / per);
    rect(c, "#00000033", x + 5 + col * 7, y - 6 + row * 9, 6, 7);
    rect(c, colors[task.state], x + 4 + col * 7, y - 7 + row * 9, 6, 7);
    rect(c, "#00000040", x + 5 + col * 7, y - 5 + row * 9, 4, 1);
  });
}

function drawFurniture(c: Ctx, item: Item, world: World, time: number, palette: Palette): void {
  const x = item.x * TILE;
  const y = item.y * TILE;
  switch (item.type) {
    case "desk": {
      const seatX = item.x + 1;
      const seatY = item.y + 2;
      const user = world.agents.find((a) => a.seat?.x === seatX && a.seat?.y === seatY && isSeated(a) && a.state !== "blocked");
      drawDesk(c, x, y, Boolean(user), time, user?.seed ?? 0, palette);
      break;
    }
    case "coffee":
      rect(c, "#374151", x, y + 2, 32, 14);
      rect(c, "#6b7280", x, y + 2, 32, 2);
      rect(c, "#111827", x + 4, y - 8, 14, 14);
      rect(c, "#ef4444", x + 15, y - 5, 2, 2);
      rect(c, "#f3f4f6", x + 8, y + 3, 5, 4);
      rect(c, "#f3f4f6", x + 22, y - 1, 5, 5);
      for (let i = 0; i < 3; i++) {
        c.fillStyle = "rgba(255,255,255,0.45)";
        c.fillRect(x + 9 + Math.round(Math.sin(time * 2 + i) * 1.5), y - 1 - ((time * 8 + i * 4) % 9), 1, 2);
      }
      break;
    case "water":
      rect(c, "#e5e7eb", x + 3, y + 3, 10, 13);
      rect(c, "#7dd3fc", x + 4, y - 7, 8, 10);
      rect(c, "#bae6fd", x + 5, y - 6, 2, 8);
      rect(c, "#3b82f6", x + 5, y + 6, 2, 2);
      break;
    case "sofa":
      rect(c, palette.primary, x + 1, y - 6, 46, 9);
      rect(c, "#00000030", x + 1, y + 1, 46, 2);
      rect(c, "#4b5563", x, y + 3, 48, 11);
      rect(c, "#6b7280", x + 3, y + 3, 20, 7);
      rect(c, "#6b7280", x + 25, y + 3, 20, 7);
      rect(c, "#374151", x, y + 12, 48, 3);
      break;
    case "plant":
      rect(c, "#92400e", x + 4, y + 9, 8, 7);
      rect(c, "#b45309", x + 3, y + 8, 10, 2);
      for (const [lx, ly, lw, lh] of [[6, -3, 4, 11], [2, 0, 5, 6], [9, 1, 5, 6], [4, -6, 3, 6], [9, -5, 3, 5]] as const) {
        rect(c, "#15803d", x + lx, y + ly, lw, lh);
      }
      rect(c, "#22c55e", x + 7, y - 3, 2, 8);
      rect(c, "#22c55e", x + 3, y + 1, 2, 3);
      break;
    case "board":
      drawBoard(c, x, y, world);
      break;
    case "shelf":
      rect(c, "#5b3a21", x, y - 12, 32, 28);
      for (let shelf = 0; shelf < 2; shelf++) {
        rect(c, "#3b2413", x + 2, y - 10 + shelf * 13, 28, 11);
        for (let book = 0; book < 8; book++) {
          const color = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"][(book * 3 + shelf) % 5] as string;
          rect(c, color, x + 3 + book * 3, y - 8 + shelf * 13 + (book % 3), 2, 9 - (book % 3));
        }
      }
      break;
    case "server":
      rect(c, "#111827", x + 1, y - 12, 14, 28);
      for (let i = 0; i < 5; i++) {
        rect(c, "#1f2937", x + 2, y - 11 + i * 5, 12, 4);
        const on = Math.floor(time * 3 + i * 2 + item.x) % 3 !== 0;
        rect(c, on ? "#22c55e" : "#14532d", x + 3, y - 10 + i * 5, 1, 1);
        rect(c, i % 2 === 0 ? "#f59e0b" : "#3b82f6", x + 5, y - 10 + i * 5, 1, 1);
      }
      break;
    case "table":
      rect(c, "#57534e", x + 2, y + 14, 44, 14);
      rect(c, "#78716c", x + 2, y + 3, 44, 14);
      rect(c, "#a8a29e", x + 2, y + 3, 44, 2);
      rect(c, "#f9fafb", x + 10, y + 6, 8, 6);
      rect(c, "#f9fafb", x + 28, y + 8, 8, 6);
      break;
    case "rug":
      rect(c, palette.primary, x, y, 64, 48);
      c.fillStyle = "rgba(0,0,0,0.35)";
      c.fillRect(x + 3, y + 3, 58, 42);
      rect(c, palette.primary, x + 6, y + 6, 52, 1);
      rect(c, palette.primary, x + 6, y + 41, 52, 1);
      break;
  }
  void FURNITURE;
}

function drawLabels(c: Ctx, world: World): void {
  c.font = "bold 7px ui-monospace, Menlo, Consolas, monospace";
  c.textBaseline = "top";
  for (const room of world.rooms) {
    if (!room.name) continue;
    const label = room.name.toUpperCase();
    // On the wall above the room, clear of the furniture.
    const x = room.x * TILE + 3;
    const y = room.y * TILE - 12;
    c.fillStyle = "rgba(0,0,0,0.45)";
    c.fillText(label, x + 1, y + 1);
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.fillText(label, x, y);
  }
}

function nameTag(c: Ctx, agent: Agent, selected: boolean, width: number): void {
  const name = agent.name;
  c.font = "bold 7px ui-monospace, Menlo, Consolas, monospace";
  c.textBaseline = "top";
  const w = Math.ceil(c.measureText(name).width) + 5;
  const cx = agent.x * TILE + 8;
  const x = Math.round(Math.max(1, Math.min(width - w - 1, cx - w / 2)));
  const y = Math.round(agent.y * TILE + 15);
  c.fillStyle = selected ? "#ffffff" : "rgba(17,24,39,0.82)";
  c.fillRect(x, y, w, 10);
  c.fillStyle = selected ? "#111827" : "#ffffff";
  c.fillText(name, x + 2.5, y + 1.5);
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

function drawCard(c: Ctx, agent: Agent, width: number): void {
  c.font = "7px ui-monospace, Menlo, Consolas, monospace";
  c.textBaseline = "top";
  const body = wrap(c, agent.task || STATE_LABEL[agent.state] || "", 104);
  const w = 114;
  const h = 18 + body.length * 9 + 3;
  const x = Math.round(Math.max(2, Math.min(width - w - 2, agent.x * TILE + 8 - w / 2)));
  const y = Math.round(Math.max(2, agent.y * TILE - h - 22));
  rect(c, "#111827", x - 1, y - 1, w + 2, h + 2);
  rect(c, "#ffffff", x, y, w, h);
  c.fillStyle = "#111827";
  c.font = "bold 7px ui-monospace, Menlo, Consolas, monospace";
  c.fillText(`${agent.name}: ${STATE_LABEL[agent.state] ?? ""}`.slice(0, 26), x + 4, y + 4);
  c.fillStyle = "#374151";
  c.font = "7px ui-monospace, Menlo, Consolas, monospace";
  body.forEach((line, index) => c.fillText(line, x + 4, y + 15 + index * 9));
}

function drawProgress(c: Ctx, world: World, palette: Palette): void {
  if (world.tasks.length === 0) return;
  const done = world.tasks.filter((task) => task.state === "done").length;
  const label = `QUESTS ${done}/${world.tasks.length}`;
  c.font = "bold 7px ui-monospace, Menlo, Consolas, monospace";
  c.textBaseline = "top";
  const w = 96;
  rect(c, "rgba(17,24,39,0.85)", 4, 4, w, 20);
  c.fillStyle = "#ffffff";
  c.fillText(label, 8, 6.5);
  rect(c, "#374151", 8, 16, w - 8, 4);
  rect(c, palette.primary, 8, 16, Math.round(((w - 8) * done) / world.tasks.length), 4);
}

export function drawWorld(c: Ctx, world: World, time: number, palette: Palette, selected?: string): void {
  const width = world.cols * TILE;
  rect(c, WALL_TOP, 0, 0, width, world.rows * TILE);
  for (const room of world.rooms) drawFloor(c, room, palette);
  drawWalls(c, world, palette);

  // Flat things first, then everything else in depth order so people pass behind desks.
  for (const item of world.furniture) if (item.type === "rug") drawFurniture(c, item, world, time, palette);
  const scene: { depth: number; draw: () => void }[] = [];
  for (const item of world.furniture) {
    if (item.type === "rug") continue;
    scene.push({ depth: (item.y + FURNITURE[item.type].h) * TILE - 2, draw: () => drawFurniture(c, item, world, time, palette) });
  }
  const shown = world.agents.filter((agent) => agent.state !== "away");
  for (const agent of shown) {
    scene.push({ depth: agent.y * TILE + 14, draw: () => drawAgent(c, agent, time, agent.id === selected) });
  }
  scene.sort((a, b) => a.depth - b.depth);
  for (const item of scene) item.draw();

  drawLabels(c, world);
  for (const agent of shown) nameTag(c, agent, agent.id === selected, width);
  for (const agent of shown) if (agent.id !== selected) drawStatus(c, agent, time);
  drawProgress(c, world, palette);
  const picked = shown.find((agent) => agent.id === selected);
  if (picked) drawCard(c, picked, width);
}
