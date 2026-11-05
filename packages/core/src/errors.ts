/**
 * BLKC Error Code catalogue (core-owned, shared by CLI, site and BCM).
 *
 * Ranges:
 *   BLKC-E001–E099  reading files
 *   BLKC-E100–E199  schema
 *   BLKC-E200–E299  references and semver
 *   BLKC-E300–E399  capabilities and MCP
 *
 * Each code carries a title, a cause, a fix and a docs slug so that `blkc check`
 * can print `CODE  file:field  message  → fix  https://blkc.blackcode.space/docs/errors/<code>`.
 *
 * @package @blkc-code/core
 * @license Apache-2.0
 */

export interface BlkcErrorCode {
  code: string;
  title: string;
  cause: string;
  fix: string;
  docsSlug: string;
}

export const BLKC_ERROR_CODES: BlkcErrorCode[] = [
  // --- E001-E099: reading files ---
  { code: "BLKC-E001", title: "File not found", cause: "The manifest path does not exist.", fix: "Check the path and try again.", docsSlug: "e001" },
  { code: "BLKC-E002", title: "Not a file", cause: "The path points at a directory, not a manifest file.", fix: "Pass a manifest file (block.json, kit.json, circuit.json) or a directory containing them.", docsSlug: "e002" },
  { code: "BLKC-E003", title: "UTF-8 BOM", cause: "The file starts with a byte order mark; JSON must not.", fix: "Re-save as UTF-8 without a BOM.", docsSlug: "e003" },
  { code: "BLKC-E004", title: "Invalid JSON", cause: "The file is not valid JSON.", fix: "Fix the syntax error reported by the parser.", docsSlug: "e004" },
  { code: "BLKC-E005", title: "Nothing to validate", cause: "No manifest files were found in the given path.", fix: "Check the directory or pass a manifest file directly.", docsSlug: "e005" },
  { code: "BLKC-E006", title: "Read error", cause: "The file could not be read.", fix: "Check file permissions.", docsSlug: "e006" },
  // --- E100-E199: schema ---
  { code: "BLKC-E100", title: "Schema validation failed", cause: "The manifest does not match its schema.", fix: "Fix the reported field errors.", docsSlug: "e100" },
  { code: "BLKC-E101", title: "Missing required field", cause: "A required field is absent.", fix: "Add the missing field.", docsSlug: "e101" },
  { code: "BLKC-E102", title: "Invalid field type", cause: "A field has the wrong type.", fix: "Correct the value's type.", docsSlug: "e102" },
  { code: "BLKC-E103", title: "Invalid identifier", cause: "An id is not a valid identifier (lowercase alphanumeric with hyphens, 3-64 chars).", fix: "Rename to a valid identifier.", docsSlug: "e103" },
  { code: "BLKC-E104", title: "Missing manifestVersion", cause: "manifestVersion is not declared (required for new manifests).", fix: "Add \"manifestVersion\": 2.", docsSlug: "e104" },
  { code: "BLKC-E105", title: "Unsupported manifestVersion", cause: "The manifestVersion is not supported.", fix: "Use 1 or 2; migrate to 2.", docsSlug: "e105" },
  { code: "BLKC-E106", title: "Missing kind", cause: "A Block has no kind (treated as capability in v1).", fix: "Add \"kind\": \"ui\" or \"kind\": \"capability\".", docsSlug: "e106" },
  { code: "BLKC-E107", title: "Missing renderer", cause: "A UI Block declares no renderer.", fix: "Add at least one renderer (web).", docsSlug: "e107" },
  { code: "BLKC-E108", title: "Invalid attribute type", cause: "An attribute uses an unknown type.", fix: "Use one of: string, number, boolean, richtext, link, image, color, list.", docsSlug: "e108" },
  { code: "BLKC-E109", title: "Example missing required prop", cause: "The example omits a required prop.", fix: "Add every required prop to the example.", docsSlug: "e109" },
  { code: "BLKC-E110", title: "Invalid transition", cause: "A board transition references a column that does not exist.", fix: "Fix the from/to column ids.", docsSlug: "e110" },
  { code: "BLKC-E111", title: "Kit block reference unresolved", cause: "A page references a block not declared in the Kit's blocks.", fix: "Add the block to the Kit's blocks list or fix the reference.", docsSlug: "e111" },
  // --- E200-E299: references and semver ---
  { code: "BLKC-E200", title: "Missing reference", cause: "A referenced Block/Kit/Circuit was not found.", fix: "Check the id and the registry index.", docsSlug: "e200" },
  { code: "BLKC-E201", title: "Incompatible version", cause: "The referenced version does not satisfy the range.", fix: "Update the version constraint or the referenced item.", docsSlug: "e201" },
  { code: "BLKC-E202", title: "Missing dependency", cause: "A Kit/Circuit requires a Block/Circuit that is not declared.", fix: "Declare the dependency.", docsSlug: "e202" },
  { code: "BLKC-E203", title: "Circular reference", cause: "Items reference each other in a cycle.", fix: "Break the cycle.", docsSlug: "e203" },
  { code: "BLKC-E204", title: "Deprecated version", cause: "The referenced version is deprecated.", fix: "Upgrade to a supported version.", docsSlug: "e204" },
  // --- E300-E399: capabilities and MCP ---
  { code: "BLKC-E300", title: "Invalid capability contract", cause: "A capability Block's input/output is not valid JSON Schema.", fix: "Fix the input/output schemas.", docsSlug: "e300" },
  { code: "BLKC-E301", title: "Vague description", cause: "A capability description is too short or vague for AI use.", fix: "Write a description of at least 40 characters without vague words.", docsSlug: "e301" },
  { code: "BLKC-E302", title: "Missing permission", cause: "A capability uses a secret or network without declaring it.", fix: "Add the permission to the permissions field.", docsSlug: "e302" },
  { code: "BLKC-E303", title: "Secret in client bundle", cause: "A secret or ctx.secrets use would reach a client bundle.", fix: "Move the secret to a server-only capability Block.", docsSlug: "e303" },
  { code: "BLKC-E304", title: "Browser-incompatible capability", cause: "A browser-runtime capability Block cannot run in the browser.", fix: "Change runtime to server or remove browser-only constraints.", docsSlug: "e304" },
  { code: "BLKC-E305", title: "HTML export size exceeded", cause: "A browser-runtime capability Block exceeds the html target size budget.", fix: "Use the static or project target instead.", docsSlug: "e305" },
];

