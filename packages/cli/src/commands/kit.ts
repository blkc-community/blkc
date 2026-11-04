/**
 * BLKC CLI - Kit Commands
 * 
 * Commands for working with BLKC Kits.
 * 
 * @package @blkc-code/cli
 * @license Apache-2.0
 * @author Black Code Enterprises LLC
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { KitSchema } from "@blkc-code/core";
import { validateManifests } from "../manifests.js";

// ============================================================================
// Command: kit validate
// ============================================================================

function setupValidateCommand(program: Command): void {
  program
    .command("validate <path...>")
    .description("Validate Kit manifest(s). A directory is searched for manifest.json files.")
    .action(async (targets: string[]) => {
      process.exitCode = await validateManifests({
        kind: "Kit",
        targets,
        schema: KitSchema,
        describe: (kit) => [
          `Kit ID: ${kit.id}`,
          `Name: ${kit.name}`,
          `Blocks: ${kit.blocks.length}`,
        ],
      });
    });
}

// ============================================================================
// Command: kit info
// ============================================================================

function setupInfoCommand(program: Command): void {
  program
    .command("info <manifest-path>")
    .description("Show detailed information about a Kit")
    .action(async (manifestPath: string) => {
      const spinner = ora("Loading Kit info...").start();
      
      try {
        const absolutePath = path.resolve(process.cwd(), manifestPath);
        const content = await readFile(absolutePath, { encoding: "utf8" });
        const manifest = JSON.parse(content);
        
        const result = KitSchema.safeParse(manifest);
        if (!result.success) {
          spinner.fail("Invalid Kit manifest");
          process.exit(1);
        }
        
        const kit = result.data;
        spinner.succeed(`Kit: ${kit.id}`);
        
        console.log(chalk.bold("\nKit Information"));
        console.log(chalk.gray("─".repeat(40)));
        console.log(chalk.gray(`ID:        ${kit.id}`));
        console.log(chalk.gray(`Name:      ${kit.name}`));
        console.log(chalk.gray(`Summary:   ${kit.summary}`));
        console.log(chalk.gray(`Version:   ${kit.version}`));
        console.log(chalk.gray(`Category:  ${kit.category}`));
        console.log(chalk.gray(`License:   ${kit.license}`));
        console.log(chalk.gray(`Visibility: ${kit.visibility}`));
        
        if (kit.tags.length > 0) {
          console.log(chalk.gray(`Tags:      ${kit.tags.join(", ")}`));
        }
        
        console.log(chalk.bold("\nBlocks"));
        console.log(chalk.gray("─".repeat(40)));
        for (const blockRef of kit.blocks) {
          console.log(chalk.gray(`  - ${blockRef.blockId}@${blockRef.version}${blockRef.alias ? ` (as ${blockRef.alias})` : ''}`));
        }
        
        if (kit.theme) {
          console.log(chalk.bold("\nTheme"));
          console.log(chalk.gray("─".repeat(40)));
          console.log(chalk.gray(`  Version: ${kit.theme.version}`));
        }
        
        if (kit.content && kit.content.pages.length > 0) {
          console.log(chalk.bold("\nContent"));
          console.log(chalk.gray("─".repeat(40)));
          console.log(chalk.gray(`  Pages: ${kit.content.pages.length}`));
          for (const page of kit.content.pages) {
            console.log(chalk.gray(`    - ${page.slug || "(home)"}: ${page.title} (${page.blocks.length} blocks)`));
          }
        }
        
        if (kit.repository) {
          console.log(chalk.bold("\nRepository"));
          console.log(chalk.gray("─".repeat(40)));
          console.log(chalk.gray(kit.repository));
        }
      } catch (error) {
        spinner.fail(`Failed to show info: ${error}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Command: kit publish
// ============================================================================

function setupPublishCommand(program: Command): void {
  program
    .command("publish")
    .description("Publish a Kit to registry (simulated)")
    .option("--dry-run", "Simulate publish without actually publishing")
    .action(async (options) => {
      const { dryRun } = options;
      const spinner = ora(dryRun ? "Simulating publish..." : "Publishing Kit...").start();
      
      try {
        // Simulate publish
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        if (dryRun) {
          spinner.succeed("Dry run: Kit would be published");
        } else {
          spinner.succeed("Kit published successfully");
          console.log(chalk.gray("\nNote: Actual publishing requires registry authentication."));
        }
      } catch (error) {
        spinner.fail(`Failed to publish: ${error}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Register Commands
// ============================================================================

/** Register all kit commands with the program */
export function registerKitCommands(program: Command): void {
  const kitProgram = program
    .command("kit")
    .description("Kit commands")
    .alias("k");

  setupValidateCommand(kitProgram);
  setupInfoCommand(kitProgram);
  setupPublishCommand(kitProgram);
}
