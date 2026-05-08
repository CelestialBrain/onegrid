// =============================================================================
// BlockCache
//
// LRU-cached blocks of rows fetched from the server. Keyed by the canonical
// (fingerprint, cursor, direction, limit) tuple so the same block under the
// same query reuses the cached response, while a sort/filter change naturally
// produces a different key and a clean cache miss.
//
// Inflight tracking deduplicates concurrent requests for the same key:
// the second caller awaits the first's promise instead of issuing a new
// network round-trip.
//
// LRU is implemented via JavaScript's `Map` insertion order, which is
// guaranteed to be insertion-order under iteration. On `get`, the entry is
// re-inserted (delete + set) to bump it to the most-recent position.
// =============================================================================

import type { BlockRequest, BlockResponse } from '@onegrid/protocol';
import { fingerprintQuery } from './fingerprint';

export interface BlockCacheOptions {
  /** Maximum number of blocks to retain. Older entries are evicted (LRU). */
  readonly maxBlocks: number;
}

interface Entry {
  readonly value: BlockResponse;
  readonly fingerprint: string;
  /** Wall-clock ms when this entry was last read. */
  lastUsedAt: number;
}

export class BlockCache {
  private readonly maxBlocks: number;
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<BlockResponse>>();

  constructor(options: BlockCacheOptions) {
    if (options.maxBlocks <= 0) {
      throw new Error('BlockCache: maxBlocks must be > 0.');
    }
    this.maxBlocks = options.maxBlocks;
  }

  /** Compose a stable cache key for a request. */
  static keyFor(req: BlockRequest): string {
    const fp = BlockCache.fingerprintFor(req);
    const cursorPart = req.cursor === null ? '@first' : `@${req.cursor}`;
    return `${fp}::${cursorPart}::${req.direction}::${req.limit}`;
  }

  static fingerprintFor(req: BlockRequest): string {
    return fingerprintQuery(
      req.sort,
      req.filter,
      req.grouping,
      req.pivot,
      req.parentId,
    );
  }

  get(key: string): BlockResponse | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    entry.lastUsedAt = Date.now();
    // Bump to most-recent position for LRU.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: BlockResponse, fingerprint: string): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }
    this.entries.set(key, { value, fingerprint, lastUsedAt: Date.now() });
    while (this.entries.size > this.maxBlocks) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }

  inflightGet(key: string): Promise<BlockResponse> | undefined {
    return this.inflight.get(key);
  }

  inflightSet(key: string, promise: Promise<BlockResponse>): void {
    this.inflight.set(key, promise);
    const cleanup = (): void => {
      if (this.inflight.get(key) === promise) {
        this.inflight.delete(key);
      }
    };
    promise.then(cleanup, cleanup);
  }

  /**
   * Drop entries whose fingerprint differs from the given one. Returns the
   * number of evicted entries. Used when the active query (sort / filter /
   * group / pivot) changes — old blocks are no longer valid for the new
   * query, so freeing them up makes room for fresh fetches sooner.
   */
  retainFingerprint(fingerprint: string): number {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.fingerprint !== fingerprint) {
        this.entries.delete(key);
        removed++;
      }
    }
    return removed;
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
