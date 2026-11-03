import { describe, expect, it } from 'vitest';
import { BlockSchema, CapabilityBlockSchema, LogbookEntrySchema } from '../index';

describe('BLKC core smoke', () => {
  it('parses a capability block', () => {
    const block = CapabilityBlockSchema.parse({
      id: 'sample-capability',
      name: 'Sample Capability',
      summary: 'A sample',
      description: 'desc',
      version: '0.1.0',
      kind: 'capability',
      entryPoint: 'index.ts',
    });
    expect(block.kind).toBe('capability');
  });

  it('union schema accepts a capability block', () => {
    expect(() => BlockSchema.parse({ id: 'sample-capability', name: 'A', summary: 's', description: 'd', version: '0.1.0', kind: 'capability', entryPoint: 'x' })).not.toThrow();
  });

  it('logbook entry parses', () => {
    const e = LogbookEntrySchema.parse({ id: 'abc', timestamp: new Date().toISOString(), actor: { name: 't' }, event: 'test', data: {} });
    expect(e.event).toBe('test');
  });
});