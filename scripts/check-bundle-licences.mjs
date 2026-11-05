#!/usr/bin/env node
// The CLI ships as one bundled file, so its libraries never appear as dependencies and a
// normal licence scan can't see them. This reads esbuild's list of what went into the
// bundle and checks each package's licence against ALLOWED_LICENCES.
import { readFileSync } from "node:fs";
import path from "node:path";

const allowed = new Set((process.env.ALLOWED_LICENCES ?? "").split(";").filter(Boolean));
if (allowed.size === 0) throw new Error("Set ALLOWED_LICENCES to a ;-separated list.");

const meta = JSON.parse(readFileSync("packages/cli/dist/meta.json", "utf8"));
const roots = new Set();
for (const input of Object.keys(meta.inputs)) {
  const match = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input);
  if (match) roots.add(path.resolve("packages/cli", match[1]));
}
if (roots.size === 0) throw new Error("Found no packages in the bundle; is the metafile right?");

const bad = [];
for (const root of [...roots].sort()) {
  const { name, license } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  if (!allowed.has(license)) bad.push(`${name}: ${license ?? "no licence"}`);
}
if (bad.length > 0) {
  console.error(`Not on the allow-list:\n${bad.join("\n")}`);
  process.exit(1);
}
console.log(`${roots.size} bundled packages, all on the allow-list.`);
