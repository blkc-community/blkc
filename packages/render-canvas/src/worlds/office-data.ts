/** The office as data: what furniture exists, how big it is, what it's for, and what things are called. */

import type { WorldData } from "../pack.js";
import type { OfficeDoor, OfficeFurniture, OfficeRoom } from "../types.js";

/** Footprint in tiles, and where someone stands to use it, relative to its corner. */
export const OFFICE_ITEMS: WorldData["items"] = {
  desk: { w: 3, h: 2, spot: { x: 1, y: 2 }, use: "seat" },
  coffee: { w: 2, h: 1, spot: { x: 0, y: 1 }, use: "lounge" },
  water: { w: 1, h: 1, spot: { x: 0, y: 1 }, use: "lounge" },
  sofa: { w: 3, h: 1, spot: { x: 1, y: 1 }, use: "lounge" },
  plant: { w: 1, h: 1 },
  fern: { w: 1, h: 1 },
  board: { w: 4, h: 1, spot: { x: 1, y: 1 }, use: "board" },
  whiteboard: { w: 3, h: 1, spot: { x: 1, y: 1 }, use: "board" },
  shelf: { w: 2, h: 1, spot: { x: 0, y: 1 }, use: "lounge" },
  server: { w: 1, h: 1 },
  table: { w: 3, h: 2, spot: { x: 1, y: 2 }, use: "board" },
  rug: { w: 4, h: 3, solid: false },
  arcade: { w: 1, h: 1, spot: { x: 0, y: 1 }, use: "lounge" },
  fridge: { w: 1, h: 1, spot: { x: 0, y: 1 }, use: "lounge" },
  printer: { w: 1, h: 1, spot: { x: 0, y: 1 } },
  lamp: { w: 1, h: 1 },
  beanbag: { w: 1, h: 1, spot: { x: 0, y: 1 }, use: "lounge" },
  tv: { w: 3, h: 1, spot: { x: 1, y: 2 }, use: "lounge" },
  vending: { w: 1, h: 1, spot: { x: 0, y: 1 }, use: "lounge" },
  trophy: { w: 1, h: 1 },
  clock: { w: 1, h: 1, solid: false, wall: true },
  poster: { w: 1, h: 1, solid: false, wall: true },
};

export const OFFICE_LAYOUT = {
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

export const OFFICE: WorldData = {
  id: "office",
  name: "Pixel Office",
  words: { quests: "QUESTS" },
  items: OFFICE_ITEMS,
  layout: OFFICE_LAYOUT,
};
