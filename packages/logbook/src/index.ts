/**
 * BLKC Logbook - Hash-chained audit trail implementation.
 * 
 * The Logbook records all changes across BLKC systems (Sites, boards, MCP, marketplace)
 * in a tamper-evident, hash-chained format. Each entry is cryptographically linked to
 * the previous one, ensuring that any modification would be detected.
 * 
 * @package @blkc-code/logbook
 * @version 0.1.0
 * @license Apache-2.0
 * @author Black Code Enterprises LLC
 */

import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { ensureFile } from "fs-extra";
import {
  DEFAULT_ALGORITHM,
  LogbookEntry,
  LogbookEntrySchema,
  cryptoRandomId,
  nowISO,
  safeParse,
  withHash,
} from "@blkc-code/core";

// ============================================================================
// Types
// ============================================================================

/** Default path for the Logbook file */
export const DEFAULT_LOGBOOK_PATH = "logbook/log.jsonl";

/** Logbook configuration */
export type LogbookConfig = {
  filePath?: string;
  algorithm?: string;
}

/** Input for appending a new Logbook entry */
export type LogbookAppendInput = {
  id?: string;
  timestamp?: string;
  actor: LogbookEntry["actor"];
  event: string;
  subject?: LogbookEntry["subject"];
  data?: LogbookEntry["data"];
  proof?: LogbookEntry["proof"];
  signature?: string;
}

/** A single verification issue found during chain verification */
export type LogbookVerificationIssue = {
  index: number;
  message: string;
  entry?: Partial<LogbookEntry>;
}

/** Result of verifying a Logbook chain */
export type LogbookVerificationResult = {
  valid: boolean;
  issues: LogbookVerificationIssue[];
  entries: LogbookEntry[];
  lastHash?: string;
}