export function findErrorCode(code: string): BlkcErrorCode | undefined {
  return BLKC_ERROR_CODES.find((e) => e.code === code);
}

export function errorCodeDocsUrl(code: string): string {
  return `https://blkc.blackcode.space/docs/errors/${code.toLowerCase()}`;
}

// ============================================================================
// Structured parse errors: every schema failure carries a code and a field
// ============================================================================

export interface ManifestIssue {
  /** A `BLKC-E*` code from the catalogue. */
  code: string;
  /** Dot path of the failing field, for example `attributes.heading.type`. Empty for the whole file. */
  field: string;
  message: string;
}

/** Thrown by `parseAny*`. `message` joins the issues so existing callers keep working. */
export class ManifestError extends Error {
  readonly issues: ManifestIssue[];

  constructor(issues: ManifestIssue[]) {
    super(issues.map((issue) => (issue.field ? `${issue.field}: ${issue.message}` : issue.message)).join("; "));
    this.name = "ManifestError";
    this.issues = issues;
  }
}

/** The subset of a zod issue that the mapping reads. */
interface SchemaIssue {
  code?: string;
  path: readonly PropertyKey[];
  message: string;
}

function codeForIssue(issue: SchemaIssue, field: string): string {
  const top = field.split(".")[0];
  if (top === "manifestVersion") return "BLKC-E105";
  if (top === "kind") return "BLKC-E106";
  if (top === "renderers") return "BLKC-E107";
  if (top === "example") return "BLKC-E109";
  if (/^attributes\.[^.]+\.type$/.test(field)) return "BLKC-E108";
  if (/\.transitions\.|^transitions\./.test(field)) return "BLKC-E110";
  if (/^content\.pages\.\d+\.blocks\.\d+\.block$/.test(field)) return "BLKC-E111";
  if (top === "id") return issue.message.includes("received undefined") ? "BLKC-E101" : "BLKC-E103";
  if (issue.code === "invalid_type") {
    return issue.message.includes("received undefined") ? "BLKC-E101" : "BLKC-E102";
  }
  return "BLKC-E100";
}

export function manifestErrorFrom(issues: readonly SchemaIssue[]): ManifestError {
  return new ManifestError(
    issues.map((issue) => {
      const field = issue.path.map(String).join(".");
      return { code: codeForIssue(issue, field), field, message: issue.message };
    }),
  );
}
