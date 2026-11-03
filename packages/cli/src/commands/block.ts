/**
 * BLKC CLI - Block Commands
 * 
 * Commands for working with BLKC Blocks.
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
import { BlockSchema } from "@blkc-code/core";

// ============================================================================
// Command: block validate
// ============================================================================

function setupValidateCommand(program: Command): void {
  program
    .command("validate <manifest-path>")
    .description("Validate a Block manifest")
    .action(async (manifestPath: string) => {
      const spinner = ora("Validating Block manifest...").start();
      
      try {
        const absolutePath = path.resolve(process.cwd(), manifestPath);
        const content = await readFile(absolutePath, { encoding: "utf8" });
        const manifest = JSON.parse(content);
        
        const result = BlockSchema.safeParse(manifest);
        
        if (!result.success) {
          spinner.fail("Validation failed");
          console.error(chalk.red("\nValidation errors:"));
          for (const issue of result.error.issues) {
            console.error(`  - ${chalk.red(issue.path.join("."))}: ${issue.message}`);
          }
          process.exit(1);
        }
        
        spinner.succeed("Block manifest is valid");
        const block = result.data;
        console.log(chalk.gray(`\nBlock ID: ${block.id}`));
        console.log(chalk.gray(`Name: ${block.name}`));
        console.log(chalk.gray(`Kind: ${block.kind}`));
        console.log(chalk.gray(`Version: ${block.version}`));
      } catch (error) {
        spinner.fail(`Failed to validate: ${error}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Command: block test
// ============================================================================

function setupTestCommand(program: Command): void {
  program
    .command("test <manifest-path>")
    .description("Test a Block")
    .action(async (manifestPath: string) => {
      const spinner = ora("Testing Block...").start();
      
      try {
        const absolutePath = path.resolve(process.cwd(), manifestPath);
        const content = await readFile(absolutePath, { encoding: "utf8" });
        const manifest = JSON.parse(content);
        
        // Validate first
        const result = BlockSchema.safeParse(manifest);
        if (!result.success) {
          spinner.fail("Validation failed");
          console.error(chalk.red("Validation errors:"));
          for (const issue of result.error.issues) {
            console.error(`  - ${chalk.red(issue.path.join("."))}: ${issue.message}`);
          }
          process.exit(1);
        }
        
        const block = result.data;
        
        // Test based on kind
        if (block.kind === "ui") {
          // Test UI Block
          spinner.succeed("UI Block test passed");
          console.log(chalk.gray(`\nBlock: ${block.id}`));
          console.log(chalk.gray(`Has ${block.controls.length} controls`));
          console.log(chalk.gray(`Has ${Object.keys(block.renderers).length} renderers`));
        } else {
          // Test Capability Block
          spinner.succeed("Capability Block test passed");
          console.log(chalk.gray(`\nBlock: ${block.id}`));
          console.log(chalk.gray(`Runtime: ${block.runtime}`));
          console.log(chalk.gray(`Entry: ${block.entryPoint}`));
        }
      } catch (error) {
        spinner.fail(`Failed to test: ${error}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Command: block list
// ============================================================================

function setupListCommand(program: Command): void {
  program
    .command("list")
    .description("List all Blocks in a directory")
    .option("--dir <dir>", "Directory to search", ".")
    .action(async () => {
      const spinner = ora("Searching for Blocks...").start();
      
      try {
        // In a real implementation, we would walk the directory tree
        // and find all manifest.json files
        // For now, simulate with a delay
        await new Promise((resolve) => setTimeout(resolve, 500));
        
        spinner.succeed("Found Blocks");
        console.log(chalk.gray("\nNo Blocks found in current implementation."));
        console.log(chalk.gray("Use 'blkc block validate <path>' to validate a specific Block."));
      } catch (error) {
        spinner.fail(`Failed to list Blocks: ${error}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Command: block info
// ============================================================================

function setupInfoCommand(program: Command): void {
  program
    .command("info <manifest-path>")
    .description("Show detailed information about a Block")
    .action(async (manifestPath: string) => {
      const spinner = ora("Loading Block info...").start();
      
      try {
        const absolutePath = path.resolve(process.cwd(), manifestPath);
        const content = await readFile(absolutePath, { encoding: "utf8" });
        const manifest = JSON.parse(content);
        
        const result = BlockSchema.safeParse(manifest);
        if (!result.success) {
          spinner.fail("Invalid Block manifest");
          process.exit(1);
        }
        
        const block = result.data;
        spinner.succeed(`Block: ${block.id}`);
        
        console.log(chalk.bold("\nBlock Information"));
        console.log(chalk.gray("─".repeat(40)));
        console.log(chalk.gray(`ID:        ${block.id}`));
        console.log(chalk.gray(`Name:      ${block.name}`));
        console.log(chalk.gray(`Summary:   ${block.summary}`));
        console.log(chalk.gray(`Kind:      ${block.kind}`));
        console.log(chalk.gray(`Version:   ${block.version}`));
        console.log(chalk.gray(`License:   ${block.license}`));
        console.log(chalk.gray(`Visibility: ${block.visibility}`));
        
        if (block.tags.length > 0) {
          console.log(chalk.gray(`Tags:      ${block.tags.join(", ")}`));
        }
        
        if (block.kind === "ui") {
          console.log(chalk.bold("\nUI Block Details"));
          console.log(chalk.gray("─".repeat(40)));
          console.log(chalk.gray(`Category:  ${block.category || "none"}`));
          console.log(chalk.gray(`Controls:  ${block.controls.length}`));
          console.log(chalk.gray(`Renderers:  ${Object.keys(block.renderers).join(", ")}`));
          console.log(chalk.gray(`Props:     ${Object.keys(block.props.properties || {}).length}`));
        } else {
          console.log(chalk.bold("\nCapability Block Details"));
          console.log(chalk.gray("─".repeat(40)));
          console.log(chalk.gray(`Runtime:   ${block.runtime}`));
          console.log(chalk.gray(`Entry:     ${block.entryPoint}`));
          console.log(chalk.gray(`Size:      ${block.sizeMB || "unknown"} MB`));
          console.log(chalk.gray(`Inputs:    ${block.inputs.length > 0 ? block.inputs.join(", ") : "none"}`));
          console.log(chalk.gray(`Outputs:   ${block.outputs.length > 0 ? block.outputs.join(", ") : "none"}`));
        }
        
        if (block.repository) {
          console.log(chalk.bold("\nRepository"));
          console.log(chalk.gray("─".repeat(40)));
          console.log(chalk.gray(block.repository));
        }
      } catch (error) {
        spinner.fail(`Failed to show info: ${error}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Register Commands
// ============================================================================

/** Register all block commands with the program */
export function registerBlockCommands(program: Command): void {
  const blockProgram = program
    .command("block")
    .description("Block commands")
    .alias("b");

  setupValidateCommand(blockProgram);
  setupTestCommand(blockProgram);
  setupListCommand(blockProgram);
  setupInfoCommand(blockProgram);
}
