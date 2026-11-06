/** The script tag version: starts every canvas Block on the page by itself. */
import { FURNITURE, createOffice, findPath, mountCanvasBlocks } from "./index.js";

// For pages that drive an office themselves, such as the blkc dev app.
(globalThis as unknown as { BLKCCanvas: unknown }).BLKCCanvas = { FURNITURE, createOffice, findPath, mountCanvasBlocks };

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mountCanvasBlocks());
} else {
  mountCanvasBlocks();
}
