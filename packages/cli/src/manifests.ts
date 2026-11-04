/**
 * BLKC CLI - Manifest discovery and validation
 *
 * `block validate`, `kit validate` and `circuit validate` were three copies of
 * the same twenty lines. Copies drift, and this one drifted in a way that
 * mattered: given a directory, all three threw EISDIR *and still exited 0*, so a
 * CI job running `blkc block validate .` reported success while validating
 * nothing. Validation that can silently check zero files is worse than no
 * validation, so the shared runner refuses that case explicitly.
 *
 * @package @blkc-code/cli
 * @license Apache-2.0
 * @author Black Code Enterprises LLC
 */

import chalk from "chalk";
import { readFile, readdir, stat } from "node:fs/promises";
import { Buffer } from "node:buffer";
import path from "node:path";
import type { ZodType } from "zod";

/** A manifest file that has been read and checked. */
export interface ManifestOutcome<T> {
  file: string;
  ok: boolean;
  errors: string[];
  data?: T;
}

export interface ValidateOptions<T> {
  /** Human name of the manifest kind, e.g. "Block". */
  kind: string;
  /** Files or directories to validate. */
  targets: string[];
  schema: ZodType<T>;
  /** Summary lines printed for a valid manifest. */
  describe: (value: T) => string[];
}

/**
 * Exit codes.
 *
 * `NothingToValidate` is separate from `Failed` on purpose: no manifests found
 * is a broken invocation (wrong directory, wrong checkout), not a clean result,
 * and must never be reported as success.
 */
export const ValidateExitCode = {
  Ok: 0,
  Failed: 1,
  NothingToValidate: 2,
} as const;

const MANIFEST_FILE_NAME = "manifest.json";

/** True when the buffer begins with a UTF-8 byte order mark. */
function hasBom(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

/**
 * Read and parse one manifest.
 *
 * A BOM gets its own message rather than letting JSON.parse say
 * "Unexpected token '\ufeff'". Both failures are invisible characters at the
 * start of the file, and the generic message sends people to the wrong place:
 * Windows tooling writes the BOM, so the fix is the encoder, not the JSON.
 */
export function parseManifest(buffer: Buffer): { ok: true; value: unknown } | { ok: false; errors: string[] } {
  const text = buffer.toString("utf8");

  if (hasBom(buffer)) {
    return {
      ok: false,
      errors: [
        "file starts with a UTF-8 byte order mark (BOM); JSON must not",
        "re-save the file as UTF-8 without a BOM (Windows editors and PowerShell's ConvertTo-Json add one)",
      ],
    };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolve the targets into a list of manifest files.
 *
 * A directory means "every manifest.json below this point", which is what a CI
 * job for a manifests repository wants. An explicit file is taken at face value
 * even if it is named differently, because the caller named it.
 */
export async function discoverManifests(targets: string[]): Promise<string[]> {
  const found: string[] = [];

  for (const target of targets) {
    const absolute = path.resolve(process.cwd(), target);

    if (!(await isDirectory(absolute))) {
      found.push(absolute);
      continue;
    }

    for (const file of await walk(absolute)) {
      found.push(file);
    }
  }

  return found.sort();
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    // node_modules and .git contain other people's manifests, and a nested
    // checkout would otherwise be validated twice.
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      files.push(...(await walk(path.join(directory, entry.name))));
      continue;
    }

    if (entry.isFile() && entry.name === MANIFEST_FILE_NAME) {
      files.push(path.join(directory, entry.name));
    }
  }

  return files;
}

/** Validate a single manifest file against a schema. */
export async function validateManifestFile<T>(
  file: string,
  schema: ZodType<T>,
): Promise<ManifestOutcome<T>> {
  let buffer: Buffer;

  try {
    buffer = await readFile(file);
  } catch (error) {
    return {
      file,
      ok: false,
      errors: [
        // A directory here is the EISDIR case that used to pass silently.
        error instanceof Error && "code" in error && error.code === "EISDIR"
          ? "is a directory, not a manifest file"
          : error instanceof Error
            ? error.message
            : String(error),
      ],
    };
  }

  const parsed = parseManifest(buffer);
  if (!parsed.ok) {
    return { file, ok: false, errors: parsed.errors };
  }

  const result = schema.safeParse(parsed.value);
  if (!result.success) {
    return {
      file,
      ok: false,
      errors: result.error.issues.map((issue) => {
        const location = issue.path.join(".");
        return location ? `${location}: ${issue.message}` : issue.message;
      }),
    };
  }

  return { file, ok: true, errors: [], data: result.data };
}

/**
 * Validate every target and print a report.
 *
 * Returns the process exit code rather than calling process.exit, so the
 * commands stay testable.
 */
export async function validateManifests<T>(options: ValidateOptions<T>): Promise<number> {
  const { kind, targets, schema, describe } = options;
  const files = await discoverManifests(targets);

  if (files.length === 0) {
    console.error(chalk.red(`No ${MANIFEST_FILE_NAME} files found in: ${targets.join(", ")}`));
    console.error(chalk.gray("Nothing was validated. Check the path, or pass a manifest file directly."));
    return ValidateExitCode.NothingToValidate;
  }

  const multiple = files.length > 1;
  const failures: ManifestOutcome<T>[] = [];
  const valid: ManifestOutcome<T>[] = [];

  for (const file of files) {
    const outcome = await validateManifestFile(file, schema);

    if (outcome.ok) {
      valid.push(outcome);
    } else {
      failures.push(outcome);
    }

    if (multiple) {
      const relative = path.relative(process.cwd(), file);
      if (outcome.ok) {
        console.log(`${chalk.green("✔")} ${relative}`);
      } else {
        console.log(`${chalk.red("✖")} ${relative}`);
      }
    }
  }

  for (const failure of failures) {
    console.error(chalk.red(`\n${path.relative(process.cwd(), failure.file)}`));
    for (const message of failure.errors) {
      console.error(`  - ${message}`);
    }
  }

  if (!multiple && valid.length === 1 && valid[0].data !== undefined) {
    console.log(chalk.green(`✔ ${kind} manifest is valid`));
    for (const line of describe(valid[0].data)) {
      console.log(chalk.gray(line));
    }
  }

  if (multiple) {
    const summary = `${valid.length} valid, ${failures.length} invalid of ${files.length} ${kind.toLowerCase()} manifest(s)`;
    console.log(chalk.gray(`\n${summary}`));
  }

  return failures.length === 0 ? ValidateExitCode.Ok : ValidateExitCode.Failed;
}
