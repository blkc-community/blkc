/**
 * BLKC CLI - Logbook Commands
 * 
 * Commands for working with BLKC Logbook.
 * 
 * @package @blkc-code/cli
 * @license Apache-2.0
 * @author Black Code Enterprises LLC
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Logbook, verifyLogbook, readLogbook, LogbookVerificationResult } from "@blkc-code/logbook";

// ============================================================================
// Command: logbook verify
// ============================================================================

function setupVerifyCommand(program: Command): void {
  program
    .command("verify <file-path>")
    .description("Verify Logbook chain integrity")
    .option("--algorithm <algo>", "Hash algorithm", "sha256")
    .action(async (filePath: string, options: { algorithm: string }) => {
      const spinner = ora("Verifying Logbook...").start();
      
      try {
        const absolutePath = path.resolve(process.cwd(), filePath);
        
        // Check if file exists
        try {
          await stat(absolutePath);
        } catch {
          spinner.fail(`File not found: ${absolutePath}`);
          process.exit(1);
        }
        
        const result: LogbookVerificationResult = await verifyLogbook(absolutePath, options.algorithm);
        
        if (result.valid) {
          spinner.succeed("Logbook verification passed");
          console.log(chalk.green("\n✓ Chain is valid"));
          console.log(chalk.gray(`  Entries: ${result.entries.length}`));
          console.log(chalk.gray(`  Last hash: ${result.lastHash?.substring(0, 16)}...`));
        } else {
          spinner.fail("Logbook verification failed");
          console.error(chalk.red("\n✗ Chain is invalid"));
          console.error(chalk.red(`  Issues: ${result.issues.length}`));
          
          for (const issue of result.issues) {
            console.error(chalk.red(`\n  Entry ${issue.index}:`));
            console.error(chalk.red(`    ${issue.message}`));
          }
          
          process.exit(1);
        }
      } catch (error) {
        spinner.fail(`Failed to verify: ${error}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Command: logbook check
// ============================================================================

function setupCheckCommand(program: Command): void {
  program
    .command("check <file-path>")
    .description("Check Logbook for issues (alias for verify)")
    .action(async (filePath: string) => {
      // Delegate to verify
      const verifyCmd = program.commands.find((c) => c.name() === "verify");
      if (verifyCmd) {
        await (verifyCmd.action as (filePath: string, options: Record<string, unknown>) => Promise<void>)(filePath, {});
      }
    });
}

// ============================================================================
// Command: logbook info
// ============================================================================

function setupInfoCommand(program: Command): void {
  program
    .command("info <file-path>")
    .description("Show Logbook information")
    .action(async (filePath: string) => {
      const spinner = ora("Loading Logbook info...").start();
      
      try {
        const absolutePath = path.resolve(process.cwd(), filePath);
        
        // Check if file exists
        try {
          await stat(absolutePath);
        } catch {
          spinner.fail(`File not found: ${absolutePath}`);
          process.exit(1);
        }
        
        const logbook = new Logbook({ filePath: absolutePath });
        const info = await logbook.info();
        
        spinner.succeed(`Logbook: ${info.filePath}`);
        
        console.log(chalk.bold("\nLogbook Information"));
        console.log(chalk.gray("─".repeat(40)));
        console.log(chalk.gray(`File:          ${info.filePath}`));
        console.log(chalk.gray(`Entry count:   ${info.entryCount}`));
        
        if (info.firstEntry) {
          console.log(chalk.gray(`\nFirst Entry:`));
          console.log(chalk.gray(`  Timestamp:    ${info.firstEntry.timestamp}`));
          console.log(chalk.gray(`  Actor:        ${info.firstEntry.actor.name}`));
          console.log(chalk.gray(`  Event:        ${info.firstEntry.event}`));
        }
        
        if (info.lastEntry) {
          console.log(chalk.gray(`\nLast Entry:`));
          console.log(chalk.gray(`  Timestamp:    ${info.lastEntry.timestamp}`));
          console.log(chalk.gray(`  Actor:        ${info.lastEntry.actor.name}`));
          console.log(chalk.gray(`  Event:        ${info.lastEntry.event}`));
          console.log(chalk.gray(`  Hash:         ${info.lastHash?.substring(0, 16)}...`));
        }
      } catch (error) {
        spinner.fail(`Failed to show info: ${error}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Command: logbook tail
// ============================================================================

function setupTailCommand(program: Command): void {
  program
    .command("tail <file-path>")
    .description("Show the last N entries from Logbook")
    .option("--lines <n>", "Number of lines to show", "10")
    .action(async (filePath: string, options: { lines: string }) => {
      const spinner = ora("Reading Logbook...").start();
      
      try {
        const absolutePath = path.resolve(process.cwd(), filePath);
        const lines = parseInt(options.lines, 10) || 10;
        
        const entries = await readLogbook(absolutePath);
        const tailEntries = entries.slice(-lines);
        
        spinner.succeed(`Showing last ${tailEntries.length} entries`);
        
        for (const entry of tailEntries) {
          console.log(chalk.gray(`\n[${entry.timestamp}] ${entry.event}`));
          console.log(chalk.gray(`  Actor: ${entry.actor.name}`));
          if (entry.subject) {
            console.log(chalk.gray(`  Subject: ${entry.subject.type}:${entry.subject.id}`));
          }
          if (entry.hash) {
            console.log(chalk.gray(`  Hash: ${entry.hash.substring(0, 16)}...`));
          }
        }
        
        if (tailEntries.length === 0) {
          console.log(chalk.gray("\nNo entries found"));
        }
      } catch (error) {
        spinner.fail(`Failed to tail: ${error}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Register Commands
// ============================================================================

/** Register all logbook commands with the program */
export function registerLogbookCommands(program: Command): void {
  const logbookProgram = program
    .command("logbook")
    .description("Logbook commands")
    .alias("l");

  setupVerifyCommand(logbookProgram);
  setupCheckCommand(logbookProgram);
  setupInfoCommand(logbookProgram);
  setupTailCommand(logbookProgram);
}
