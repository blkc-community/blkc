/**
 * BLKC CLI - New Command
 *
 * `blkc new block|kit|circuit <id>` scaffolds a D4 folder with a valid manifest,
 * an example, and a test that passes with `node --test`. It never overwrites.
 */


import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { IdentifierSchema, errorCodeDocsUrl, findErrorCode } from "@blkc-code/core";
import { KIT_TEMPLATES } from "../kit-templates.js";

const DEFAULT_LICENSE = "MIT";

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

function title(id: string): string {
  return id.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function blockJson(id: string, kind: "ui" | "capability"): string {
  const base = {
    $schema: "https://blkc.blackcode.space/schemas/v2/block.json",
    manifestVersion: 2,
    id,
    name: title(id),
    version: "0.1.0",
    tags: [],
    license: DEFAULT_LICENSE,
  };
  if (kind === "ui") {
    return pretty({
      ...base,
      kind: "ui",
      summary: `A ${id} block`,
      description: `A ${id} block created with blkc new.`,
      category: "content",
      attributes: {
        heading: { type: "string", required: true, label: "Heading" },
      },
      example: { heading: "Hello" },
    });
  }
  return pretty({
    ...base,
    kind: "capability",
    summary: `A ${id} capability`,
    description: `A ${id} capability created with blkc new.`,
    entryPoint: "./src/index.ts",
    runtime: "node",
    inputs: [],
    outputs: [],
    capabilities: [],
  });
}

function kitJson(id: string): string {
  return JSON.stringify(
    {
      $schema: "https://blkc.blackcode.space/schemas/v2/kit.json",
      manifestVersion: 2,
      id,
      name: title(id),
      summary: `A ${id} kit`,
      description: `A ${id} kit created with blkc new.`,
      version: "0.1.0",
      category: "general",
      tags: [],
      license: DEFAULT_LICENSE,
      blocks: [],
    },
    null,
    2,
  ) + "\n";
}

function circuitJson(id: string): string {
  return JSON.stringify(
    {
      $schema: "https://blkc.blackcode.space/schemas/v2/circuit.json",
      manifestVersion: 2,
      id,
      name: title(id),
      summary: `A ${id} circuit`,
      description: `A ${id} circuit created with blkc new.`,
      version: "0.1.0",
      tags: [],
      license: DEFAULT_LICENSE,
      kits: [],
      boards: [],
      capabilities: [],
    },
    null,
    2,
  ) + "\n";
}

function capabilityIndexTs(id: string): string {
  return `export type ${toPascal(id)}Input = { text: string };\nexport type ${toPascal(id)}Output = { ok: boolean };\n\nexport const run = async (_input: ${toPascal(id)}Input): Promise<${toPascal(id)}Output> => {\n  return { ok: true };\n};\n`;
}

function toPascal(s: string): string {
  return s.split(/[-_]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

const THEME_JSON = pretty({
  $schema: "https://blkc.blackcode.space/schemas/v2/theme.json",
  version: 3,
  settings: {
    color: {
      palette: [
        { slug: "background", name: "Background", color: "#ffffff" },
        { slug: "foreground", name: "Foreground", color: "#111111" },
      ],
    },
  },
});

const HOME_PAGE_JSON = pretty({
  $schema: "https://blkc.blackcode.space/schemas/v2/page.json",
  slug: "",
  title: "Home",
  blocks: [],
});

const MAIN_BOARD_JSON = pretty({
  $schema: "https://blkc.blackcode.space/schemas/v2/board.json",
  id: "main",
  name: "Main",
  columns: [
    { id: "todo", name: "To do" },
    { id: "done", name: "Done" },
  ],
  transitions: [{ from: "todo", to: "done" }],
});

/** A dependency-free test, so a fresh scaffold passes with `node --test`. */
function testFile(manifest: string, id: string, extra: string): string {
  return `import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));

test("${manifest} declares ${id}", () => {
  const manifest = read("./${manifest}");
  assert.equal(manifest.id, "${id}");
  assert.equal(manifest.manifestVersion, 2);
});
${extra}`;
}

const UI_BLOCK_EXTRA = `
test("the example sets every required attribute", () => {
  const { attributes, example } = read("./block.json");
  for (const [name, attribute] of Object.entries(attributes)) {
    if (attribute.required) assert.ok(name in example, name);
  }
});
`;

const CAPABILITY_EXTRA = `
test("the example input is an object", () => {
  assert.equal(typeof read("./examples/basic.json"), "object");
});
`;

const KIT_EXTRA = `
test("the example home page and theme parse", () => {
  assert.equal(read("./pages/home.json").title, "Home");
  assert.equal(read("./theme.json").version, 3);
});
`;

const CIRCUIT_EXTRA = `
test("the example board has columns", () => {
  assert.ok(read("./boards/main.json").columns.length > 0);
});
`;

async function write(dir: string, files: Record<string, string>): Promise<void> {
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
  }
}

async function isUsable(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).length === 0;
  } catch {
    return true; // does not exist yet
  }
}

