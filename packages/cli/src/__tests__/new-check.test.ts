import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CLI = path.resolve(__dirname, "..", "..", "dist", "blkc.cjs");

describe("blkc new + check", () => {
  it("scaffolds a block that passes check", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "blkc-new-"));
    try {
      execFileSync(process.execPath, [CLI, "new", "block", "demo"], { cwd: dir, stdio: "pipe" });
      const out = execFileSync(process.execPath, [CLI, "check", "."], { cwd: dir, encoding: "utf8" });
      expect(out).toContain("1 valid, 0 invalid");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("scaffolds a kit that passes check", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "blkc-new-"));
    try {
      execFileSync(process.execPath, [CLI, "new", "kit", "demo"], { cwd: dir, stdio: "pipe" });
      const out = execFileSync(process.execPath, [CLI, "check", "."], { cwd: dir, encoding: "utf8" });
      expect(out).toContain("1 valid, 0 invalid");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("scaffolds a circuit that passes check", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "blkc-new-"));
    try {
      execFileSync(process.execPath, [CLI, "new", "circuit", "demo"], { cwd: dir, stdio: "pipe" });
      const out = execFileSync(process.execPath, [CLI, "check", "."], { cwd: dir, encoding: "utf8" });
      expect(out).toContain("1 valid, 0 invalid");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});