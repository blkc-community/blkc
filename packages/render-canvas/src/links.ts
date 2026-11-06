/** How the code depends on itself, drawn as lines along the routes agents really walk. */

import { TILE, type Ctx } from "./paint.js";
import { findPath, isWalkable, type World } from "./world.js";

export interface LinkRoute { from: string; to: string; points: { x: number; y: number }[] }

const COLOURS = ["#38bdf8", "#f472b6", "#fbbf24", "#a78bfa", "#34d399", "#fb7185"];

/** A tile someone can stand on, as near the middle of the room as possible. */
function standingTile(world: World, roomId: string): { x: number; y: number } | undefined {
  const room = world.rooms.find((candidate) => candidate.id === roomId);
  if (!room) return undefined;
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  let best: { x: number; y: number } | undefined;
  let bestDistance = Infinity;
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const distance = Math.abs(x - cx) + Math.abs(y - cy);
      if (distance < bestDistance && isWalkable(world, x, y)) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  return best;
}

/** Each link's walking route. A link whose rooms aren't on the map, or can't be reached, is left out. */
export function linkRoutes(world: World): LinkRoute[] {
  const routes: LinkRoute[] = [];
  for (const link of world.links) {
    const start = standingTile(world, link.from);
    const end = standingTile(world, link.to);
    if (!start || !end) continue;
    const path = findPath(world, start, end);
    if (path && path.length > 0) routes.push({ from: link.from, to: link.to, points: [start, ...path] });
  }
  return routes;
}

/** Lines that move towards what is depended on. Shared stretches sit side by side. */
export function drawLinks(c: Ctx, routes: LinkRoute[], time: number): void {
  routes.forEach((route, index) => {
    const colour = COLOURS[index % COLOURS.length] as string;
    const offset = ((index % 5) - 2) * 2;
    const at = (point: { x: number; y: number }): [number, number] => [point.x * TILE + 8 + offset, point.y * TILE + 8 + offset];
    c.save();
    c.lineWidth = 2;
    c.strokeStyle = colour;
    c.globalAlpha = 0.85;
    c.setLineDash([6, 5]);
    c.lineDashOffset = -time * 14;
    c.beginPath();
    route.points.forEach((point, i) => {
      const [x, y] = at(point);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.stroke();
    c.setLineDash([]);
    const first = route.points[0];
    const last = route.points[route.points.length - 1];
    if (first && last) {
      const [sx, sy] = at(first);
      const [ex, ey] = at(last);
      c.fillStyle = colour;
      c.fillRect(sx - 2, sy - 2, 4, 4);
      c.beginPath();
      c.arc(ex, ey, 4, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  });
}
