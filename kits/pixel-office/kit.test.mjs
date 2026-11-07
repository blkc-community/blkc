import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const kit = JSON.parse(readFileSync(new URL("./kit.json", import.meta.url), "utf8"));

test("kit.json declares pixel-office", () => {
  assert.equal(kit.id, "pixel-office");
  assert.equal(kit.manifestVersion, 2);
});

test("every block on a page is declared by the Kit", () => {
  const declared = new Set(kit.blocks.map((block) => block.blockId));
  for (const page of kit.content.pages) {
    for (const { block } of page.blocks) assert.ok(declared.has(block), block);
  }
});
