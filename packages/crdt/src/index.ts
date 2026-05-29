// =============================================================================
// @onegrid/crdt
//
// Collaborative editing bridge. Two lineage-agnostic ports:
//
//   - Yjs (YATA-family): observe(Y.Map → row table); apply local edits as
//     Y.Map.set() so they propagate via Yjs's own awareness/sync.
//   - Automerge: doc.change((d) => d.rows[k] = ...); observe via heads
//     diff.
//
// We don't import the libraries directly — the bridge takes a structural
// "doc" port. Adopters pass either:
//   bindYjsRows({ map: yDoc.getMap('rows'), onDiff })
//   bindAutomergeRows({ doc, getRows, onChange, onDiff })
//
// Output is a `RowDiff` stream identical to the v0.0.8 CDC adapter shape,
// so collaborative edits compose with optimistic mutations, temporal
// time-travel, and the DBSP operator graph without translation.
// =============================================================================

import type { RowDiff } from '@onegrid/protocol';

// -----------------------------------------------------------------------------
// Shared shape
// -----------------------------------------------------------------------------

/** @beta */
export interface CrdtBridge {
  /** Stop observing changes; release any subscription handles. */
  readonly close: () => void;
  /** Last applied version (monotonic per bridge). */
  readonly lastVersion: () => number;
}

// -----------------------------------------------------------------------------
// Yjs port
// -----------------------------------------------------------------------------

/**
 * Minimal structural subset of `Y.Map<unknown>` we need. The real Y.Map
 * has many more methods; we type-narrow to what the bridge actually
 * calls so adopters can pass the real instance without imports here.
 * @beta
 */
export interface YMapLike {
  readonly get: (key: string) => unknown;
  readonly set: (key: string, value: unknown) => void;
  readonly delete: (key: string) => void;
  readonly entries: () => IterableIterator<[string, unknown]>;
  readonly observe: (
    handler: (event: YMapEventLike) => void,
  ) => void;
  readonly unobserve: (
    handler: (event: YMapEventLike) => void,
  ) => void;
}

/** @beta */
export interface YMapEventLike {
  readonly changes: {
    readonly keys: ReadonlyMap<string, {
      readonly action: 'add' | 'update' | 'delete';
      readonly oldValue?: unknown;
    }>;
  };
}

/** @beta */
export interface BindYjsRowsOptions {
  readonly map: YMapLike;
  readonly onDiff: (diff: RowDiff) => void;
  /** Optional local-edit hook; pass to support apply→broadcast paths. */
  readonly onError?: (err: unknown) => void;
}

/** @beta */
export function bindYjsRows(opts: BindYjsRowsOptions): CrdtBridge {
  let version = 0;
  const handler = (event: YMapEventLike): void => {
    for (const [key, info] of event.changes.keys) {
      version++;
      try {
        if (info.action === 'add') {
          const value = opts.map.get(key);
          opts.onDiff({
            kind: 'insert',
            version,
            pkey: key,
            fields: value as Record<string, unknown>,
          });
        } else if (info.action === 'update') {
          const value = opts.map.get(key);
          opts.onDiff({
            kind: 'update',
            version,
            pkey: key,
            fields: value as Record<string, unknown>,
          });
        } else {
          opts.onDiff({ kind: 'delete', version, pkey: key });
        }
      } catch (e) {
        opts.onError?.(e);
      }
    }
  };
  opts.map.observe(handler);
  return {
    close: () => opts.map.unobserve(handler),
    lastVersion: () => version,
  };
}

/** Apply a local insert / update / delete through the CRDT — propagates
 * @beta
 *  via Yjs sync just like a remote edit. */
export function applyLocalToYjs(
  map: YMapLike,
  diff: Pick<RowDiff, 'kind' | 'pkey' | 'fields'>,
): void {
  const key = String(diff.pkey);
  switch (diff.kind) {
    case 'insert':
    case 'update':
      map.set(key, diff.fields ?? {});
      return;
    case 'delete':
      map.delete(key);
      return;
  }
}

// -----------------------------------------------------------------------------
// Automerge port
// -----------------------------------------------------------------------------

/**
 * Automerge document shape we depend on. Adopters keep the real
 * Automerge document outside this package; the bridge hooks into the
 * heads-diff pattern.
 * @beta
 */
export interface AutomergeDocLike<TRow> {
  /** Read the row map as a plain JS dictionary. */
  readonly getRows: () => Readonly<Record<string, TRow>>;
}

/** @beta */
export interface AutomergeWatcherLike {
  /** Subscribe; the handler fires after each remote-or-local change. */
  readonly subscribe: (handler: () => void) => () => void;
}

/** @beta */
export interface BindAutomergeRowsOptions<TRow> {
  readonly doc: AutomergeDocLike<TRow>;
  readonly watcher: AutomergeWatcherLike;
  readonly onDiff: (diff: RowDiff) => void;
  readonly onError?: (err: unknown) => void;
}

/** @beta */
export function bindAutomergeRows<TRow>(
  opts: BindAutomergeRowsOptions<TRow>,
): CrdtBridge {
  let version = 0;
  let prev: Readonly<Record<string, TRow>> = opts.doc.getRows();
  const handler = (): void => {
    try {
      const next = opts.doc.getRows();
      const prevKeys = new Set(Object.keys(prev));
      const nextKeys = new Set(Object.keys(next));
      // Inserts + updates
      for (const k of nextKeys) {
        if (!prevKeys.has(k)) {
          version++;
          opts.onDiff({
            kind: 'insert',
            version,
            pkey: k,
            fields: next[k] as unknown as Record<string, unknown>,
          });
        } else if (!shallowEqual(prev[k], next[k])) {
          version++;
          opts.onDiff({
            kind: 'update',
            version,
            pkey: k,
            fields: next[k] as unknown as Record<string, unknown>,
          });
        }
      }
      // Deletes
      for (const k of prevKeys) {
        if (!nextKeys.has(k)) {
          version++;
          opts.onDiff({ kind: 'delete', version, pkey: k });
        }
      }
      prev = next;
    } catch (e) {
      opts.onError?.(e);
    }
  };
  const unsubscribe = opts.watcher.subscribe(handler);
  return {
    close: unsubscribe,
    lastVersion: () => version,
  };
}

function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) {
      return false;
    }
  }
  return true;
}
