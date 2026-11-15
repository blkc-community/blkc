/**
 * Logbook signatures (story 7.2).
 *
 * The hash chain proves entries weren't changed or reordered. It can't prove who wrote them:
 * anyone who can edit the file can rebuild the chain. A signature can. Each writer (a person,
 * an agent, a runner) holds an Ed25519 private key. Each entry's hash is signed with it, and
 * anyone with the writer's public key can check the entry is genuine.
 *
 * Signature format: `ed25519:<keyId>:<base64 signature over the entry hash>`.
 * keyId: the first 16 hex characters of the SHA-256 of the public key (SPKI DER).
 *
 * Keys file (trusted public keys):
 *   { "keys": [ { "id": "<keyId>", "actor": "ada" | "*", "publicKey": "-----BEGIN PUBLIC KEY-----…" } ] }
 * `actor` limits which actor name the key may sign for; "*" allows any.
 *
 * Uses node:crypto only. No dependencies.
 */

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { Buffer } from "node:buffer";

export const SIGNATURE_SCHEME = "ed25519";

export interface LogbookSigner {
  keyId: string;
  privateKey: KeyObject | string;
}

export interface TrustedKey {
  id: string;
  /** The actor name this key may sign for, or "*" for any. */
  actor: string;
  publicKey: string;
}

export interface Keyring {
  keys: TrustedKey[];
}

export interface GeneratedKey {
  keyId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

export function keyIdFor(publicKey: KeyObject | string): string {
  const key = typeof publicKey === "string" ? createPublicKey(publicKey) : publicKey;
  const der = key.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").slice(0, 16);
}

export function generateSigningKey(): GeneratedKey {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    keyId: keyIdFor(publicKey),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

/** Build a signer from a private key PEM; the key id is derived from it. */
export function signerFromPem(privateKeyPem: string): LogbookSigner {
  const privateKey = createPrivateKey(privateKeyPem);
  return { keyId: keyIdFor(createPublicKey(privateKey)), privateKey };
}

export function signHash(hash: string, signer: LogbookSigner): string {
  const key = typeof signer.privateKey === "string" ? createPrivateKey(signer.privateKey) : signer.privateKey;
  const signature = sign(null, Buffer.from(hash, "utf8"), key).toString("base64");
  return `${SIGNATURE_SCHEME}:${signer.keyId}:${signature}`;
}

export type SignatureCheck =
  | { ok: true; keyId: string }
  | { ok: false; code: "BLKC-E403" | "BLKC-E404" | "BLKC-E405" | "BLKC-E406" | "BLKC-E407"; message: string };

const SIGNATURE_PATTERN = /^ed25519:([0-9a-f]{16}):([A-Za-z0-9+/]+={0,2})$/;

/** Check one entry's signature against a keyring. */
export function checkSignature(entry: { hash?: string; signature?: string; actor: { name: string } }, keyring: Keyring): SignatureCheck {
  if (!entry.signature) return { ok: false, code: "BLKC-E403", message: "Entry is not signed." };
  const match = SIGNATURE_PATTERN.exec(entry.signature);
  if (!match) return { ok: false, code: "BLKC-E406", message: "Signature is not in the form ed25519:<keyId>:<base64>." };
  const [, keyId, signature] = match as unknown as [string, string, string];
  if (!entry.hash) return { ok: false, code: "BLKC-E406", message: "Entry has no hash to check the signature against." };
  const trusted = keyring.keys.find((key) => key.id === keyId);
  if (!trusted) return { ok: false, code: "BLKC-E404", message: `Signed with key ${keyId}, which is not in the trusted keys.` };
  let publicKey: KeyObject;
  try {
    publicKey = createPublicKey(trusted.publicKey);
  } catch {
    return { ok: false, code: "BLKC-E404", message: `Trusted key ${keyId} could not be read.` };
  }
  // A keys file entry whose id doesn't match its own key is a mistake or a trick: refuse it.
  if (keyIdFor(publicKey) !== keyId) return { ok: false, code: "BLKC-E404", message: `Trusted key ${keyId} doesn't match its public key.` };
  const valid = verify(null, Buffer.from(entry.hash, "utf8"), publicKey, Buffer.from(signature, "base64"));
  if (!valid) return { ok: false, code: "BLKC-E405", message: `Signature by key ${keyId} does not match this entry.` };
  if (trusted.actor !== "*" && trusted.actor !== entry.actor.name) {
    return { ok: false, code: "BLKC-E407", message: `Key ${keyId} may sign for "${trusted.actor}", not "${entry.actor.name}".` };
  }
  return { ok: true, keyId };
}

/** Parse and sanity-check a keys file's JSON. */
export function parseKeyring(value: unknown): Keyring {
  const keys = (value as { keys?: unknown })?.keys;
  if (!Array.isArray(keys)) throw new Error('A keys file must look like { "keys": [ { "id", "actor", "publicKey" } ] }.');
  return {
    keys: keys.map((key, i) => {
      const k = key as Partial<TrustedKey>;
      if (typeof k.id !== "string" || typeof k.publicKey !== "string") throw new Error(`Key ${i + 1} needs an "id" and a "publicKey".`);
      return { id: k.id, actor: typeof k.actor === "string" && k.actor ? k.actor : "*", publicKey: k.publicKey };
    }),
  };
}
