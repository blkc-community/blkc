/**
 * BLKC CLI - Developer tools for BLKC
 * 
 * This package provides command-line tools for working with BLKC Blocks, Kits, Circuits, and Logbook.
 * 
 * @package @blkc-code/cli
 * @version 0.1.0
 * @license Apache-2.0
 * @author Black Code Enterprises LLC
 */

import { Command } from "commander";
import { registerBlockCommands } from "./commands/block.js";
import { registerKitCommands } from "./commands/kit.js";
import { registerCircuitCommands } from "./commands/circuit.js";
import { registerLogbookCommands } from "./commands/logbook.js";
import { registerDeployCommands } from "./commands/deploy.js";
import { registerCheckCommand, registerValidateAlias } from "./commands/check.js";
import { registerNewCommand } from "./commands/new.js";
import { registerDevCommand } from "./commands/dev.js";
import { registerOfficeCommand } from "./commands/office.js";
import { VERSION } from "./version.js";

/**
 * The main BLKC CLI program.
 */
export const program = new Command();

// Configure the CLI
program
  .name("blkc")
  .description("BLKC developer CLI - Tools for working with Blocks, Kits, Circuits, and Logbook")
  .version(VERSION);

// Show help after errors
program.showHelpAfterError();

// Configure output to prevent duplicate errors
program.configureOutput({
  outputError: (str) => {
    // Only print the error if it's not already been handled
    if (str && !str.includes("error:")) {
      console.error(str.trim());
    }
  },
});

// Register all command groups
registerBlockCommands(program);
registerKitCommands(program);
registerCircuitCommands(program);
registerLogbookCommands(program);
registerDeployCommands(program);
registerNewCommand(program);
registerDevCommand(program);
registerOfficeCommand(program);
registerCheckCommand(program);
registerValidateAlias(program);

// Add a global --help flag
program.option("--debug", "Enable debug mode");

/**
 * Run the CLI.
 */
export async function run(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("An unknown error occurred");
    }
    process.exit(1);
  }
}

// Export for bin usage
export default program;
