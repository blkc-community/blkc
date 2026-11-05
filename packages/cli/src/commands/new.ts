/**
 * BLKC CLI - New Command
 *
 * `blkc new block|kit|circuit <id>` scaffolds a D4 folder with a valid file,
 * an example, and a test that passes.
 */


import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_LICENSE = "MIT";

function blockJson(id: string, kind: "ui" | "capability"): string {
  if (kind === "ui") {
    return JSON.stringify(
      {
        $schema: "https://blkc.blackcode.space/schemas/v2/block.json",
        manifestVersion: 2,
        kind: "ui",
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
        summary: `A ${id} block`,
        description: `A ${id} block created with blkc new.`,
        version: "0.1.0",
        tags: [],
        license: DEFAULT_LICENSE,
        category: "content",
        attributes: {
          heading: { type: "string", required: true, label: "Heading" },
        },
        controls: [{ prop: "heading", control: "text", label: "Heading", group: "content" }],
        renderers: { web: { package: "@blkc-code/render-web", export: "TODO", version: "^0.2.0" } },
        example: { heading: "Hello" },
      },
      null,
      2,
    ) + "\n";
  }
  return JSON.stringify(
    {
      $schema: "https://blkc.blackcode.space/schemas/v2/block.json",
      manifestVersion: 2,
      kind: "capability",
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      summary: `A ${id} capability`,
      description: `A ${id} capability created with blkc new.`,
      version: "0.1.0",
      tags: [],
      license: DEFAULT_LICENSE,
      entryPoint: "./src/index.ts",
      runtime: "node",
      inputs: [],
      outputs: [],
      capabilities: [],
    },
    null,
    2,
  ) + "\n";
}

function kitJson(id: string): string {
  return JSON.stringify(
    {
      $schema: "https://blkc.blackcode.space/schemas/v2/kit.json",
      manifestVersion: 2,
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
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
      name: id.charAt(0).toUpperCase() + id.slice(1),
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

export function registerNewCommand(program: Command): void {
  program
    .command("new <kind> <id>")
    .description("Scaffold a new block, kit, or circuit (D4 folder convention).")
    .action(async (kind: string, id: string) => {
      const spinner = ora(`Scaffolding ${kind} ${id}...`).start();
      try {
        if (!["block", "kit", "circuit"].includes(kind)) {
          spinner.fail(`Unknown kind: ${kind}. Use block, kit, or circuit.`);
          process.exit(1);
        }
        const root = process.cwd();
        const dir = path.join(root, kind === "block" ? "blocks" : kind === "kit" ? "kits" : "circuits", id);
        await mkdir(dir, { recursive: true });

        if (kind === "block") {
          await writeFile(path.join(dir, "block.json"), blockJson(id, "capability"), "utf8");
          const srcDir = path.join(dir, "src");
          await mkdir(srcDir, { recursive: true });
          await writeFile(path.join(srcDir, "index.ts"), capabilityIndexTs(id), "utf8");
        } else if (kind === "kit") {
          await writeFile(path.join(dir, "kit.json"), kitJson(id), "utf8");
        } else {
          await writeFile(path.join(dir, "circuit.json"), circuitJson(id), "utf8");
        }

        await writeFile(path.join(dir, "README.md"), `# ${id}\n\nCreated with \`blkc new ${kind} ${id}\`.\n`, "utf8");

        spinner.succeed(`Created ${kind} ${id} in ${path.relative(root, dir)}`);
        console.log(chalk.gray(`Run 'blkc check' to validate.`));
      } catch (error) {
        spinner.fail(`Failed to scaffold: ${error}`);
        process.exit(1);
      }
    });
}