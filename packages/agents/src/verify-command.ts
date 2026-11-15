/**
 * Running a quest's `verify` command safely.
 *
 * Any agent connected to the office can write a quest's `verify` string, so it is untrusted
 * input. It is never handed to a shell. It is split into words, checked against a short list
 * of test runners, and run directly with `shell: false`. Anything else is refused, with a
 * reason the agent can read.
 *
 * Allowed forms:
 *   npm|pnpm|yarn|bun test [args]          npm|pnpm|yarn|bun run <script> [args]
 *   npx|bunx|pnpm exec|yarn exec  vitest|jest|playwright|tsc|eslint|mocha|ava|tap [args]
 *   pytest [args]   python|python3 -m pytest|unittest [args]
 *   go test [args]  cargo test [args]       deno test [args]   node --test [args]
 */

import { spawnSync } from "node:child_process";

/** Characters a word may contain. Excludes every shell metacharacter, quotes and whitespace. */
const SAFE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;

/** Flags that turn a test runner back into "run this code". */
const EVAL_FLAGS = new Set(["-e", "--eval", "-p", "--print", "-c", "-r", "--require", "--import", "--loader", "--experimental-loader"]);

const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const EXEC_RUNNERS = new Set(["npx", "bunx"]);
const TEST_TOOLS = new Set(["vitest", "jest", "playwright", "tsc", "eslint", "mocha", "ava", "tap"]);

export interface VerifyCommand {
  command: string;
  args: string[];
}

export type ParsedVerify = { ok: true; value: VerifyCommand } | { ok: false; reason: string };

export function parseVerifyCommand(input: string): ParsedVerify {
  const text = input.trim();
  if (!text) return { ok: false, reason: "The verify command is empty." };
  if (text.length > 500) return { ok: false, reason: "The verify command is longer than 500 characters." };

  const words = text.split(/[ \t]+/);
  const bad = words.find((word) => !SAFE_WORD.test(word));
  if (bad !== undefined) {
    return { ok: false, reason: `"${bad}" isn't allowed in a verify command. Use a plain test command such as "npm test" or "npx vitest run": no quotes, pipes, ";", "&", "$", redirects or backticks.` };
  }
  const evalFlag = words.find((word) => EVAL_FLAGS.has(word) || [...EVAL_FLAGS].some((flag) => flag.startsWith("--") && word.startsWith(`${flag}=`)));
  if (evalFlag) return { ok: false, reason: `"${evalFlag}" runs arbitrary code, so it isn't allowed in a verify command.` };

  const [command, ...args] = words as [string, ...string[]];
  const sub = args[0];
  const value = { command, args };
  const allowed = (() => {
    if (PACKAGE_MANAGERS.has(command)) {
      if (sub === "test") return true;
      if (sub === "run" && args[1] !== undefined) return true;
      if ((command === "pnpm" || command === "yarn") && sub === "exec") return args[1] !== undefined && TEST_TOOLS.has(args[1]);
      return false;
    }
    if (EXEC_RUNNERS.has(command)) return sub !== undefined && TEST_TOOLS.has(sub);
    if (command === "pytest") return true;
    if (command === "python" || command === "python3") return sub === "-m" && (args[1] === "pytest" || args[1] === "unittest");
    if (command === "go" || command === "cargo" || command === "deno") return sub === "test";
    if (command === "node") return sub === "--test";
    return false;
  })();
  if (!allowed) {
    return { ok: false, reason: `"${text}" isn't a recognised test command. Allowed: npm/pnpm/yarn/bun test or run <script>, npx vitest|jest|playwright|tsc|eslint|mocha, pytest, python -m pytest, go test, cargo test, deno test, node --test.` };
  }
  return { ok: true, value };
}

export interface VerifyResult {
  pass: boolean;
  evidence: string;
  /** Set when the command was refused before it ran. */
  refused?: string;
}

/** Run a verify command without a shell. A refused command fails, with the reason as its evidence. */
export function runVerifyCommand(input: string, cwd: string, timeoutMs = 300_000): VerifyResult {
  const parsed = parseVerifyCommand(input);
  if (!parsed.ok) return { pass: false, evidence: `Refused: ${parsed.reason}`, refused: parsed.reason };
  const result = spawnSync(parsed.value.command, parsed.value.args, { shell: false, cwd, encoding: "utf8", timeout: timeoutMs });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  const evidence = output.slice(0, 2000) || (result.error ? String(result.error) : "");
  return { pass: result.status === 0 && !result.error, evidence };
}