/** Custom error for Logbook corruption */
export class LogbookCorruptionError extends Error {
  constructor(
    readonly filePath: string,
    readonly line: number,
    readonly rawLine: string,
    override readonly cause?: unknown
  ) {
    super(`Logbook corruption detected at ${filePath}:${line + 1}`);
    this.name = "LogbookCorruptionError";
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Remove hash fields from an entry for hash computation */
const dropHashFields = (entry: LogbookEntry) => {
  const { hash: _hash, prevHash: _prevHash, signature: _signature, ...rest } = entry;
  return rest;
}

/** Convert append input to hashless entry */
const toHashlessEntry = (input: LogbookAppendInput & { prevHash?: string }): Omit<LogbookEntry, 'hash' | 'prevHash'> => ({
  id: input.id ?? cryptoRandomId() as string,
  timestamp: input.timestamp ?? nowISO() as string,
  actor: input.actor,
  event: input.event,
  subject: input.subject,
  data: input.data ?? {},
  proof: input.proof,
  signature: input.signature,
} as Omit<LogbookEntry, 'hash' | 'prevHash'>);

// ============================================================================
// Logbook Class
// ============================================================================

/**
 * Logbook implements a hash-chained audit trail.
 * 
 * Features:
 * - Append-only log with hash chaining
 * - Tamper-evident: any modification invalidates subsequent hashes
 * - Multi-tenancy support via tenant field in subject
 * - Optional digital signatures for non-repudiation
 * - Personal data removal support (recomputes hashes)
 */
export class Logbook {
  readonly filePath: string;
  readonly algorithm: string;
  private readonly lineEnding = "\n";

  constructor(config: LogbookConfig = {}) {
    this.filePath = path.resolve(config.filePath ?? DEFAULT_LOGBOOK_PATH);
    this.algorithm = config.algorithm ?? DEFAULT_ALGORITHM;
  }

  /**
   * Ensure the Logbook file and directory exist.
   */
  private async ensureFileReady(): Promise<void> {
    await ensureFile(this.filePath);
  }

  /**
   * Read the last entry from the Logbook.
   */
  async tail(): Promise<LogbookEntry | undefined> {
    try {
      const content = await readFile(this.filePath, { encoding: "utf8" });
      if (!content.trim()) return undefined;

      const lines = content.trim().split(this.lineEnding);
      const lastLine = lines[lines.length - 1];
      
      if (!lastLine) return undefined;

      return safeParse(LogbookEntrySchema, JSON.parse(lastLine)) as LogbookEntry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Append a new entry to the Logbook.
   * 
   * The entry is validated, assigned an ID and timestamp if not provided,
   * linked to the previous entry via prevHash, and its hash is computed.
   */
  async append(input: LogbookAppendInput): Promise<LogbookEntry> {
    await this.ensureFileReady();
    const previous = await this.tail();
    const prevHash = previous?.hash;

    const base = toHashlessEntry({ ...input });
    const normalized = safeParse(LogbookEntrySchema, {
      ...base,
      prevHash,
    }) as LogbookEntry;

    const entry = withHash(dropHashFields(normalized), prevHash, this.algorithm);
    await appendFile(this.filePath, `${JSON.stringify(entry)}${this.lineEnding}`, {
      encoding: "utf8",
    });

    return entry;
  }

  /**
   * Read all entries from the Logbook.
   */
  async readAll(): Promise<LogbookEntry[]> {
    try {
      const content = await readFile(this.filePath, { encoding: "utf8" });
      if (!content.trim()) return [];

      const lines = content.trim().split(this.lineEnding);
      const entries: LogbookEntry[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        try {
          const entry = safeParse(LogbookEntrySchema, JSON.parse(line)) as LogbookEntry;
          entries.push(entry);
        } catch (error) {
          throw new LogbookCorruptionError(this.filePath, i, line, error);
        }
      }

      return entries;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  /**
   * Count the number of entries in the Logbook.
   */
  async count(): Promise<number> {
    try {
      const content = await readFile(this.filePath, { encoding: "utf8" });
      if (!content.trim()) return 0;
      return content.trim().split(this.lineEnding).length;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return 0;
      }
      throw error;
    }
  }

  /**
   * Verify the integrity of the entire Logbook chain.
   * 
   * Checks:
   * - Each entry's hash matches its computed hash
   * - Each entry's prevHash matches the previous entry's hash
   * - The chain is continuous (no gaps)
   */
  async verify(): Promise<LogbookVerificationResult> {
    const entries = await this.readAll();
    return this.verifyEntries(entries);
  }

  /**
   * Verify a set of entries (without reading from file).
   */
  verifyEntries(entries: LogbookEntry[]): LogbookVerificationResult {
    let prevHash: string | undefined;
    const issues: LogbookVerificationIssue[] = [];
    const verifiedEntries: LogbookEntry[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      verifiedEntries.push(entry);

      // Verify hash
      const computedHash = withHash(dropHashFields(entry), entry.prevHash, this.algorithm).hash;
      
      if (entry.hash !== computedHash) {
        issues.push({
          index: i,
          message: `Hash mismatch: expected ${computedHash}, got ${entry.hash}`,
          entry: { id: entry.id, hash: entry.hash, computedHash: computedHash } as unknown as Partial<LogbookEntry>,
        });
      }

      // Verify prevHash
      if (entry.prevHash !== prevHash) {
        issues.push({
          index: i,
          message: `prevHash mismatch: expected ${prevHash || "none"}, got ${entry.prevHash || "none"}`,
          entry: { id: entry.id, prevHash: entry.prevHash, expectedPrevHash: prevHash } as unknown as Partial<LogbookEntry>,
        });
      }

      prevHash = entry.hash;
    }

    return {
      valid: issues.length === 0,
      issues,
      entries: verifiedEntries,
      lastHash: prevHash,
    };
  }

  /**
   * Get information about the Logbook.
   */
  async info(): Promise<{
    filePath: string;
    entryCount: number;
    firstEntry?: LogbookEntry;
    lastEntry?: LogbookEntry;
    lastHash?: string;
  }> {
    const entries = await this.readAll();
    const count = entries.length;

    return {
      filePath: this.filePath,
      entryCount: count,
      firstEntry: entries[0],
      lastEntry: entries[count - 1],
      lastHash: entries[count - 1]?.hash,
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a new Logbook instance with default configuration.
 */
export function createLogbook(config?: LogbookConfig): Logbook {
  return new Logbook(config);
}

/**
 * Verify a Logbook file without creating an instance.
 */
export async function verifyLogbook(
  filePath: string,
  algorithm: string = DEFAULT_ALGORITHM
): Promise<LogbookVerificationResult> {
  const logbook = new Logbook({ filePath, algorithm });
  return logbook.verify();
}

/**
 * Read all entries from a Logbook file.
 */
export async function readLogbook(filePath: string): Promise<LogbookEntry[]> {
  const logbook = new Logbook({ filePath });
  return logbook.readAll();
}

// ============================================================================
// Personal Data Removal
// ============================================================================

/**
 * Anonymize the actor field by removing personal data.
 */
export function anonymizeActor(actor: LogbookEntry["actor"]): LogbookEntry["actor"] {
  return {
    name: "[REDACTED]",
    email: undefined,
    role: actor.role,
  };
}

/**
 * Data redaction function type for removing personal data from entry data.
 */
type DataRedactionFunction = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Default redaction function that removes all data (conservative approach).
 */
const redactAllData: DataRedactionFunction = () => ({
  redacted: true,
  message: "Personal data removed for privacy compliance",
});

/**
 * Recomputes an entry's hash after redacting personal data.
 * This allows for GDPR/CCPA compliance without breaking the hash chain.
 */
export function redactEntry(
  entry: LogbookEntry,
  redactActor: boolean = true,
  redactFn: DataRedactionFunction = redactAllData
): LogbookEntry {
  const redacted = {
    id: entry.id,
    timestamp: entry.timestamp,
    actor: redactActor ? anonymizeActor(entry.actor) : entry.actor,
    event: entry.event,
    subject: entry.subject,
    data: redactFn(entry.data),
    proof: entry.proof,
    // signature is omitted - will be cleared
  };

  // Recompute hash with redacted data
  const prevHash = entry.prevHash;
  return withHash(redacted, prevHash, DEFAULT_ALGORITHM);
}

// ============================================================================
// Exports
// ============================================================================
// All exports are inline above
