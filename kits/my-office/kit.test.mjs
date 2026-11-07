import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("kit.json declares my-office", () => {
  const manifest = JSON.parse(readFileSync(new URL("./kit.json", import.meta.url), "utf8"));
  assert.equal(manifest.id, "my-office");
  assert.equal(manifest.manifestVersion, 2);
});
