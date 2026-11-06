/** Puts a world on a canvas: sizing, the camera, the frame loop, and input. */

import { daylightAt, drawBuilding, drawWorld, TILE, type Daylight, type Palette } from "./draw.js";
import type { OfficeLayout, OfficeScene } from "./types.js";
import { agentAt, applyLayout, applyUpdate, createWorld, step, type World } from "./world.js";

export interface OfficeHandle {
  world: World;
  /** Change agents or tasks without restarting anyone. */
  update(scene: Pick<OfficeScene, "agents" | "tasks">): void;
  /** Change the building while everyone is in it. */
  setLayout(layout: OfficeLayout): void;
  /** Pick an agent by id, or pass nothing to clear. */
  select(id?: string): void;
  /** The tile under a pointer event, allowing for the camera. */
  tileAt(event: { clientX: number; clientY: number }): { x: number; y: number };
  /** Draw something over the office each frame, in pixels at 16 a tile. For build mode. */
  setOverlay(draw: ((c: CanvasRenderingContext2D) => void) | undefined): void;
  /** Stop clicks picking agents and dragging the camera, while something else handles them. */
  setInteractive(on: boolean): void;
  /** Zoom by a factor around a point on the canvas, or reset with no arguments. */
  zoom(factor?: number, event?: { clientX: number; clientY: number }): void;
  destroy(): void;
}

export interface OfficeOptions {
  /** Called when the selection changes, by click or by select(). */
  onSelect?: (id: string | undefined) => void;
  /** Wheel to zoom and drag to pan. For a page that is mainly the office: it takes the wheel. */
  camera?: boolean;
}

const SAFE_COLOUR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/a-z]+\))$/i;
const MAX_ZOOM = 4;

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
  const palette = readPalette(canvas);
  const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  let selected: string | undefined;
  let scale = 0;
  let time = 0;
  let last = 0;
  let frame = 0;
  let visible = true;
  let destroyed = false;
  let interactive = true;
  let overlay: ((c: CanvasRenderingContext2D) => void) | undefined;
  const view = { x: 0, y: 0, zoom: 1 };
  let hour = new Date().getHours();
  let daylight: Daylight = daylightAt(hour);
  let building: HTMLCanvasElement | undefined;
  let buildingDirty = true;

  const width = (): number => world.cols * TILE;
  const height = (): number => world.rows * TILE;

  const clampView = (): void => {
    view.zoom = Math.min(MAX_ZOOM, Math.max(1, view.zoom));
    view.x = Math.min(width() - width() / view.zoom, Math.max(0, view.x));
    view.y = Math.min(height() - height() / view.zoom, Math.max(0, view.y));
  };

  const refreshBuilding = (): void => {
    if (typeof document === "undefined") return;
    building ??= document.createElement("canvas");
    building.width = width() * scale;
    building.height = height() * scale;
    const layer = building.getContext("2d");
    if (!layer) return;
    layer.setTransform(scale, 0, 0, scale, 0, 0);
    layer.imageSmoothingEnabled = false;
    drawBuilding(layer, world, palette, daylight);
    buildingDirty = false;
  };

  const paint = (): void => {
    if (buildingDirty) refreshBuilding();
    const zoomed = scale * view.zoom;
    c.setTransform(zoomed, 0, 0, zoomed, -view.x * zoomed, -view.y * zoomed);
    c.imageSmoothingEnabled = false;
    drawWorld(c, world, time, palette, daylight, building, selected);
    overlay?.(c);
  };

  // The backing store is a whole multiple of the art, so every pixel stays square and text stays sharp.
  const resize = (): void => {
    const shown = canvas.getBoundingClientRect().width || width();
    const ratio = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
    const next = Math.max(1, Math.ceil((shown * ratio) / width()));
    if (next === scale && canvas.width === width() * scale && canvas.height === height() * scale) return;
    scale = next;
    canvas.width = width() * scale;
    canvas.height = height() * scale;
    buildingDirty = true;
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
    const nowHour = new Date().getHours();
    if (nowHour !== hour) {
      hour = nowHour;
      daylight = daylightAt(hour);
      buildingDirty = true;
    }
    paint();
  };

  const select = (id?: string): void => {
    selected = id === selected ? undefined : id;
    options.onSelect?.(selected);
    if (still) paint();
  };

  const tileAt = (event: { clientX: number; clientY: number }): { x: number; y: number } => {
    const box = canvas.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * (width() / view.zoom) + view.x;
    const py = ((event.clientY - box.top) / box.height) * (height() / view.zoom) + view.y;
    return { x: px / TILE, y: py / TILE };
  };

  let drag: { x: number; y: number; moved: boolean } | undefined;
  const onDown = (event: PointerEvent): void => {
    if (!interactive) return;
    drag = { x: event.clientX, y: event.clientY, moved: false };
  };
  const onMove = (event: PointerEvent): void => {
    if (!interactive) return;
    if (drag && options.camera && view.zoom > 1) {
      const box = canvas.getBoundingClientRect();
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (drag.moved || Math.abs(dx) + Math.abs(dy) > 3) {
        drag.moved = true;
        view.x -= (dx / box.width) * (width() / view.zoom);
        view.y -= (dy / box.height) * (height() / view.zoom);
        drag.x = event.clientX;
        drag.y = event.clientY;
        clampView();
        canvas.style.cursor = "grabbing";
        return;
      }
    }
    const { x, y } = tileAt(event);
    canvas.style.cursor = agentAt(world, x, y) ? "pointer" : options.camera && view.zoom > 1 ? "grab" : "default";
  };
  const onUp = (event: PointerEvent): void => {
    if (!interactive) return;
    const wasDrag = drag?.moved;
    drag = undefined;
    if (wasDrag) return;
    const { x, y } = tileAt(event);
    const agent = agentAt(world, x, y);
    if (agent || selected) select(agent?.id ?? selected);
  };
  const zoom = (factor?: number, event?: { clientX: number; clientY: number }): void => {
    if (factor === undefined) {
      view.zoom = 1;
      view.x = 0;
      view.y = 0;
      return;
    }
    const before = event ? tileAt(event) : { x: view.x / TILE + width() / view.zoom / TILE / 2, y: view.y / TILE + height() / view.zoom / TILE / 2 };
    view.zoom = Math.min(MAX_ZOOM, Math.max(1, view.zoom * factor));
    if (event) {
      const after = tileAt(event);
      view.x += (before.x - after.x) * TILE;
      view.y += (before.y - after.y) * TILE;
    } else {
      view.x = before.x * TILE - width() / view.zoom / 2;
      view.y = before.y * TILE - height() / view.zoom / 2;
    }
    clampView();
  };
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    zoom(event.deltaY < 0 ? 1.2 : 1 / 1.2, event);
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  if (options.camera) canvas.addEventListener("wheel", onWheel, { passive: false });

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
    setLayout(layout) {
      applyLayout(world, layout);
      buildingDirty = true;
      view.zoom = Math.min(view.zoom, MAX_ZOOM);
      clampView();
      scale = 0;
      resize();
    },
    select,
    tileAt,
    setOverlay(draw) { overlay = draw; },
    setInteractive(on) { interactive = on; drag = undefined; if (!on) canvas.style.cursor = "crosshair"; },
    zoom,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      resizer?.disconnect();
      viewer?.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    },
  };
}
