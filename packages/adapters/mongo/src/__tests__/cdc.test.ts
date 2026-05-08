// =============================================================================
// MongoCdcAdapter — unit tests against a fake change stream.
// =============================================================================

import { describe, expect, it, vi } from 'vitest';
import type { RowDiff } from '@onegrid/protocol';
import {
  createMongoCdcAdapter,
  type MongoChangeEvent,
  type MongoChangeStream,
  type MongoCollectionForCdc,
} from '../cdc';

function makeFakeStream(): MongoChangeStream & {
  emit(event: MongoChangeEvent): void;
  closed: boolean;
} {
  let listener: ((event: MongoChangeEvent) => void) | null = null;
  return {
    closed: false,
    on(event, l) {
      if (event === 'change') {
        listener = (e) => l(e as unknown);
      }
    },
    async close() {
      this.closed = true;
    },
    emit(event) {
      listener?.(event);
    },
  };
}

function makeFakeCollection(stream: MongoChangeStream): MongoCollectionForCdc {
  return {
    watch() {
      return stream;
    },
  };
}

describe('createMongoCdcAdapter — change stream', () => {
  it('forwards inserts as insert RowDiff', () => {
    const stream = makeFakeStream();
    const adapter = createMongoCdcAdapter({ collection: makeFakeCollection(stream) });
    const onDiff = vi.fn();
    adapter.subscribe(onDiff);
    stream.emit({
      _id: { resumeTokenA: 1 },
      operationType: 'insert',
      documentKey: { _id: 'doc-1' },
      fullDocument: { _id: 'doc-1', x: 1 },
    });
    expect(onDiff).toHaveBeenCalledWith({
      kind: 'insert',
      version: 0,
      pkey: 'doc-1',
      fields: { _id: 'doc-1', x: 1 },
    });
  });

  it('forwards update events with updateDescription.updatedFields when fullDocument is absent', () => {
    const stream = makeFakeStream();
    const adapter = createMongoCdcAdapter({ collection: makeFakeCollection(stream) });
    const onDiff = vi.fn();
    adapter.subscribe(onDiff);
    stream.emit({
      _id: { resumeTokenA: 2 },
      operationType: 'update',
      documentKey: { _id: 'doc-2' },
      updateDescription: { updatedFields: { x: 99 } },
    });
    expect(onDiff).toHaveBeenCalledWith({
      kind: 'update',
      version: 0,
      pkey: 'doc-2',
      fields: { x: 99 },
    });
  });

  it('forwards delete events with no fields', () => {
    const stream = makeFakeStream();
    const adapter = createMongoCdcAdapter({ collection: makeFakeCollection(stream) });
    const onDiff = vi.fn();
    adapter.subscribe(onDiff);
    stream.emit({
      _id: { resumeTokenA: 3 },
      operationType: 'delete',
      documentKey: { _id: 'doc-3' },
    });
    expect(onDiff).toHaveBeenCalledWith({
      kind: 'delete',
      version: 0,
      pkey: 'doc-3',
    });
  });

  it('skips drop / rename / invalidate events', () => {
    const stream = makeFakeStream();
    const adapter = createMongoCdcAdapter({ collection: makeFakeCollection(stream) });
    const onDiff = vi.fn();
    adapter.subscribe(onDiff);
    stream.emit({ _id: {}, operationType: 'drop' });
    stream.emit({ _id: {}, operationType: 'rename' });
    stream.emit({ _id: {}, operationType: 'invalidate' });
    expect(onDiff).not.toHaveBeenCalled();
  });

  it('coerces non-string ObjectId-like _id to string via toString()', () => {
    const stream = makeFakeStream();
    const adapter = createMongoCdcAdapter({ collection: makeFakeCollection(stream) });
    const onDiff = vi.fn();
    adapter.subscribe(onDiff);
    const fakeObjectId = {
      toString: () => 'objectid-hex',
    };
    stream.emit({
      _id: { resumeTokenA: 4 },
      operationType: 'insert',
      documentKey: { _id: fakeObjectId },
      fullDocument: { _id: fakeObjectId, x: 1 },
    });
    const captured = onDiff.mock.calls[0]![0] as RowDiff;
    expect(captured.pkey).toBe('objectid-hex');
  });

  it('lastResumeToken tracks across events', () => {
    const stream = makeFakeStream();
    const adapter = createMongoCdcAdapter({ collection: makeFakeCollection(stream) });
    adapter.subscribe(() => undefined);
    expect(adapter.lastResumeToken()).toBeNull();
    stream.emit({
      _id: { token: 'A' },
      operationType: 'insert',
      documentKey: { _id: 'a' },
      fullDocument: { _id: 'a' },
    });
    expect(adapter.lastResumeToken()).toEqual({ token: 'A' });
    stream.emit({
      _id: { token: 'B' },
      operationType: 'update',
      documentKey: { _id: 'a' },
      updateDescription: { updatedFields: {} },
    });
    expect(adapter.lastResumeToken()).toEqual({ token: 'B' });
  });
});

describe('createMongoCdcAdapter — resync', () => {
  it('returns snapshot:true when no resyncQuery is configured', async () => {
    const stream = makeFakeStream();
    const adapter = createMongoCdcAdapter({ collection: makeFakeCollection(stream) });
    const response = await adapter.resync({ fromVersion: 5 });
    expect(response.snapshot).toBe(true);
    expect(response.diffs).toEqual([]);
  });

  it('replays from resyncQuery when configured', async () => {
    const stream = makeFakeStream();
    const adapter = createMongoCdcAdapter({
      collection: makeFakeCollection(stream),
      resyncQuery: async () => [
        { kind: 'update', version: 6, pkey: 'r6' },
        { kind: 'update', version: 7, pkey: 'r7' },
      ],
    });
    const response = await adapter.resync({ fromVersion: 5 });
    expect(response.snapshot).toBeUndefined();
    expect(response.toVersion).toBe(7);
    expect(response.diffs.length).toBe(2);
  });

  it('falls back to snapshot when resync exceeds maxResyncDiffs', async () => {
    const stream = makeFakeStream();
    const allDiffs: RowDiff[] = Array.from({ length: 5 }, (_, i) => ({
      kind: 'update',
      version: i + 1,
      pkey: `r${String(i + 1)}`,
    }));
    const adapter = createMongoCdcAdapter({
      collection: makeFakeCollection(stream),
      resyncQuery: async () => allDiffs,
      maxResyncDiffs: 3,
    });
    const response = await adapter.resync({ fromVersion: 0 });
    expect(response.snapshot).toBe(true);
  });
});
