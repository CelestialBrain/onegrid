// =============================================================================
// PgCdcAdapter — unit tests against a fake LISTEN client.
// =============================================================================

import { describe, expect, it, vi } from 'vitest';
import type { RowDiff } from '@onegrid/protocol';
import {
  createPgCdcAdapter,
  SnapshotRequired,
  type PgListenClient,
  type PgNotification,
} from '../cdc';

interface FakeListenClient extends PgListenClient {
  emit(notification: PgNotification): void;
  queries: string[];
}

function makeFakeListenClient(): FakeListenClient {
  let listener: ((msg: PgNotification) => void) | null = null;
  const queries: string[] = [];
  return {
    queries,
    async query(text: string) {
      queries.push(text);
    },
    on(_event, l) {
      listener = l;
    },
    off() {
      listener = null;
    },
    emit(notification) {
      listener?.(notification);
    },
  };
}

function diff(version: number, kind: RowDiff['kind'] = 'update'): RowDiff {
  return { version, kind, pkey: `r${String(version)}` };
}

describe('createPgCdcAdapter — subscribe / LISTEN', () => {
  it('issues LISTEN on first subscribe and UNLISTEN on last unsubscribe', () => {
    const client = makeFakeListenClient();
    const adapter = createPgCdcAdapter({
      client,
      resyncQuery: async () => [],
    });

    const unsubA = adapter.subscribe(() => undefined);
    const unsubB = adapter.subscribe(() => undefined);
    expect(client.queries).toEqual(['LISTEN onegrid_row_diff']);

    unsubA();
    expect(client.queries).toEqual(['LISTEN onegrid_row_diff']);

    unsubB();
    expect(client.queries).toEqual([
      'LISTEN onegrid_row_diff',
      'UNLISTEN onegrid_row_diff',
    ]);
  });

  it('parses NOTIFY payloads into RowDiff and forwards to subscribers', () => {
    const client = makeFakeListenClient();
    const adapter = createPgCdcAdapter({
      client,
      resyncQuery: async () => [],
    });
    const onDiff = vi.fn();
    adapter.subscribe(onDiff);
    client.emit({
      channel: 'onegrid_row_diff',
      payload: JSON.stringify(diff(1)),
    });
    expect(onDiff).toHaveBeenCalledWith(diff(1));
  });

  it('ignores notifications on a different channel', () => {
    const client = makeFakeListenClient();
    const adapter = createPgCdcAdapter({
      client,
      resyncQuery: async () => [],
    });
    const onDiff = vi.fn();
    adapter.subscribe(onDiff);
    client.emit({
      channel: 'unrelated',
      payload: JSON.stringify(diff(1)),
    });
    expect(onDiff).not.toHaveBeenCalled();
  });

  it('ignores malformed JSON payloads silently', () => {
    const client = makeFakeListenClient();
    const adapter = createPgCdcAdapter({
      client,
      resyncQuery: async () => [],
    });
    const onDiff = vi.fn();
    adapter.subscribe(onDiff);
    client.emit({ channel: 'onegrid_row_diff', payload: 'not-json' });
    client.emit({ channel: 'onegrid_row_diff', payload: '{"missing":"fields"}' });
    expect(onDiff).not.toHaveBeenCalled();
  });

  it('honors a custom channel name (with quoting)', () => {
    const client = makeFakeListenClient();
    const adapter = createPgCdcAdapter({
      client,
      channel: 'My-Channel',
      resyncQuery: async () => [],
    });
    adapter.subscribe(() => undefined);
    expect(client.queries[0]).toBe('LISTEN "My-Channel"');
  });
});

describe('createPgCdcAdapter — resync', () => {
  it('returns an incremental ResyncResponse from the resync query', async () => {
    const client = makeFakeListenClient();
    const diffs = [diff(11), diff(12), diff(13)];
    const adapter = createPgCdcAdapter({
      client,
      resyncQuery: async (from) => {
        expect(from).toBe(10);
        return diffs;
      },
    });
    const response = await adapter.resync({ fromVersion: 10 });
    expect(response.fromVersion).toBe(10);
    expect(response.toVersion).toBe(13);
    expect(response.diffs).toEqual(diffs);
    expect(response.snapshot).toBeUndefined();
  });

  it('falls back to a snapshot when more than maxResyncDiffs', async () => {
    const client = makeFakeListenClient();
    const diffs = Array.from({ length: 5 }, (_, i) => diff(i + 1));
    const adapter = createPgCdcAdapter({
      client,
      maxResyncDiffs: 3,
      resyncQuery: async () => diffs,
    });
    const response = await adapter.resync({ fromVersion: 0 });
    expect(response.snapshot).toBe(true);
    expect(response.diffs).toEqual([]);
    expect(response.toVersion).toBe(5);
  });

  it('honors a SnapshotRequired thrown by the resync query', async () => {
    const client = makeFakeListenClient();
    const adapter = createPgCdcAdapter({
      client,
      resyncQuery: async () => {
        throw new SnapshotRequired(99);
      },
    });
    const response = await adapter.resync({ fromVersion: 1 });
    expect(response.snapshot).toBe(true);
    expect(response.toVersion).toBe(99);
  });

  it('returns the same fromVersion / toVersion when the diff list is empty', async () => {
    const client = makeFakeListenClient();
    const adapter = createPgCdcAdapter({
      client,
      resyncQuery: async () => [],
    });
    const response = await adapter.resync({ fromVersion: 42 });
    expect(response.fromVersion).toBe(42);
    expect(response.toVersion).toBe(42);
    expect(response.diffs).toEqual([]);
  });
});

describe('createPgCdcAdapter — close', () => {
  it('issues UNLISTEN and clears subscribers', async () => {
    const client = makeFakeListenClient();
    const adapter = createPgCdcAdapter({
      client,
      resyncQuery: async () => [],
    });
    adapter.subscribe(() => undefined);
    await adapter.close();
    expect(client.queries).toContain('UNLISTEN onegrid_row_diff');
  });
});
