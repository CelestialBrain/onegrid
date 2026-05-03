import { describe, expect, it } from 'vitest';
import { BlockCache } from '../cache';
import type { BlockRequest, BlockResponse } from '@onegrid/protocol';

const baseReq: BlockRequest = {
  cursor: null,
  direction: 'after',
  limit: 100,
  sort: [],
  filter: null,
};

const fakeResponse = (label: string): BlockResponse => ({
  encoding: 'json',
  rows: [{ id: label }],
  nextCursor: `next-${label}`,
  prevCursor: null,
});

describe('BlockCache', () => {
  it('returns undefined on miss', () => {
    const c = new BlockCache({ maxBlocks: 2 });
    expect(c.get('absent')).toBeUndefined();
  });

  it('returns the cached value on hit', () => {
    const c = new BlockCache({ maxBlocks: 2 });
    const key = BlockCache.keyFor(baseReq);
    const fp = BlockCache.fingerprintFor(baseReq);
    const res = fakeResponse('a');
    c.set(key, res, fp);
    expect(c.get(key)).toBe(res);
  });

  it('evicts least-recently-used entries when over capacity', () => {
    const c = new BlockCache({ maxBlocks: 2 });
    c.set('a', fakeResponse('a'), 'fp');
    c.set('b', fakeResponse('b'), 'fp');
    c.get('a'); // bump a to most recent
    c.set('c', fakeResponse('c'), 'fp'); // evicts b
    expect(c.get('a')).toBeDefined();
    expect(c.get('b')).toBeUndefined();
    expect(c.get('c')).toBeDefined();
    expect(c.size).toBe(2);
  });

  it('produces stable, distinguishing keys for differing requests', () => {
    const k1 = BlockCache.keyFor(baseReq);
    const k2 = BlockCache.keyFor({ ...baseReq, limit: 200 });
    const k3 = BlockCache.keyFor({
      ...baseReq,
      sort: [{ columnId: 'a', direction: 'asc' }],
    });
    expect(k1).not.toBe(k2);
    expect(k1).not.toBe(k3);
    expect(k2).not.toBe(k3);
    expect(BlockCache.keyFor(baseReq)).toBe(k1);
  });

  it('retainFingerprint drops mismatched entries', () => {
    const c = new BlockCache({ maxBlocks: 5 });
    c.set('a', fakeResponse('a'), 'fp1');
    c.set('b', fakeResponse('b'), 'fp1');
    c.set('c', fakeResponse('c'), 'fp2');
    expect(c.retainFingerprint('fp1')).toBe(1);
    expect(c.size).toBe(2);
  });

  it('inflight dedup returns the same promise', () => {
    const c = new BlockCache({ maxBlocks: 5 });
    const p = Promise.resolve(fakeResponse('a'));
    c.inflightSet('a', p);
    expect(c.inflightGet('a')).toBe(p);
  });

  it('inflight clears after the promise settles', async () => {
    const c = new BlockCache({ maxBlocks: 5 });
    const p = Promise.resolve(fakeResponse('a'));
    c.inflightSet('a', p);
    await p;
    // microtask drain
    await Promise.resolve();
    expect(c.inflightGet('a')).toBeUndefined();
  });

  it('rejects maxBlocks <= 0', () => {
    expect(() => new BlockCache({ maxBlocks: 0 })).toThrow();
  });
});
