/** What a Kit writes to describe an office. All of it is plain JSON. */

export type AgentState = "working" | "thinking" | "blocked" | "reviewing" | "idle" | "done" | "away";
export type TaskState = "todo" | "doing" | "done";
export type FloorStyle = "wood" | "carpet" | "tile";
export type FurnitureType =
  | "desk" | "coffee" | "sofa" | "plant" | "board" | "shelf" | "server" | "table" | "rug" | "water";

export interface OfficeRoom { id?: string; name?: string; x: number; y: number; w: number; h: number; floor?: FloorStyle }
export interface OfficeDoor { x: number; y: number }
export interface OfficeFurniture { type: FurnitureType; x: number; y: number }
export interface OfficeAgent {
  id: string;
  name?: string;
  role?: string;
  state?: AgentState;
  task?: string;
  /** Character colours. Anything left out is picked from the id. */
  hair?: string;
  skin?: string;
  shirt?: string;
}
export interface OfficeTask { title: string; state?: TaskState; agent?: string }

export interface OfficeScene {
  cols?: number;
  rows?: number;
  rooms?: OfficeRoom[];
  doors?: OfficeDoor[];
  furniture?: OfficeFurniture[];
  agents?: OfficeAgent[];
  tasks?: OfficeTask[];
}
