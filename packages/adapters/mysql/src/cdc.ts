// =============================================================================
// MySQL polling-based CDC adapter.
//
// MySQL has no in-protocol equivalent of Postgres LISTEN/NOTIFY.
// The two viable CDC strategies are:
//   1. binlog parsing (canal, debezium, maxwell) — operationally
//      heavy; requires REPLICATION CLIENT privilege + ROW format
//      binlog config. Outside the scope of a simple adapter.
//   2. polling an outbox table — what this adapter ships. The
//      application's INSERT/UPDATE/DELETE triggers append rows to
//      `onegrid_outbox`; the adapter polls `WHERE version > ?
//      ORDER BY version` every `pollIntervalMs` and forwards new
//      rows as RowDiff events.
//
// Polling is higher latency than NOTIFY (default 500 ms) but
// requires zero special configuration. Production deployments that
// need lower latency should plug in binlog-based CDC; this adapter
// stays simple-and-portable.
//
// Conforms to the universal `CdcAdapter` shape from @onegrid/ssrm
// (without importing it, per the architectural rule).
// =============================================================================

import type {
  ResyncRequest,
  ResyncResponse,
  RowDiff,
  Unsubscribe,
} from '@onegrid/protocol';

export interface MyOutboxQueryable {
  query(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<readonly [ReadonlyArray<Record<string, unknown>>, unknown]>;
}

export interface MyCdcAdapterOptions {
  /** mysql2-compatible client / pool. */
  readonly client: MyOutboxQueryable;
  /** Outbox table name. Default `onegrid_outbox`. */
  readonly outboxTable?: string;
  /** Polling interval in milliseconds. Default 500. */
  readonly pollIntervalMs?: number;
  /** Maximum diffs to fetch per poll. Default 1000 — keeps the
   *  outbox query bounded under sustained write bursts. */
  readonly pollLimit?: number;
  /** Maximum diffs the resync query will return before falling
   *  back to a snapshot response. Default: 10_000. */
  readonly maxResyncDiffs?: number;
  /** Optional setTimeout / clearTimeout overrides for tests. */
  readonly setTimeoutImpl?: typeof setTimeout;
  readonly clearTimeoutImpl?: typeof clearTimeout;
}

export class SnapshotRequired extends Error {
  constructor(public readonly toVersion: number) {
    super(
      `@onegrid/mysql: snapshot required (resync window exceeded; toVersion=${String(toVersion)}).`,
    );
    this.name = 'SnapshotRequired';
  }
}

export interface MyCdcAdapter {
  readonly subscribe: (onDiff: (diff: RowDiff) => void) => Unsubscribe;
  readonly resync: (req: ResyncRequest) => Promise<ResyncResponse>;
  readonly close: () => Promise<void>;
}

export function createMyCdcAdapter(opts: MyCdcAdapterOptions): MyCdcAdapter {
  const outbox = opts.outboxTable ?? 'onegrid_outbox';
  const interval = opts.pollIntervalMs ?? 500;
  const pollLimit = opts.pollLimit ?? 1_000;
  const maxResync = opts.maxResyncDiffs ?? 10_000;
  const setT = opts.setTimeoutImpl ?? setTimeout;
  const clearT = opts.clearTimeoutImpl ?? clearTimeout;

  const subscribers = new Set<(diff: RowDiff) => void>();
  let lastVersion = -1;
  let pollHandle: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let polling = false;

  const fetchNew = async (): Promise<void> => {
    if (closed || polling) return;
    polling = true;
    try {
      const [rows] = await opts.client.query(
        `SELECT \`version\`, \`kind\`, \`pkey\`, \`fields\`
         FROM \`${escapeTableName(outbox)}\`
         WHERE \`version\` > ?
         ORDER BY \`version\`
         LIMIT ?`,
        [lastVersion, pollLimit],
      );
      for (const row of rows) {
        const diff = toRowDiff(row);
        if (!diff) continue;
        lastVersion = Math.max(lastVersion, diff.version);
        for (const sub of subscribers) {
          try {
            sub(diff);
          } catch (err) {
            console.error('@onegrid/mysql: subscriber threw', err);
          }
        }
      }
    } catch (err) {
      console.error('@onegrid/mysql: poll failed', err);
    } finally {
      polling = false;
      if (!closed && subscribers.size > 0) {
        pollHandle = setT(() => {
          void fetchNew();
        }, interval);
      }
    }
  };

  return {
    subscribe(onDiff): Unsubscribe {
      subscribers.add(onDiff);
      if (subscribers.size === 1 && !closed && !polling && pollHandle === null) {
        // Kick the loop off immediately so the first diff lands fast.
        void fetchNew();
      }
      return () => {
        subscribers.delete(onDiff);
        if (subscribers.size === 0 && pollHandle) {
          clearT(pollHandle);
          pollHandle = null;
        }
      };
    },
    async resync(req: ResyncRequest): Promise<ResyncResponse> {
      try {
        const [rows] = await opts.client.query(
          `SELECT \`version\`, \`kind\`, \`pkey\`, \`fields\`
           FROM \`${escapeTableName(outbox)}\`
           WHERE \`version\` > ?
           ORDER BY \`version\`
           LIMIT ?`,
          [req.fromVersion, maxResync + 1],
        );
        if (rows.length > maxResync) {
          const last = rows[maxResync] as Record<string, unknown> | undefined;
          const lastV = typeof last?.version === 'number' ? last.version : req.fromVersion;
          return {
            fromVersion: req.fromVersion,
            toVersion: lastV,
            diffs: [],
            snapshot: true,
          };
        }
        const diffs = rows
          .map(toRowDiff)
          .filter((d): d is RowDiff => d !== null);
        const toVersion =
          diffs.length > 0
            ? diffs[diffs.length - 1]!.version
            : req.fromVersion;
        return {
          fromVersion: req.fromVersion,
          toVersion,
          diffs,
        };
      } catch (err) {
        if (err instanceof SnapshotRequired) {
          return {
            fromVersion: req.fromVersion,
            toVersion: err.toVersion,
            diffs: [],
            snapshot: true,
          };
        }
        throw err;
      }
    },
    async close() {
      closed = true;
      if (pollHandle) {
        clearT(pollHandle);
        pollHandle = null;
      }
      subscribers.clear();
    },
  };
}

function toRowDiff(row: Record<string, unknown>): RowDiff | null {
  const version = row.version;
  const kind = row.kind;
  const pkey = row.pkey;
  if (typeof version !== 'number') return null;
  if (kind !== 'insert' && kind !== 'update' && kind !== 'delete') return null;
  if (typeof pkey !== 'string' && typeof pkey !== 'number') return null;
  // `fields` may arrive as a JSON string (mysql2 returns TEXT for
  // JSON columns by default unless `typeCast` is configured) or a
  // pre-parsed object.
  let fields: Record<string, unknown> | undefined;
  if (typeof row.fields === 'string') {
    try {
      fields = JSON.parse(row.fields) as Record<string, unknown>;
    } catch {
      fields = undefined;
    }
  } else if (row.fields && typeof row.fields === 'object') {
    fields = row.fields as Record<string, unknown>;
  }
  return {
    version,
    kind,
    pkey,
    ...(fields ? { fields } : {}),
  };
}

function escapeTableName(name: string): string {
  // The outbox name is consumer-supplied; embedded backticks doubled.
  return name.replace(/`/g, '``');
}
