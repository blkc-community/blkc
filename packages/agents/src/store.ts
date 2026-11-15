/**
 * Where state lives. Today that is one JSON file beside a Kit, so nothing needs a server.
 * A hosted or self-hosted product supplies its own AgentStore, backed by a database, and
 * everything above this line keeps working.
 */

import { Buffer } from "node:buffer";
import { mkdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { setTimeout as wait } from "node:timers/promises";
import { MAX_STATE_BYTES, normalizeState, sweepStale, type AgentsState } from "./state.js";

export interface AgentStore {
  read(): Promise<AgentsState>;
  /** Change the state as one step. Changes from different agents never overwrite each other. */
  update(change: (state: AgentsState) => void): Promise<AgentsState>;
}

const LOCK_STALE_MS = 5000;

/** A store in one file. `fallback` is the starting state when the file doesn't exist yet. */
export function createFileStore(file: string, fallback?: () => unknown): AgentStore {
  const read = async (): Promise<AgentsState> => {
    try {
      return sweepStale(normalizeState(JSON.parse(await readFile(file, "utf8"))));
    } catch {
      return sweepStale(normalizeState(fallback?.()));
    }
  };
  return {
    read,
    async update(change) {
      const lock = `${file}.lock`;
      let held = false;
      for (let attempt = 0; attempt < 80 && !held; attempt++) {
        try {
          await mkdir(lock);
          held = true;
        } catch {
          try {
            // Whoever held this crashed.
            if (Date.now() - (await stat(lock)).mtimeMs > LOCK_STALE_MS) await rmdir(lock);
          } catch {
            // gone already
          }
          await wait(25);
        }
      }
      if (!held) throw new Error("The office is busy. Try again.");
      try {
        const state = await read();
        const wasDone = new Set(state.tasks.filter((task) => task.state === "done").map((task) => task.title));
        change(state);
        const next = sweepStale(normalizeState(state));
        // Progress counts every task ever finished, so deleting one doesn't lose it.
        next.stats.questsDone += next.tasks.filter((task) => task.state === "done" && !wasDone.has(task.title)).length;
        const body = JSON.stringify(next, null, 2) + "\n";
        if (Buffer.byteLength(body) > MAX_STATE_BYTES) throw new Error("The office state is too large.");
        const temp = `${file}.${process.pid}.tmp`;
        await writeFile(temp, body);
        try {
          await rename(temp, file);
        } catch (error) {
          await rm(temp, { force: true });
          throw error;
        }
        return next;
      } finally {
        await rmdir(lock).catch(() => undefined);
      }
    },
  };
}
