/**
 * BLKC CLI - Circuit Commands
 * 
 * Commands for working with BLKC Circuits.
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
import { CircuitSchema } from "@blkc-code/core";
import { validateManifests } from "../manifests.js";

// ============================================================================
// Command: circuit validate
// ============================================================================

function setupValidateCommand(program: Command): void {
  program
    .command("validate <path...>")
    .description("Validate Circuit manifest(s). A directory is searched for manifest.json files.")
    .action(async (targets: string[]) => {
      process.exitCode = await validateManifests({
        kind: "Circuit",
        targets,
        schema: CircuitSchema,
        describe: (circuit) => [
          `Circuit ID: ${circuit.id}`,
          `Name: ${circuit.name}`,
          `Kits: ${circuit.kits.length}`,
          `Boards: ${circuit.boards.length}`,
          `Capabilities: ${circuit.capabilities.length}`,
        ],
      });
    });
}

// ============================================================================
// Command: circuit info
// ============================================================================

function setupInfoCommand(program: Command): void {
  program
    .command("info <manifest-path>")
    .description("Show detailed information about a Circuit")
    .action(async (manifestPath: string) => {
      const spinner = ora("Loading Circuit info...").start();
      
      try {
        const absolutePath = path.resolve(process.cwd(), manifestPath);
        const content = await readFile(absolutePath, { encoding: "utf8" });
        const manifest = JSON.parse(content);
        
        const result = CircuitSchema.safeParse(manifest);
        if (!result.success) {
          spinner.fail("Invalid Circuit manifest");
          process.exit(1);
        }
        
        const circuit = result.data;
        spinner.succeed(`Circuit: ${circuit.id}`);
        
        console.log(chalk.bold("\nCircuit Information"));
        console.log(chalk.gray("─".repeat(40)));
        console.log(chalk.gray(`ID:          ${circuit.id}`));
        console.log(chalk.gray(`Name:        ${circuit.name}`));
        console.log(chalk.gray(`Summary:     ${circuit.summary}`));
        console.log(chalk.gray(`Version:     ${circuit.version}`));
        console.log(chalk.gray(`Status:      ${circuit.status}`));
        console.log(chalk.gray(`License:     ${circuit.license}`));
        
        if (circuit.verticals.length > 0) {
          console.log(chalk.gray(`Verticals:   ${circuit.verticals.join(", ")}`));
        }
        
        if (circuit.tags.length > 0) {
          console.log(chalk.gray(`Tags:        ${circuit.tags.join(", ")}`));
        }
        
        if (circuit.kits.length > 0) {
          console.log(chalk.bold("\nKits"));
          console.log(chalk.gray("─".repeat(40)));
          for (const kitRef of circuit.kits) {
            console.log(chalk.gray(`  - ${kitRef.kitId}@${kitRef.version}`));
          }
        }
        
        if (circuit.boards.length > 0) {
          console.log(chalk.bold("\nBoards"));
          console.log(chalk.gray("─".repeat(40)));
          for (const board of circuit.boards) {
            console.log(chalk.gray(`  - ${board.id}: ${board.name}`));
            console.log(chalk.gray(`    Columns: ${board.columns.map((c: { id: string; name: string }) => c.name).join(", ")}`));
          }
        }
        
        if (circuit.capabilities.length > 0) {
          console.log(chalk.bold("\nCapabilities"));
          console.log(chalk.gray("─".repeat(40)));
          for (const capRef of circuit.capabilities) {
            console.log(chalk.gray(`  - ${capRef.blockId}@${capRef.version}`));
          }
        }
        
        if (circuit.repository) {
          console.log(chalk.bold("\nRepository"));
          console.log(chalk.gray("─".repeat(40)));
          console.log(chalk.gray(circuit.repository));
        }
      } catch (error) {
        spinner.fail(`Failed to show info: ${error}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Command: circuit publish
// ============================================================================

function setupPublishCommand(program: Command): void {
  program
    .command("publish")
    .description("Publish a Circuit to registry (simulated)")
    .option("--dry-run", "Simulate publish without actually publishing")
    .action(async (options) => {
      const { dryRun } = options;
      const spinner = ora(dryRun ? "Simulating publish..." : "Publishing Circuit...").start();
      
      try {
        // Simulate publish
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        if (dryRun) {
          spinner.succeed("Dry run: Circuit would be published");
        } else {
          spinner.succeed("Circuit published successfully");
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

/** Register all circuit commands with the program */
export function registerCircuitCommands(program: Command): void {
  const circuitProgram = program
    .command("circuit")
    .description("Circuit commands")
    .alias("c");

  setupValidateCommand(circuitProgram);
  setupInfoCommand(circuitProgram);
  setupPublishCommand(circuitProgram);
}
