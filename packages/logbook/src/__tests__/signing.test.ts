import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogbook, generateSigningKey, signerFromPem, verifyLogbook, type Keyring } from "../index";

let file: string;
beforeEach(() => {
  file = path.join(os.tmpdir(), `blkc-lb-sign-${Date.now()}-${Math.random()}.jsonl`);
});

const ada = generateSigningKey();
const eve = generateSigningKey();
const keyring = (actor = "ada"): Keyring => ({ keys: [{ id: ada.keyId, actor, publicKey: ada.publicKeyPem }] });

async function writeSigned(n = 3, signerPem = ada.privateKeyPem, actor = "ada") {
  const lb = createLogbook({ filePath: file, signer: signerFromPem(signerPem) });
  for (let i = 0; i < n; i++) await lb.append({ actor: { name: actor }, event: "card.moved", data: { i } });
}

const lines = () => fs.readFileSync(file, "utf8").trim().split("\n");
const rewrite = (edit: (rows: Record<string, unknown>[]) => void) => {
  const rows = lines().map((l) => JSON.parse(l) as Record<string, unknown>);
  edit(rows);
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
};

describe("logbook signatures (story 7.2)", () => {
  it("signs every entry and verifies against the trusted key", async () => {
    await writeSigned();
    expect(lines().every((l) => (JSON.parse(l) as { signature: string }).signature.startsWith(`ed25519:${ada.keyId}:`))).toBe(true);
    const result = await verifyLogbook(file, undefined, { keyring: keyring(), requireSignatures: true });
    expect(result.valid).toBe(true);
    expect(result.signedEntries).toBe(3);
  });

  it("an edited entry fails with E401 at its line", async () => {
    await writeSigned();
    rewrite((rows) => { (rows[1]!.data as { i: number }).i = 99; });
    const result = await verifyLogbook(file, undefined, { keyring: keyring() });
    expect(result.valid).toBe(false);
    expect(result.firstIssue).toMatchObject({ code: "BLKC-E401", line: 2 });
  });

  it("a removed entry breaks the chain with E402", async () => {
    await writeSigned();
    rewrite((rows) => { rows.splice(1, 1); });
    const result = await verifyLogbook(file);
    expect(result.firstIssue).toMatchObject({ code: "BLKC-E402", line: 2 });
  });

  it("a rebuilt chain with forged signatures fails with E405", async () => {
    // Someone edits the file and recomputes every hash, which the chain alone can't catch.
    await writeSigned(2, eve.privateKeyPem, "ada");
    rewrite((rows) => {
      for (const row of rows) row.signature = String(row.signature).replace(eve.keyId, ada.keyId);
    });
    const result = await verifyLogbook(file, undefined, { keyring: keyring() });
    expect(result.valid).toBe(false);
    expect(result.firstIssue).toMatchObject({ code: "BLKC-E405", line: 1 });
  });

  it("a key nobody trusts fails with E404", async () => {
    await writeSigned(1, eve.privateKeyPem);
    const result = await verifyLogbook(file, undefined, { keyring: keyring() });
    expect(result.firstIssue).toMatchObject({ code: "BLKC-E404", line: 1 });
  });

  it("unsigned entries fail with E403 only when signatures are required", async () => {
    const lb = createLogbook({ filePath: file });
    await lb.append({ actor: { name: "ada" }, event: "x" });
    expect((await verifyLogbook(file, undefined, { keyring: keyring() })).valid).toBe(true);
    const strict = await verifyLogbook(file, undefined, { keyring: keyring(), requireSignatures: true });
    expect(strict.firstIssue).toMatchObject({ code: "BLKC-E403", line: 1 });
  });

  it("a trusted key signing for a different actor fails with E407", async () => {
    await writeSigned(1, ada.privateKeyPem, "mallory");
    const result = await verifyLogbook(file, undefined, { keyring: keyring("ada") });
    expect(result.firstIssue).toMatchObject({ code: "BLKC-E407", line: 1 });
  });

  it("a malformed signature fails with E406", async () => {
    await writeSigned(1);
    rewrite((rows) => { rows[0]!.signature = "rsa:nope"; });
    const result = await verifyLogbook(file, undefined, { keyring: keyring() });
    expect(result.firstIssue).toMatchObject({ code: "BLKC-E406", line: 1 });
  });

  it("an unreadable line fails with E400 and its line number", async () => {
    await writeSigned(2);
    fs.appendFileSync(file, "{not json\n");
    const result = await verifyLogbook(file);
    expect(result.firstIssue).toMatchObject({ code: "BLKC-E400", line: 3 });
  });
});