export function registerNewCommand(program: Command): void {
  program
    .command("new <kind> <id>")
    .description("Scaffold a new block, kit, or circuit (D4 folder convention).")
    .option("--capability", "Scaffold a capability Block instead of a UI Block")
    .action(async (kind: string, id: string, options: { capability?: boolean }) => {
      if (!["block", "kit", "circuit"].includes(kind)) {
        console.error(`Unknown kind: ${kind}. Use block, kit, or circuit.`);
        process.exit(1);
      }
      if (!IdentifierSchema.safeParse(id).success) {
        const ec = findErrorCode("BLKC-E103");
        console.error(`BLKC-E103  ${JSON.stringify(id)}  ${ec?.cause}`);
        console.error(`  -> ${ec?.fix}`);
        console.error(`  ${errorCodeDocsUrl("BLKC-E103")}`);
        process.exit(1);
      }

      const root = process.cwd();
      const dir = path.join(root, kind === "block" ? "blocks" : kind === "kit" ? "kits" : "circuits", id);
      if (!(await isUsable(dir))) {
        console.error(`${path.relative(root, dir)} already exists and is not empty. Nothing was changed.`);
        process.exit(1);
      }

      const spinner = ora(`Scaffolding ${kind} ${id}...`).start();
      try {
        const readme = `# ${title(id)}\n\nCreated with \`blkc new ${kind} ${id}\`.\n\nRun \`blkc check\` to validate it and \`node --test\` to run its test.\n`;
        if (kind === "block" && options.capability) {
          await write(dir, {
            "block.json": blockJson(id, "capability"),
            "src/index.ts": capabilityIndexTs(id),
            "examples/basic.json": pretty({ text: "Hello" }),
            "block.test.mjs": testFile("block.json", id, CAPABILITY_EXTRA),
            "README.md": readme,
          });
        } else if (kind === "block") {
          await write(dir, {
            "block.json": blockJson(id, "ui"),
            "block.test.mjs": testFile("block.json", id, UI_BLOCK_EXTRA),
            "README.md": readme,
          });
        } else if (kind === "kit" && Object.hasOwn(KIT_TEMPLATES, id)) {
          await write(dir, KIT_TEMPLATES[id]);
        } else if (kind === "kit") {
          await write(dir, {
            "kit.json": kitJson(id),
            "theme.json": THEME_JSON,
            "pages/home.json": HOME_PAGE_JSON,
            "kit.test.mjs": testFile("kit.json", id, KIT_EXTRA),
            "README.md": readme,
          });
        } else {
          await write(dir, {
            "circuit.json": circuitJson(id),
            "boards/main.json": MAIN_BOARD_JSON,
            "circuit.test.mjs": testFile("circuit.json", id, CIRCUIT_EXTRA),
            "README.md": readme,
          });
        }

        spinner.succeed(`Created ${kind} ${id} in ${path.relative(root, dir)}`);
        console.log(chalk.gray(`Run 'blkc check' to validate.`));
      } catch (error) {
        spinner.fail(`Failed to scaffold: ${error}`);
        process.exit(1);
      }
    });
}
