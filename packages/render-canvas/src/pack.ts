/**
 * What makes one world different from another. The engine handles walking, seats, time of day
 * and agents, for any world. A world brings this data, plus a painter (see registerPainter).
 */

import type { OfficeLayout } from "./types.js";

export interface ItemSpec {
  w: number;
  h: number;
  solid?: boolean;
  wall?: boolean;
  /** Where someone stands to use it, relative to its corner. */
  spot?: { x: number; y: number };
  /** seat: where an agent works. lounge: where it rests. board: where it reviews. */
  use?: "seat" | "lounge" | "board";
}

export interface WorldData {
  id: string;
  name: string;
  words: {
    /** The progress label over the map. */
    quests: string;
  };
  items: Record<string, ItemSpec>;
  layout: Required<Pick<OfficeLayout, "cols" | "rows" | "rooms" | "doors" | "furniture">>;
}

const worlds = new Map<string, WorldData>();

export function registerWorld(data: WorldData): void {
  worlds.set(data.id, data);
}

export const worldData = (id: string | undefined, fallback: WorldData): WorldData => (id && worlds.get(id)) || fallback;
