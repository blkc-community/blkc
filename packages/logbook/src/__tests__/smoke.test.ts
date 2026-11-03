import { describe, expect, it, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createLogbook } from '../index';

describe('BLKC logbook smoke', () => {
  let file: string;
  beforeEach(() => {
    file = path.join(os.tmpdir(), `blkc-lb-${Date.now()}-${Math.random()}.jsonl`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
  });

  it('appends and verifies a chain', async () => {
    const lb = createLogbook({ filePath: file });
    await lb.append({ actor: { name: 'tester' }, event: 'test.event', data: { n: 1 } });
    const result = await lb.verify();
    expect(result.valid).toBe(true);
    expect(result.entries).toHaveLength(1);
  });
});