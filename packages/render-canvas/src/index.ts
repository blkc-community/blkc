/**
 * BLKC Render-Canvas.
 *
 * A canvas Block is ordinary markup from @blkc-code/render-web plus its data, and this
 * package brings it to life. Call mountCanvasBlocks() once the page is in the document:
 * a <canvas data-blkc-canvas="office"> with a JSON <script> beside it starts running.
 *
 * @package @blkc-code/render-canvas
 * @license Apache-2.0
 */

import { createOffice, type OfficeHandle } from "./office.js";
import type { OfficeScene } from "./types.js";

export { createOffice } from "./office.js";
export { registerPainter, type Painter } from "./draw.js";
export { registerWorld, type ItemSpec, type WorldData } from "./pack.js";
export type { OfficeHandle, OfficeOptions } from "./office.js";
export * from "./types.js";
export { FURNITURE, agentAt, applyLayout, applyUpdate, createWorld, findPath, step } from "./world.js";
export type { Agent, World } from "./world.js";

export interface MountedBlock {
  element: HTMLCanvasElement;
  destroy(): void;
}

type CanvasBlockFactory = (canvas: HTMLCanvasElement, data: unknown, root: Element) => { destroy(): void };

const factories = new Map<string, CanvasBlockFactory>();

/** Teach mountCanvasBlocks about another kind of canvas Block. */
export function registerCanvasBlock(id: string, factory: CanvasBlockFactory): void {
  factories.set(id, factory);
}

function mountOffice(canvas: HTMLCanvasElement, data: unknown, root: Element): OfficeHandle {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("button[data-blkc-agent]")];
  const office = createOffice(canvas, data as OfficeScene, {
    onSelect(id) {
      for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset["blkcAgent"] === id));
    },
  });
  for (const button of buttons) {
    button.disabled = false;
    button.addEventListener("click", () => office.select(button.dataset["blkcAgent"]));
  }
  return office;
}

registerCanvasBlock("office", mountOffice);

const mounted = new WeakSet<Element>();

/** Start every canvas Block under `root` that isn't running yet. */
export function mountCanvasBlocks(root: ParentNode = document): MountedBlock[] {
  const out: MountedBlock[] = [];
  for (const canvas of root.querySelectorAll<HTMLCanvasElement>("canvas[data-blkc-canvas]")) {
    if (mounted.has(canvas)) continue;
    const factory = factories.get(canvas.dataset["blkcCanvas"] ?? "");
    if (!factory) continue;
    const host = canvas.closest("[data-blkc-canvas-root]") ?? canvas.parentElement ?? canvas;
    const source = host.querySelector("script[data-blkc-canvas-data]");
    let data: unknown = {};
    try {
      data = JSON.parse(source?.textContent || "{}");
    } catch {
      data = {};
    }
    mounted.add(canvas);
    const block = factory(canvas, data, host);
    out.push({ element: canvas, destroy: () => block.destroy() });
  }
  return out;
}
