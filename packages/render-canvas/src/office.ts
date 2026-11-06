/** Puts a world on a canvas: sizing, the frame loop, and pointer and keyboard input. */

import { drawWorld, TILE, type Palette } from "./draw.js";
import type { OfficeScene } from "./types.js";
import { agentAt, applyUpdate, createWorld, step, type World } from "./world.js";

export interface OfficeHandle {
  world: World;
  /** Change agents or tasks without restarting anyone. */
  update(scene: Pick<OfficeScene, "agents" | "tasks">): void;
  /** Pick an agent by id, or pass nothing to clear. */
  select(id?: string): void;
  destroy(): void;
}

export interface OfficeOptions {
  /** Called when the selection changes, by click or by select(). */
  onSelect?: (id: string | undefined) => void;
}

const SAFE_COLOUR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/a-z]+\))$/i;

function readPalette(canvas: HTMLCanvasElement): Palette {
  const styles = getComputedStyle(canvas);
  const token = (name: string, fallback: string): string => {
    const value = styles.getPropertyValue(name).trim();
    return SAFE_COLOUR.test(value) ? value : fallback;
  };
  return {
    primary: token("--blkc-color-primary", "#3b82f6"),
    accent: token("--blkc-color-accent", "#f59e0b"),
    background: token("--blkc-color-background", "#1a1a2e"),
    text: token("--blkc-color-text", "#ffffff"),
  };
}

/** Draw an office and keep it running until destroy(). */
export function createOffice(canvas: HTMLCanvasElement, scene: OfficeScene = {}, options: OfficeOptions = {}): OfficeHandle {
  const world = createWorld(scene);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't draw to a canvas.");
  const c = context;
  const width = world.cols * TILE;
  const height = world.rows * TILE;
  const palette = readPalette(canvas);
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  let selected: string | undefined;
  let scale = 0;
  let time = 0;
  let last = 0;
  let frame = 0;
  let visible = true;
  let destroyed = false;

  const paint = (): void => {
    c.setTransform(scale, 0, 0, scale, 0, 0);
    c.imageSmoothingEnabled = false;
    drawWorld(c, world, time, palette, selected);
  };

  // The backing store is a whole multiple of the art, so every pixel stays square and text stays sharp.
  const resize = (): void => {
    const shown = canvas.getBoundingClientRect().width || width;
    const ratio = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
    const next = Math.max(1, Math.ceil((shown * ratio) / width));
    if (next === scale) return;
    scale = next;
    canvas.width = width * scale;
    canvas.height = height * scale;
    paint();
  };

  const loop = (now: number): void => {
    if (destroyed) return;
    frame = requestAnimationFrame(loop);
    if (!visible) {
      last = now;
      return;
    }
    const dt = Math.min((now - last) / 1000 || 0, 0.1); // a stalled tab mustn't teleport people
    last = now;
    time += dt;
    step(world, dt);
    paint();
  };

  const select = (id?: string): void => {
    const next = id === selected ? undefined : id;
    selected = next;
    options.onSelect?.(selected);
    if (still) paint();
  };

  const pointerTile = (event: PointerEvent): { x: number; y: number } => {
    const box = canvas.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width) * world.cols, y: ((event.clientY - box.top) / box.height) * world.rows };
  };
  const onDown = (event: PointerEvent): void => {
    const { x, y } = pointerTile(event);
    select(agentAt(world, x, y)?.id);
  };
  const onMove = (event: PointerEvent): void => {
    const { x, y } = pointerTile(event);
    canvas.style.cursor = agentAt(world, x, y) ? "pointer" : "default";
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);

  const resizer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : undefined;
  resizer?.observe(canvas);
  const viewer = typeof IntersectionObserver === "function"
    ? new IntersectionObserver((entries) => { visible = entries.some((entry) => entry.isIntersecting); })
    : undefined;
  viewer?.observe(canvas);

  resize();
  if (scale === 0) { scale = 1; paint(); }
  if (!still) frame = requestAnimationFrame(loop);

  return {
    world,
    update(next) {
      applyUpdate(world, next);
      if (still) paint();
    },
    select,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      resizer?.disconnect();
      viewer?.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
    },
  };
}
