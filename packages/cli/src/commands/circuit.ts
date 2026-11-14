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
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { CircuitSchema } from "@blkc-code/core";
import { validateManifests } from "../manifests.js";
import { createMarketplaceStore, publishCircuit, searchCircuits, getCircuit, recordInstall, type MarketplacePricing } from "@blkc-code/marketplace";

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
    .command("publish <manifest-path>")
    .description("Publish a Circuit manifest to the local marketplace store.")
    .option("--store <dir>", "Marketplace store directory", ".blkc-marketplace")
    .option("--author <name>", "Author name")
    .option("--price <amount>", "Price (0 = free)", "0")
    .option("--tier <tier>", "Subscription tier for paid circuits")
    .option("--featured", "Mark as featured")
    .action(async (manifestPath: string, options: { store: string; author?: string; price: string; tier?: string; featured?: boolean }) => {
      const spinner = ora("Publishing Circuit...").start();
      try {
        const absolutePath = path.resolve(process.cwd(), manifestPath);
        const content = await readFile(absolutePath, "utf8");
        const manifest = JSON.parse(content);
        const result = CircuitSchema.safeParse(manifest);
        if (!result.success) {
          spinner.fail("Invalid Circuit manifest");
          console.log(result.error.format());
          process.exit(1);
        }
        const store = createMarketplaceStore(path.resolve(process.cwd(), options.store));
        const amount = Number(options.price) || 0;
        const pricing: MarketplacePricing = amount > 0
          ? { model: "one-time", amount, currency: "USD", tier: options.tier }
          : { model: "free", amount: 0, currency: "USD" };
        const entry = await publishCircuit(store, { circuit: result.data, author: options.author, pricing, featured: options.featured });
        spinner.succeed(`Published: ${entry.id}@${entry.version}`);
        console.log(chalk.gray(`Install with: blkc circuit install ${entry.id}@${entry.version}`));
      } catch (error) {
        spinner.fail(`Failed to publish: ${error}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Command: circuit search
// ============================================================================

function setupSearchCommand(program: Command): void {
  program
    .command("search <query>")
    .description("Search the marketplace for circuits.")
    .option("--store <dir>", "Marketplace store directory", ".blkc-marketplace")
    .option("--tag <tag>", "Filter by tag")
    .option("--free", "Only free circuits")
    .action(async (query: string, options: { store: string; tag?: string; free?: boolean }) => {
      const store = createMarketplaceStore(path.resolve(process.cwd(), options.store));
      const results = await searchCircuits(store, { query, tag: options.tag, freeOnly: options.free });
      if (results.length === 0) {
        console.log(chalk.yellow("No circuits found."));
        return;
      }
      for (const c of results) {
        const price = c.pricing.model === "free" ? "free" : `${c.pricing.currency} ${c.pricing.amount}`;
        console.log(chalk.bold(`${c.id}@${c.version}`) + chalk.gray(`  ${price}  ★${c.rating}  ${c.installCount} installs`));
        console.log(chalk.gray(`  ${c.summary}`));
      }
    });
}

// ============================================================================
// Command: circuit install
// ============================================================================

function setupInstallCommand(program: Command): void {
  program
    .command("install <id>")
    .description("Install a circuit from the marketplace into the current project.")
    .option("--store <dir>", "Marketplace store directory", ".blkc-marketplace")
    .option("--dest <dir>", "Destination directory", "circuits")
    .action(async (id: string, options: { store: string; dest: string }) => {
      const spinner = ora("Installing circuit...").start();
      try {
        const [circuitId, version] = id.split("@");
        const store = createMarketplaceStore(path.resolve(process.cwd(), options.store));
        const entry = await getCircuit(store, circuitId, version);
        if (!entry) {
          spinner.fail(`Circuit not found: ${id}`);
          process.exit(1);
        }
        const destDir = path.resolve(process.cwd(), options.dest, entry.id);
        await mkdir(destDir, { recursive: true });
        // Write the circuit manifest
        await writeFile(path.join(destDir, "manifest.json"), JSON.stringify(entry, null, 2) + "\n", "utf8");
        await recordInstall(store, entry.id, entry.version);
        spinner.succeed(`Installed: ${entry.id}@${entry.version} → ${destDir}`);
      } catch (error) {
        spinner.fail(`Failed to install: ${error}`);
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
  setupSearchCommand(circuitProgram);
  setupInstallCommand(circuitProgram);
}
