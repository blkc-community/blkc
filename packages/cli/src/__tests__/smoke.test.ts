import { describe, expect, it } from 'vitest';
import { program } from '../index';

describe('BLKC CLI smoke', () => {
  it('exposes the blkc program', () => {
    expect(program.name()).toBe('blkc');
  });
});