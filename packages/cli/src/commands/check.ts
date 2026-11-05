/**
 * BLKC CLI - Check Command
 *
 * `blkc check [path]` validates every manifest in a repo by D4 folder conventions,
 * printing `CODE  file:field  message  → fix  https://.../docs/errors/<code>`.
 * Exit codes: 0 clean, 1 errors, 2 nothing found.
 *
 * `blkc validate` is kept as a deprecated alias.
 */

import chalk from "chalk";
import { Command } from "commander";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  parseAny,
  parseAnyKit,
  parseAnyCircuit,
  findErrorCode,
  errorCodeDocsUrl,
} from "@blkc-code/core";

const MANIFEST_NAMES = ["block.json", "kit.json", "circuit.json", "manifest.json"];

async function isDir(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

async function walkManifests(root: string): Promise<string[]> {
  const found: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walkManifests(full)));
    } else if (entry.isFile() && MANIFEST_NAMES.includes(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

async function discover(targets: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const t of targets) {
    const abs = path.resolve(process.cwd(), t);
    if (await isDir(abs)) {
      out.push(...(await walkManifests(abs)));
    } else {
      out.push(abs);
    }
  }
  return [...new Set(out)].sort();
}

function errorCode(code: string): { code: string; title: string; cause: string; fix: string; docsSlug: string } {
  const e = findErrorCode(code);
  if (!e) throw new Error(`Unknown error code: ${code}`);
  return e;
}

function kindOf(file: string): "block" | "kit" | "circuit" {
  const base = path.basename(file);
  if (base === "kit.json") return "kit";
  if (base === "circuit.json") return "circuit";
  if (base === "block.json") return "block";
  // manifest.json: infer from path
  if (file.includes("/kits/")) return "kit";
  if (file.includes("/circuits/")) return "circuit";
  return "block";
}

interface CheckIssue {
  code: string;
  file: string;
  field: string;
  message: string;
  fix: string;
  docs: string;
}

async function validateOne(file: string): Promise<{ ok: boolean; issues: CheckIssue[]; upgraded: boolean }> {
  const issues: CheckIssue[] = [];
  let upgraded = false;
  const rel = path.relative(process.cwd(), file);

  let raw: unknown;
  try {
    const content = await readFile(file, "utf8");
    if (content.charCodeAt(0) === 0xfeff) {
      const ec = errorCode("BLKC-E003");
      issues.push({ code: ec.code, file: rel, field: "", message: "file starts with a UTF-8 BOM", fix: ec.fix, docs: errorCodeDocsUrl(ec.code) });
      return { ok: false, issues, upgraded };
    }
    raw = JSON.parse(content);
  } catch (error) {
    const code = error instanceof SyntaxError ? "BLKC-E004" : "BLKC-E001";
    const ec = errorCode(code);
    issues.push({ code: ec.code, file: rel, field: "", message: error instanceof Error ? error.message : String(error), fix: ec.fix, docs: errorCodeDocsUrl(ec.code) });
    return { ok: false, issues, upgraded };
  }

  const kind = kindOf(file);
  try {
    let result: { upgraded: boolean };
    if (kind === "kit") {
      result = parseAnyKit(raw);
    } else if (kind === "circuit") {
      result = parseAnyCircuit(raw);
    } else {
      result = parseAny(raw);
    }
    upgraded = result.upgraded;
  } catch (error) {
    const ec = errorCode("BLKC-E100");
    issues.push({ code: ec.code, file: rel, field: "", message: error instanceof Error ? error.message : String(error), fix: ec.fix, docs: errorCodeDocsUrl(ec.code) });
  }

  return { ok: issues.length === 0, issues, upgraded };
}

// readFile is async; wrap validateOne as async
export function registerCheckCommand(program: Command): void {
  program
    .command("check [path...]")
    .description("Validate all manifests in a repo by D4 folder conventions (BLKC-E* codes).")
    .option("--json", "Machine-readable output for CI")
    .action(async (paths: string[] | undefined, options: { json?: boolean }) => {
      const targets = paths && paths.length > 0 ? paths : ["."];
      const files = await discover(targets);

      if (files.length === 0) {
        const ec = errorCode("BLKC-E005");
        if (options.json) {
          console.log(JSON.stringify({ ok: false, code: ec.code, message: ec.cause, files: [] }));
        } else {
          console.error(chalk.red(`${ec.code}  ${ec.cause}`));
          console.error(chalk.gray(`  -> ${ec.fix}`));
          console.error(chalk.gray(`  ${errorCodeDocsUrl(ec.code)}`));
        }
        process.exit(2);
      }

      const results: { file: string; ok: boolean; upgraded: boolean; issues: CheckIssue[] }[] = [];
      const allIssues: CheckIssue[] = [];
      let upgradedCount = 0;

      for (const file of files) {
        const r = await validateOne(file);
        if (r.upgraded) upgradedCount++;
        const rel = path.relative(process.cwd(), file);
        results.push({ file: rel, ok: r.ok, upgraded: r.upgraded, issues: r.issues });
        allIssues.push(...r.issues);
      }

      if (options.json) {
        console.log(JSON.stringify({
          ok: allIssues.length === 0,
          files: results.length,
          errors: allIssues.length,
          upgraded: upgradedCount,
          issues: allIssues,
        }, null, 2));
      } else {
        for (const r of results) {
          if (r.ok) {
            const note = r.upgraded ? chalk.yellow(" (upgraded)") : "";
            console.log(`${chalk.green("OK")}  ${r.file}${note}`);
          } else {
            for (const issue of r.issues) {
              console.log(`${chalk.red(issue.code)}  ${issue.file}${issue.field ? ":" + issue.field : ""}  ${issue.message}`);
              console.log(chalk.gray(`  -> ${issue.fix}`));
              console.log(chalk.gray(`  ${issue.docs}`));
            }
          }
        }
        console.log(chalk.gray(`\n${results.filter((r) => r.ok).length} valid, ${results.filter((r) => !r.ok).length} invalid of ${results.length} manifest(s)`));
        if (upgradedCount > 0) {
          console.log(chalk.yellow(`${upgradedCount} manifest(s) were upgraded from v1 in memory (warnings).`));
        }
      }

      if (allIssues.length > 0) process.exit(1);
    });
}

// ============================================================================
// Deprecated alias: validate
// ============================================================================

export function registerValidateAlias(program: Command): void {
  const cmd = program.command("validate [path...]").description("(deprecated) use 'check' instead");
  cmd.action(async (paths: string[] | undefined, options: { json?: boolean }) => {
    console.error(chalk.yellow("warning: 'validate' is deprecated; use 'blkc check' instead."));
    const checkCmd = program.commands.find((c: Command) => c.name() === "check");
    if (checkCmd) {
      await checkCmd.parseAsync(["node", "blkc", "check", ...(paths || []), ...(options?.json ? ["--json"] : [])], { from: "user" });
    }
  });
}