/**
 * Generate JSON Schema files from the compiled core schemas.
 * Run after `tsc`: `node scripts/generate-schemas.mjs`
 *
 * Output: packages/core/schemas/v2/*.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import * as core from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "schemas", "v2");
mkdirSync(outDir, { recursive: true });

const schemas = {
  "block.json": core.BlockSchema,
  "block-v2.json": core.BlockV2Schema,
  "ui-block.json": core.UiBlockSchema,
  "capability-block.json": core.CapabilityBlockSchema,
  "kit.json": core.KitSchema,
  "kit-v2.json": core.KitV2Schema,
  "circuit.json": core.CircuitSchema,
  "circuit-v2.json": core.CircuitV2Schema,
  "theme.json": core.ThemeSchema,
  "theme-v2.json": core.ThemeV2Schema,
  "page.json": core.KitPageSchema,
  "page-v2.json": core.PageV2Schema,
  "board.json": core.BoardTemplateSchema,
  "board-v2.json": core.BoardV2Schema,
  "attributes.json": core.AttributeSchema,
  "deploy-request.json": core.DeployRequestSchema,
  "deploy-response.json": core.DeployResponseSchema,
};

for (const [name, schema] of Object.entries(schemas)) {
  const json = z.toJSONSchema(schema, { io: "input" });
  // Add $schema and $id per D2
  json.$schema = "https://json-schema.org/draft/2020-12/schema";
  json.$id = `https://blkc.blackcode.space/schemas/v2/${name}`;
  writeFileSync(join(outDir, name), JSON.stringify(json, null, 2) + "\n");
  console.log(`wrote ${name}`);
}

console.log(`generated ${Object.keys(schemas).length} schemas into ${outDir}`);