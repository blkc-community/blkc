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
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  parseAny,
  parseAnyKit,
  parseAnyCircuit,
  findErrorCode,
  errorCodeDocsUrl,
  manifestErrorFrom,
  ManifestError,
  BoardV2Schema,
  PageV2Schema,
  ThemeV2Schema,
} from "@blkc-code/core";

const MANIFEST_NAMES = ["block.json", "kit.json", "circuit.json", "manifest.json"];

type FileKind = "block" | "kit" | "circuit" | "theme" | "page" | "board";

async function isDir(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

/** D4 companions: only validated when they sit next to the manifest that owns them. */
function isCompanion(file: string): boolean {
  const dir = path.dirname(file);
  if (path.basename(file) === "theme.json") return existsSync(path.join(dir, "kit.json"));
  if (!file.endsWith(".json")) return false;
  if (path.basename(dir) === "pages") return existsSync(path.join(dir, "..", "kit.json"));
  if (path.basename(dir) === "boards") return existsSync(path.join(dir, "..", "circuit.json"));
  return false;
}

async function walkManifests(root: string): Promise<string[]> {
  const found: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walkManifests(full)));
    } else if (entry.isFile() && (MANIFEST_NAMES.includes(entry.name) || isCompanion(full))) {
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

function kindOf(file: string): FileKind {
  const base = path.basename(file);
  if (base === "kit.json") return "kit";
  if (base === "circuit.json") return "circuit";
  if (base === "block.json") return "block";
  if (base === "theme.json") return "theme";
  if (path.basename(path.dirname(file)) === "pages") return "page";
  if (path.basename(path.dirname(file)) === "boards") return "board";
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

function issueFor(code: string, file: string, field: string, message: string): CheckIssue {
  const ec = errorCode(code);
  return { code: ec.code, file, field, message, fix: ec.fix, docs: errorCodeDocsUrl(ec.code) };
}

/** Page blocks must be declared by the Kit that owns the page (BLKC-E111). */
async function pageReferenceIssues(file: string, rel: string, blocks: { block: string }[]): Promise<CheckIssue[]> {
  let kit: unknown;
  try {
    kit = parseAnyKit(JSON.parse(await readFile(path.join(path.dirname(file), "..", "kit.json"), "utf8"))).value;
  } catch {
    return []; // the Kit's own errors are reported against kit.json
  }
  const refs = new Set((kit as { blocks: { blockId: string; alias?: string }[] }).blocks.flatMap((ref) => [ref.blockId, ref.alias]));
  return blocks.flatMap((instance, index) =>
    refs.has(instance.block)
      ? []
      : [issueFor("BLKC-E111", rel, `blocks.${index}.block`, `Block "${instance.block}" is not listed in the Kit's blocks`)],
  );
}

interface FileResult {
  ok: boolean;
  issues: CheckIssue[];
  upgraded: boolean;
  warnings: string[];
}

async function validateOne(file: string): Promise<FileResult> {
  const rel = path.relative(process.cwd(), file);
  const fail = (issues: CheckIssue[], warnings: string[] = []): FileResult => ({ ok: false, issues, upgraded: false, warnings });

  let raw: unknown;
  try {
    const content = await readFile(file, "utf8");
    if (content.charCodeAt(0) === 0xfeff) {
      return fail([issueFor("BLKC-E003", rel, "", "file starts with a UTF-8 BOM")]);
    }
    raw = JSON.parse(content);
  } catch (error) {
    const code = error instanceof SyntaxError ? "BLKC-E004" : "BLKC-E001";
    return fail([issueFor(code, rel, "", error instanceof Error ? error.message : String(error))]);
  }

  const warnings: string[] = [];
  if (path.basename(file) === "manifest.json") {
    warnings.push(`manifest.json is an old file name; rename it to ${kindOf(file)}.json`);
  }

  const kind = kindOf(file);
  const issues: CheckIssue[] = [];
  let upgraded = false;
  try {
    if (kind === "theme" || kind === "page" || kind === "board") {
      const schema = kind === "theme" ? ThemeV2Schema : kind === "page" ? PageV2Schema : BoardV2Schema;
      const result = schema.safeParse(raw);
      if (!result.success) throw manifestErrorFrom(result.error.issues);
      if (kind === "page") {
        issues.push(...(await pageReferenceIssues(file, rel, (result.data as { blocks: { block: string }[] }).blocks)));
      }
    } else {
      const result = kind === "kit" ? parseAnyKit(raw) : kind === "circuit" ? parseAnyCircuit(raw) : parseAny(raw);
      upgraded = result.upgraded;
      warnings.push(...result.warnings);
    }
  } catch (error) {
    if (error instanceof ManifestError) {
      for (const issue of error.issues) issues.push(issueFor(issue.code, rel, issue.field, issue.message));
    } else {
      issues.push(issueFor("BLKC-E100", rel, "", error instanceof Error ? error.message : String(error)));
    }
  }

  return { ok: issues.length === 0, issues, upgraded, warnings };
}

interface CheckOptions {
  json?: boolean;
}

async function runCheck(paths: string[] | undefined, options: CheckOptions): Promise<void> {
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
    process.exitCode = 2;
    return;
  }

  const results: ({ file: string } & FileResult)[] = [];
  for (const file of files) {
    results.push({ file: path.relative(process.cwd(), file), ...(await validateOne(file)) });
  }
  const allIssues = results.flatMap((r) => r.issues);
  const upgradedCount = results.filter((r) => r.upgraded).length;

  if (options.json) {
    console.log(JSON.stringify({
      ok: allIssues.length === 0,
      files: results.length,
      errors: allIssues.length,
      upgraded: upgradedCount,
      warnings: results.flatMap((r) => r.warnings.map((message) => ({ file: r.file, message }))),
      issues: allIssues,
    }, null, 2));
  } else {
    for (const r of results) {
      if (r.ok) {
        const note = r.upgraded ? chalk.yellow(" (upgraded)") : "";
        console.log(`${chalk.green("OK")}  ${r.file}${note}`);
      }
      for (const warning of r.warnings) console.log(chalk.yellow(`  warning: ${warning}`));
      for (const issue of r.issues) {
        console.log(`${chalk.red(issue.code)}  ${issue.file}${issue.field ? ":" + issue.field : ""}  ${issue.message}`);
        console.log(chalk.gray(`  -> ${issue.fix}`));
        console.log(chalk.gray(`  ${issue.docs}`));
      }
    }
    console.log(chalk.gray(`\n${results.filter((r) => r.ok).length} valid, ${results.filter((r) => !r.ok).length} invalid of ${results.length} manifest(s)`));
    if (upgradedCount > 0) {
      console.log(chalk.yellow(`${upgradedCount} manifest(s) were upgraded from v1 in memory (warnings).`));
    }
  }

  if (allIssues.length > 0) process.exitCode = 1;
}

export function registerCheckCommand(program: Command): void {
  program
    .command("check [path...]")
    .description("Validate all manifests in a repo by D4 folder conventions (BLKC-E* codes).")
    .option("--json", "Machine-readable output for CI")
    .action(runCheck);
}

// ============================================================================
// Deprecated alias: validate
// ============================================================================

export function registerValidateAlias(program: Command): void {
  program
    .command("validate [path...]")
    .description("(deprecated) use 'check' instead")
    .option("--json", "Machine-readable output for CI")
    .action(async (paths: string[] | undefined, options: CheckOptions) => {
      console.error(chalk.yellow("warning: 'validate' is deprecated; use 'blkc check' instead."));
      await runCheck(paths, options);
    });
}
