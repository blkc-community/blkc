/**
 * How the office looks. Every piece of art here is original to this project, made in code at
 * 16 pixels a tile.
 */

import { OUTLINE, TILE, rect, shade, type Ctx, type Palette } from "../paint.js";
import { isSeated, type Item, type World } from "../world.js";

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

export const OFFICE_PAINTER = {
  furniture: drawFurniture,
  glow(item: Item, world: World, glow: (x: number, y: number, radius: number, color: string) => void): void {
  if (item.type === "lamp") glow(item.x * TILE + 8, item.y * TILE, 36, "rgba(253,224,139,0.30)");
  if (item.type === "arcade" || item.type === "vending" || item.type === "tv") glow(item.x * TILE + 8, item.y * TILE, 26, "rgba(125,211,252,0.16)");
  if (item.type === "desk" && world.agents.some((a) => a.seat?.x === item.x + 1 && a.seat?.y === item.y + 2 && isSeated(a))) {
    glow(item.x * TILE + 24, item.y * TILE + 8, 30, "rgba(125,211,252,0.26)");
  }
  },
};
