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
  /**
   * - `'row'` (default, back-compat): values under each row key are plain
   *   objects; every update sends the full row to onDiff.
   * - `'field'`: values under each row key are themselves YMapLike. Field
   *   edits emit `update` diffs containing only the changed fields, so two
   *   peers editing different fields of the same row converge without
   *   stomping each other.
   */
  readonly granularity?: 'row' | 'field';
  /** Optional local-edit hook; pass to support apply→broadcast paths. */
  readonly onError?: (err: unknown) => void;
}

function readNestedRow(map: YMapLike): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of map.entries()) out[k] = v;
  return out;
}

/** @beta */
export function bindYjsRows(opts: BindYjsRowsOptions): CrdtBridge {
  let version = 0;
  const granularity = opts.granularity ?? 'row';
  const fieldUnsubscribes = new Map<string, () => void>();

  const onFieldUpdate = (key: string, changedFields: Record<string, unknown>): void => {
    version++;
    try {
      opts.onDiff({ kind: 'update', version, pkey: key, fields: changedFields });
    } catch (e) {
      opts.onError?.(e);
    }
  };

  const subscribeNested = (key: string): void => {
    if (granularity !== 'field') return;
    const child = opts.map.get(key);
    if (!isYMapLike(child)) return;
    const childMap = child as YMapLike;
    const childHandler = (event: YMapEventLike): void => {
      const changed: Record<string, unknown> = {};
      for (const [field, info] of event.changes.keys) {
        if (info.action === 'delete') {
          changed[field] = undefined;
        } else {
          changed[field] = childMap.get(field);
        }
      }
      if (Object.keys(changed).length > 0) onFieldUpdate(key, changed);
    };
    childMap.observe(childHandler);
    fieldUnsubscribes.set(key, () => childMap.unobserve(childHandler));
  };

  const handler = (event: YMapEventLike): void => {
    for (const [key, info] of event.changes.keys) {
      version++;
      try {
        if (info.action === 'add') {
          const value = opts.map.get(key);
          const fields =
            granularity === 'field' && isYMapLike(value)
              ? readNestedRow(value as YMapLike)
              : (value as Record<string, unknown>);
          opts.onDiff({ kind: 'insert', version, pkey: key, fields });
          subscribeNested(key);
        } else if (info.action === 'update') {
          // Root-map update for a row key means the row was replaced
          // wholesale (granularity 'row' path), or a nested-map handle
          // was swapped in.
          const value = opts.map.get(key);
          const fields =
            granularity === 'field' && isYMapLike(value)
              ? readNestedRow(value as YMapLike)
              : (value as Record<string, unknown>);
          opts.onDiff({ kind: 'update', version, pkey: key, fields });
          // Resubscribe to the new nested handle.
          fieldUnsubscribes.get(key)?.();
          fieldUnsubscribes.delete(key);
          subscribeNested(key);
        } else {
          fieldUnsubscribes.get(key)?.();
          fieldUnsubscribes.delete(key);
          opts.onDiff({ kind: 'delete', version, pkey: key });
        }
      } catch (e) {
        opts.onError?.(e);
      }
    }
  };
  opts.map.observe(handler);

  // Initial subscribe to existing nested rows so field edits on them are
  // captured from the start (matters when the bridge is attached after
  // initial state has loaded).
  if (granularity === 'field') {
    for (const [k] of opts.map.entries()) subscribeNested(k);
  }

  return {
    close: () => {
      opts.map.unobserve(handler);
      for (const off of fieldUnsubscribes.values()) off();
      fieldUnsubscribes.clear();
    },
    lastVersion: () => version,
  };
}

function isYMapLike(v: unknown): v is YMapLike {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as YMapLike).observe === 'function' &&
    typeof (v as YMapLike).entries === 'function'
  );
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

// -----------------------------------------------------------------------------
// Presence / awareness (Yjs port)
//
// `y-protocols/awareness` is the canonical Yjs presence channel: cursor
// position, selection, user identity. We don't import it — the bridge takes
// a structural `AwarenessLike` so adopters can pass the real instance, a
// shim over WebRTC datachannels, or a test fake.
// -----------------------------------------------------------------------------

/** @beta */
export interface AwarenessLike {
  /** Local client identifier (typically `doc.clientID`). */
  readonly clientID: number;
  readonly getStates: () => ReadonlyMap<number, Readonly<Record<string, unknown>>>;
  readonly getLocalState: () => Readonly<Record<string, unknown>> | null;
  readonly setLocalState: (state: Record<string, unknown> | null) => void;
  readonly setLocalStateField: (field: string, value: unknown) => void;
  /**
   * Subscribe to changes. The `change` event reports peers joining
   * (`added`), peers updating their state (`updated`), and peers leaving
   * (`removed`). The bridge dedups these into a single peer-map snapshot.
   */
  readonly on: (
    event: 'change' | 'update',
    handler: (changes: AwarenessChangesLike, origin: unknown) => void,
  ) => void;
  readonly off: (
    event: 'change' | 'update',
    handler: (changes: AwarenessChangesLike, origin: unknown) => void,
  ) => void;
}

/** @beta */
export interface AwarenessChangesLike {
  readonly added: ReadonlyArray<number>;
  readonly updated: ReadonlyArray<number>;
  readonly removed: ReadonlyArray<number>;
}

/**
 * A single peer's presence snapshot — clientID + whatever the peer chose to
 * publish (cursor, selection, color, name). The shape under `state` is
 * application-defined.
 * @beta
 */
export interface PresencePeer<TState = Record<string, unknown>> {
  readonly clientID: number;
  readonly state: Readonly<TState>;
  readonly isSelf: boolean;
}

/** @beta */
export interface BindYjsPresenceOptions<TState = Record<string, unknown>> {
  readonly awareness: AwarenessLike;
  readonly onPeers: (peers: ReadonlyArray<PresencePeer<TState>>) => void;
  readonly onError?: (err: unknown) => void;
}

/**
 * Subscribe to a Y.js awareness channel and translate its add/update/remove
 * events into a typed peer-snapshot list. Returns a bridge handle whose
 * `close()` unsubscribes; `lastVersion()` counts emitted snapshots.
 * @beta
 */
export function bindYjsPresence<TState = Record<string, unknown>>(
  opts: BindYjsPresenceOptions<TState>,
): CrdtBridge {
  let version = 0;
  const snapshot = (): void => {
    version++;
    try {
      const out: PresencePeer<TState>[] = [];
      for (const [clientID, state] of opts.awareness.getStates()) {
        out.push({
          clientID,
          state: state as Readonly<TState>,
          isSelf: clientID === opts.awareness.clientID,
        });
      }
      opts.onPeers(out);
    } catch (e) {
      opts.onError?.(e);
    }
  };
  const handler = (): void => snapshot();
  opts.awareness.on('change', handler);
  // Emit initial snapshot so consumers see existing peers immediately.
  snapshot();
  return {
    close: () => opts.awareness.off('change', handler),
    lastVersion: () => version,
  };
}

/** Convenience for setting the local presence state under a single field. @beta */
export function setLocalPresence(
  awareness: AwarenessLike,
  field: string,
  value: unknown,
): void {
  awareness.setLocalStateField(field, value);
}

/** Convenience for clearing the local presence state. @beta */
export function clearLocalPresence(awareness: AwarenessLike): void {
  awareness.setLocalState(null);
}

// -----------------------------------------------------------------------------

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
