/** The script tag version: starts every canvas Block on the page by itself. */
import { createOffice, mountCanvasBlocks } from "./index.js";

// For pages that drive an office themselves, such as the blkc dev app.
(globalThis as unknown as { BLKCCanvas: unknown }).BLKCCanvas = { createOffice, mountCanvasBlocks };

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mountCanvasBlocks());
} else {
  mountCanvasBlocks();
}
