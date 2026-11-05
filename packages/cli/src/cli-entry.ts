#!/usr/bin/env node

import { run } from "./index.js";

run().catch((error) => {
  console.error("BLKC CLI error:", error);
  process.exit(1);
});