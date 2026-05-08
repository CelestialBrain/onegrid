// =============================================================================
// Postgres LISTEN/NOTIFY CDC adapter.
//
// Conforms to the universal `CdcAdapter` shape from @onegrid/ssrm
// without depending on it (per the architectural rule that adapters
// depend only on @onegrid/protocol). Consumers pair this with
// @onegrid/ssrm's `createRowDiffStream` to get gap detection +
// resync.
//
// Wire flow:
//   1. The adapter calls `LISTEN onegrid_row_diff` on a dedicated
//      connection.
//   2. The application's database trigger (DDL-side, owned by the
//      schema deployer — see README) emits NOTIFY messages whose
//      payload is a JSON-serialized `RowDiff`:
//        NOTIFY onegrid_row_diff, '{"version":42,"kind":"update",...}'
//   3. The adapter parses each NOTIFY payload and forwards to the
//      consumer's onDiff callback.
//
// Resync is delegated to a caller-supplied query: the adapter
// doesn't presume how the application stores its outbox. Pass a
// `resyncQuery` that returns rows shaped like RowDiff (plus a
// `version` ordering) and the adapter wraps it in a
// `ResyncResponse`.
// =============================================================================

import type {
  ResyncRequest,
  ResyncResponse,
  RowDiff,
  Unsubscribe,
} from '@onegrid/protocol';

/**
 * Subset of node-postgres `Client` we depend on. A real `pg.Client`
 * (NOT a Pool — LISTEN holds the connection) satisfies this.
 */
export interface PgListenClient {
  query(text: string): Promise<unknown>;
  on(event: 'notification', listener: (msg: PgNotification) => void): void;
  off?(event: 'notification', listener: (msg: PgNotification) => void): void;
}

export interface PgNotification {
  readonly channel: string;
  readonly payload?: string;
}

export interface PgCdcAdapterOptions {
  /** Dedicated `pg.Client` instance. Must be connected; the
   *  adapter does not call `connect()`. Pool clients are
   *  inappropriate — LISTEN is per-session. */
  readonly client: PgListenClient;
  /** NOTIFY channel name. Default: `onegrid_row_diff`. */
  readonly channel?: string;
  /** Resync query factory: given `fromVersion`, return a row set
   *  shaped like { version, kind, pkey, fields }. The adapter
   *  packages those into a `ResyncResponse`. When the gap is too
   *  large (caller-defined), throw `SnapshotRequired` and the
   *  adapter sets `snapshot: true` in the response. */
  readonly resyncQuery: (
    fromVersion: number,
  ) => Promise<ReadonlyArray<RowDiff>>;
  /** Maximum number of diffs the resync query will return before
   *  the adapter falls back to a snapshot response. Default: 10000.
   *  Tune to your application's outbox retention. */
  readonly maxResyncDiffs?: number;
}

export class SnapshotRequired extends Error {
  constructor(public readonly toVersion: number) {
    super(
      `@onegrid/postgres: snapshot required (resync window exceeded; toVersion=${String(toVersion)}).`,
    );
    this.name = 'SnapshotRequired';
  }
}

export interface PgCdcAdapter {
  readonly subscribe: (onDiff: (diff: RowDiff) => void) => Unsubscribe;
  readonly resync: (req: ResyncRequest) => Promise<ResyncResponse>;
  readonly close: () => Promise<void>;
}

export function createPgCdcAdapter(opts: PgCdcAdapterOptions): PgCdcAdapter {
  const channel = opts.channel ?? 'onegrid_row_diff';
  const maxResyncDiffs = opts.maxResyncDiffs ?? 10_000;
  const subscribers = new Set<(diff: RowDiff) => void>();
  let listening = false;

  const onNotification = (msg: PgNotification): void => {
    if (msg.channel !== channel) return;
    if (!msg.payload) return;
    let diff: RowDiff;
    try {
      diff = JSON.parse(msg.payload) as RowDiff;
    } catch {
      return; // ignore malformed payloads
    }
    if (typeof diff.version !== 'number' || !diff.kind || diff.pkey === undefined) {
      return;
    }
    for (const sub of subscribers) {
      try {
        sub(diff);
      } catch (err) {
        console.error('@onegrid/postgres: subscriber threw', err);
      }
    }
  };

  return {
    subscribe(onDiff): Unsubscribe {
      subscribers.add(onDiff);
      if (subscribers.size === 1 && !listening) {
        opts.client.on('notification', onNotification);
        void opts.client.query(`LISTEN ${quoteChannel(channel)}`);
        listening = true;
      }
      return () => {
        subscribers.delete(onDiff);
        if (subscribers.size === 0 && listening) {
          opts.client.off?.('notification', onNotification);
          void opts.client.query(`UNLISTEN ${quoteChannel(channel)}`);
          listening = false;
        }
      };
    },
    async resync(req: ResyncRequest): Promise<ResyncResponse> {
      try {
        const diffs = await opts.resyncQuery(req.fromVersion);
        if (diffs.length > maxResyncDiffs) {
          const lastVersion = diffs.reduce(
            (max, d) => Math.max(max, d.version),
            req.fromVersion,
          );
          return {
            fromVersion: req.fromVersion,
            toVersion: lastVersion,
            diffs: [],
            snapshot: true,
          };
        }
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
      if (listening) {
        opts.client.off?.('notification', onNotification);
        try {
          await opts.client.query(`UNLISTEN ${quoteChannel(channel)}`);
        } catch {
          // best-effort
        }
        listening = false;
      }
      subscribers.clear();
    },
  };
}

function quoteChannel(channel: string): string {
  // Postgres NOTIFY channel names follow identifier rules — must be
  // quoted if they contain anything other than [A-Za-z0-9_].
  if (/^[a-z_][a-z0-9_]*$/i.test(channel)) return channel;
  return `"${channel.replace(/"/g, '""')}"`;
}
