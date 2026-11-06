/** The script tag version: starts every canvas Block on the page by itself. */
import { mountCanvasBlocks } from "./index.js";

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mountCanvasBlocks());
} else {
  mountCanvasBlocks();
}
