/** The small tools every painter uses. */

export const TILE = 16;

export interface Palette { primary: string; background: string; text: string; accent: string }

export type Ctx = CanvasRenderingContext2D;

export const LABEL_FONT = "bold 7px ui-monospace, Menlo, Consolas, monospace";
export const BODY_FONT = "7px ui-monospace, Menlo, Consolas, monospace";
export const OUTLINE = "#14141f";

export const rect = (c: Ctx, color: string, x: number, y: number, w: number, h: number): void => {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
};

export function shade(color: string, amount: number): string {
  if (!color.startsWith("#")) return color;
  const hex = color.length === 4 ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}` : color;
  const n = parseInt(hex.slice(1, 7), 16);
  const channel = (shift: number): number => Math.max(0, Math.min(255, ((n >> shift) & 255) + amount));
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}
