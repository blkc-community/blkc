/**
 * What a world grows from a project: which special rooms it has, what goes in them, and what a
 * folder's room looks like. The growing itself is the same for every world.
 */

export type RoomRole = "lobby" | "lounge" | "quests" | "vacant" | "hall";

export interface Theme { floor: string; items: string[]; decor: string[] }

/** One furnishing step, run in order. `top` falls back to anywhere in the room; `center` doesn't. */
export type FurnishStep = { scatter: string } | { wall: string } | { place: string; at: "center" | "top" };

export interface WorldPlan {
  id: string;
  /** Footprint in tiles, and where someone stands to use it. */
  footprint: Record<string, { w: number; h: number; spot?: [number, number]; solid?: boolean }>;
  /** Always there. The first is where the map starts. */
  specials: { id: string; name: string; role: RoomRole; floor: string; w: number; h: number }[];
  furnishing: Partial<Record<RoomRole, FurnishStep[]>>;
  /** What a folder's room is filled with, one for each few files. */
  workstation: string;
  /** Matched against a folder's own name. */
  themes: { match: RegExp; theme: Theme }[];
  fallback: Theme & { floors: string[] };
  /** For the biggest rooms. */
  filler: [string, string];
}

/** The office, and the world used when a map doesn't name one. */
export const OFFICE_PLAN: WorldPlan = {
  id: "office",
  footprint: {
    desk: { w: 3, h: 2, spot: [1, 2] }, coffee: { w: 2, h: 1, spot: [0, 1] }, water: { w: 1, h: 1, spot: [0, 1] }, sofa: { w: 3, h: 1, spot: [1, 1] },
    plant: { w: 1, h: 1 }, fern: { w: 1, h: 1 }, board: { w: 4, h: 1, spot: [1, 1] }, whiteboard: { w: 3, h: 1, spot: [1, 1] }, shelf: { w: 2, h: 1, spot: [0, 1] },
    server: { w: 1, h: 1 }, table: { w: 3, h: 2, spot: [1, 2] }, rug: { w: 4, h: 3, solid: false }, printer: { w: 1, h: 1, spot: [0, 1] }, lamp: { w: 1, h: 1 },
    beanbag: { w: 1, h: 1, spot: [0, 1] }, vending: { w: 1, h: 1, spot: [0, 1] }, fridge: { w: 1, h: 1, spot: [0, 1] }, arcade: { w: 1, h: 1, spot: [0, 1] },
  },
  specials: [
    { id: "lobby", name: "Lobby", role: "lobby", floor: "stone", w: 9, h: 6 },
    { id: "lounge", name: "Lounge", role: "lounge", floor: "carpet", w: 10, h: 6 },
    { id: "quests", name: "Quests", role: "quests", floor: "tile", w: 9, h: 6 },
  ],
  furnishing: {
    lobby: [{ place: "rug", at: "center" }, { scatter: "plant" }, { scatter: "fern" }, { scatter: "lamp" }, { wall: "clock" }, { wall: "poster" }],
    lounge: [{ scatter: "coffee" }, { scatter: "water" }, { scatter: "sofa" }, { scatter: "fridge" }, { scatter: "plant" }, { scatter: "beanbag" }, { scatter: "lamp" }, { wall: "poster" }],
    quests: [{ place: "board", at: "top" }, { scatter: "table" }, { scatter: "whiteboard" }, { scatter: "plant" }, { wall: "clock" }],
    vacant: [{ scatter: "plant" }, { scatter: "shelf" }],
  },
  workstation: "desk",
  themes: [
    { match: /doc|guide|wiki|spec|readme|manual/, theme: { floor: "carpet", items: ["shelf", "shelf", "lamp"], decor: ["poster", "clock"] } },
    { match: /test|spec|e2e|qa|fixture/, theme: { floor: "tile", items: ["whiteboard", "printer"], decor: ["clock", "poster"] } },
    { match: /api|server|backend|service|worker|core|engine|kernel/, theme: { floor: "concrete", items: ["server", "server", "server", "printer"], decor: ["clock"] } },
    { match: /db|data|migrat|schema|model|store|sql|supabase/, theme: { floor: "stone", items: ["server", "server", "shelf"], decor: ["clock"] } },
    { match: /ui|web|front|client|component|page|view|style|site|app/, theme: { floor: "wood", items: ["fern", "lamp", "beanbag"], decor: ["poster", "poster"] } },
    { match: /asset|public|image|media|static|font|icon/, theme: { floor: "grass", items: ["plant", "fern", "plant"], decor: [] } },
    { match: /script|tool|ci|github|infra|deploy|ops|docker|bin/, theme: { floor: "stone", items: ["server", "printer", "whiteboard"], decor: ["clock"] } },
    { match: /kit|block|circuit|plugin|ext|module|package/, theme: { floor: "carpet", items: ["whiteboard", "shelf"], decor: ["poster"] } },
  ],
  fallback: { floor: "", floors: ["wood", "carpet", "tile", "stone", "concrete"], items: ["plant", "shelf", "lamp"], decor: ["poster"] },
  filler: ["plant", "fern"],
};

const plans = new Map<string, WorldPlan>([[OFFICE_PLAN.id, OFFICE_PLAN]]);

export function registerWorldPlan(plan: WorldPlan): void {
  plans.set(plan.id, plan);
}

export const worldPlan = (id: string | undefined): WorldPlan => (id && plans.get(id)) || OFFICE_PLAN;
