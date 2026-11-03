#!/usr/bin/env node

/**
 * BLKC CLI Entry Point
 * 
 * This file is the entry point for the blkc command-line tool.
 * It bootstraps the CLI and runs the appropriate command.
 * 
 * @package @blkc-code/cli
 * @license Apache-2.0
 * @author Black Code Enterprises LLC
 */

// Import and run the CLI
import { run } from "../dist/index.js";

run().catch((error) => {
  console.error("BLKC CLI error:", error);
  process.exit(1);
});
