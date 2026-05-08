// =============================================================================
// MyCdcAdapter — unit tests against a fake outbox queryable.
//
// Uses caller-injected setTimeout/clearTimeout so the polling loop
// is deterministic and doesn't actually consume real time.
// =============================================================================

import { describe, expect, it, vi } from 'vitest';
import type { RowDiff } from '@onegrid/protocol';
import {
  createMyCdcAdapter,
  SnapshotRequired,
  type MyOutboxQueryable,
} from '../cdc';

function makeFakeClient(
  rowsFor: (sql: string, params: ReadonlyArray<unknown>) => ReadonlyArray<Record<string, unknown>>,
): MyOutboxQueryable & { calls: { sql: string; params: ReadonlyArray<unknown> }[] } {
  const calls: { sql: string; params: ReadonlyArray<unknown> }[] = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params: params ?? [] });
      const rows = rowsFor(sql, params ?? []);
      return [rows, null];
    },
  };
}

function diff(version: number, kind: RowDiff['kind'] = 'update'): Record<string, unknown> {
  return { version, kind, pkey: `r${String(version)}` };
}

describe('createMyCdcAdapter — polling subscribe', () => {
  it('issues SELECT against the configured outbox table', async () => {
    const client = makeFakeClient(() => [diff(1)]);
    const adapter = createMyCdcAdapter({
      client,
      outboxTable: 'my_outbox',
      pollIntervalMs: 10,
    });
    const onDiff = vi.fn();
    adapter.subscribe(onDiff);
    await new Promise((r) => setTimeout(r, 5));
    expect(client.calls.length).toBeGreaterThanOrEqual(1);
    expect(client.calls[0]!.sql).toContain('FROM `my_outbox`');
    expect(client.calls[0]!.sql).toContain('`version` > ?');
  });

  it('forwards parsed RowDiffs to subscribers', async () => {
    let firstCall = true;
    const client = makeFakeClient(() => {
      if (firstCall) {
        firstCall = false;
        return [
          { version: 1, kind: 'insert', pkey: 'a', fields: '{"x":1}' },
          { version: 2, kind: 'update', pkey: 'a', fields: { y: 2 } },
        ];
      }
      return [];
    });
    const onDiff = vi.fn();
    const adapter = createMyCdcAdapter({
      client,
      pollIntervalMs: 100,
    });
    adapter.subscribe(onDiff);
    await new Promise((r) => setTimeout(r, 10));
    expect(onDiff).toHaveBeenCalledTimes(2);
    // JSON-string `fields` should round-trip to an object.
    expect(onDiff.mock.calls[0]![0]).toMatchObject({
      version: 1,
      kind: 'insert',
      pkey: 'a',
      fields: { x: 1 },
    });
    expect(onDiff.mock.calls[1]![0]).toMatchObject({
      version: 2,
      kind: 'update',
      pkey: 'a',
      fields: { y: 2 },
    });
    await adapter.close();
  });

  it('skips rows with malformed shapes silently', async () => {
    const client = makeFakeClient(() => [
      { version: 'not-a-number', kind: 'update', pkey: 'a' }, // bad version
      { version: 1, kind: 'something-else', pkey: 'a' },       // bad kind
      { version: 2, kind: 'delete', pkey: { obj: true } },      // bad pkey
      { version: 3, kind: 'update', pkey: 'b' },                // good
    ]);
    const onDiff = vi.fn();
    const adapter = createMyCdcAdapter({
      client,
      pollIntervalMs: 100,
    });
    adapter.subscribe(onDiff);
    await new Promise((r) => setTimeout(r, 10));
    expect(onDiff).toHaveBeenCalledTimes(1);
    expect(onDiff.mock.calls[0]![0]).toMatchObject({ version: 3, pkey: 'b' });
    await adapter.close();
  });

  it('advances lastVersion across polls so duplicates are skipped', async () => {
    const seen: number[] = [];
    let phase = 0;
    const client = makeFakeClient((_sql, params) => {
      const fromVersion = params[0];
      seen.push(fromVersion as number);
      if (phase === 0) {
        phase++;
        return [diff(1), diff(2), diff(3)];
      }
      return [];
    });
    const adapter = createMyCdcAdapter({
      client,
      pollIntervalMs: 5,
    });
    adapter.subscribe(() => undefined);
    await new Promise((r) => setTimeout(r, 30));
    // First poll asks fromVersion=-1; second asks fromVersion=3.
    expect(seen[0]).toBe(-1);
    expect(seen[1]).toBe(3);
    await adapter.close();
  });
});

describe('createMyCdcAdapter — resync', () => {
  it('returns an incremental ResyncResponse from the outbox', async () => {
    const client = makeFakeClient(() => [diff(11), diff(12), diff(13)]);
    const adapter = createMyCdcAdapter({ client });
    const response = await adapter.resync({ fromVersion: 10 });
    expect(response.fromVersion).toBe(10);
    expect(response.toVersion).toBe(13);
    expect(response.diffs).toEqual([
      { version: 11, kind: 'update', pkey: 'r11' },
      { version: 12, kind: 'update', pkey: 'r12' },
      { version: 13, kind: 'update', pkey: 'r13' },
    ]);
    expect(response.snapshot).toBeUndefined();
  });

  it('falls back to a snapshot when more than maxResyncDiffs', async () => {
    const allDiffs = Array.from({ length: 6 }, (_, i) => diff(i + 1));
    const client = makeFakeClient(() => allDiffs);
    const adapter = createMyCdcAdapter({
      client,
      maxResyncDiffs: 3,
    });
    const response = await adapter.resync({ fromVersion: 0 });
    expect(response.snapshot).toBe(true);
    expect(response.diffs).toEqual([]);
  });

  it('honors a SnapshotRequired thrown by the resync query', async () => {
    const client: MyOutboxQueryable = {
      async query() {
        throw new SnapshotRequired(99);
      },
    };
    const adapter = createMyCdcAdapter({ client });
    const response = await adapter.resync({ fromVersion: 1 });
    expect(response.snapshot).toBe(true);
    expect(response.toVersion).toBe(99);
  });

  it('returns the same fromVersion / toVersion when the diff list is empty', async () => {
    const client = makeFakeClient(() => []);
    const adapter = createMyCdcAdapter({ client });
    const response = await adapter.resync({ fromVersion: 42 });
    expect(response.toVersion).toBe(42);
    expect(response.diffs).toEqual([]);
  });
});

describe('createMyCdcAdapter — close', () => {
  it('clears subscribers and stops polling', async () => {
    const client = makeFakeClient(() => []);
    const adapter = createMyCdcAdapter({ client, pollIntervalMs: 5 });
    adapter.subscribe(() => undefined);
    await new Promise((r) => setTimeout(r, 5));
    const callsBeforeClose = client.calls.length;
    await adapter.close();
    await new Promise((r) => setTimeout(r, 30));
    expect(client.calls.length).toBe(callsBeforeClose);
  });
});
