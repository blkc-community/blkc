/** What a Kit writes to describe an office. All of it is plain JSON. */

export type AgentState = "working" | "thinking" | "blocked" | "reviewing" | "idle" | "done" | "away";
export type TaskState = "todo" | "doing" | "done";
export type FloorStyle = "wood" | "carpet" | "tile" | "stone" | "concrete" | "grass" | "hall";
export type OfficeFurnitureType =
  | "desk" | "coffee" | "sofa" | "plant" | "fern" | "board" | "whiteboard" | "shelf" | "server" | "table" | "rug"
  | "water" | "arcade" | "fridge" | "printer" | "lamp" | "beanbag" | "tv" | "vending" | "clock" | "poster" | "trophy";

/** An office item, or whatever else the world defines. */
export type FurnitureType = OfficeFurnitureType | (string & {});

export interface OfficeRoom {
  id?: string;
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floor?: FloorStyle;
  /** Project folders this room stands for, so agents go there when they work in them. */
  paths?: string[];
}
export interface OfficeDoor { x: number; y: number }
export interface OfficeFurniture { type: FurnitureType; x: number; y: number }
export interface OfficeAgent {
  id: string;
  name?: string;
  role?: string;
  state?: AgentState;
  task?: string;
  /** The id of the room this agent is working in. */
  area?: string;
  /** Character colours. Anything left out is picked from the id. */
  hair?: string;
  skin?: string;
  shirt?: string;
}
export interface OfficeTask { title: string; state?: TaskState; agent?: string }

export interface OfficeLayout {
  cols?: number;
  rows?: number;
  rooms?: OfficeRoom[];
  doors?: OfficeDoor[];
  furniture?: OfficeFurniture[];
}

export interface OfficeScene extends OfficeLayout {
  /** Which world to draw. The office if left out or unknown. */
  world?: string;
  agents?: OfficeAgent[];
  tasks?: OfficeTask[];
}
