// =============================================================================
// MongoDB change-streams CDC adapter.
//
// MongoDB has built-in change streams since 3.6 (replica-set
// required). This adapter opens `collection.watch()`, parses each
// change document into a RowDiff, and forwards through the universal
// stream interface from @onegrid/ssrm.
//
// Resume tokens replace version numbers in the Mongo world: every
// change document carries a `_id: ResumeToken` field, and you can
// resume the stream by passing it back via `watch({ resumeAfter })`.
// We map this onto the (version: number, RowDiff) shape with a
// monotonic counter — the resume token survives in
// `MyCdcAdapter.lastResumeToken` for callers that want to checkpoint
// it externally (cluster-wide ordering uses the token, not our local
// counter).
// =============================================================================

import type {
  ResyncRequest,
  ResyncResponse,
  RowDiff,
  Unsubscribe,
} from '@onegrid/protocol';

export type ResumeToken = unknown;

export interface MongoChangeEvent {
  /** Mongo's internal cluster-wide resume token. Opaque to us. */
  readonly _id: ResumeToken;
  /** `insert` | `update` | `replace` | `delete` | `drop` | … */
  readonly operationType: string;
  /** Document key — typically `{ _id: ObjectId }`. */
  readonly documentKey?: { _id?: unknown };
  /** Full document for inserts / replaces, or update deltas. */
  readonly fullDocument?: Record<string, unknown>;
  /** Update description for `update` events: which fields changed. */
  readonly updateDescription?: {
    readonly updatedFields?: Record<string, unknown>;
    readonly removedFields?: ReadonlyArray<string>;
  };
}

export interface MongoChangeStream {
  on(
    event: 'change' | 'error' | 'close',
    listener: (...args: unknown[]) => void,
  ): void;
  close(): Promise<void>;
}

export interface MongoCollectionForCdc {
  watch(options?: {
    fullDocument?: 'updateLookup' | 'whenAvailable';
    resumeAfter?: ResumeToken;
  }): MongoChangeStream;
}

export interface MongoCdcAdapterOptions {
  readonly collection: MongoCollectionForCdc;
  /** Translate a Mongo change event into a `RowDiff`. The default
   *  uses `documentKey._id.toString()` as `pkey` and `fullDocument`
   *  as `fields`; override when your collection has a different
   *  primary-key convention. */
  readonly toRowDiff?: (event: MongoChangeEvent, version: number) => RowDiff | null;
  /** Resume from a previously-stored token (e.g. when restarting a
   *  process) so events emitted while we were down are replayed. */
  readonly startAfter?: ResumeToken;
  /** Returns a copy of historical change events for resync requests.
   *  Mongo doesn't expose this natively — you'd back it with an
   *  application-side outbox or with `$changeStream` reads from a
   *  tail collection. When omitted, every resync responds with
   *  `snapshot: true`. */
  readonly resyncQuery?: (
    fromVersion: number,
  ) => Promise<ReadonlyArray<RowDiff>>;
  /** Maximum diffs the resync query will return before falling
   *  back to a snapshot. Default 10_000. */
  readonly maxResyncDiffs?: number;
}

export interface MongoCdcAdapter {
  readonly subscribe: (onDiff: (diff: RowDiff) => void) => Unsubscribe;
  readonly resync: (req: ResyncRequest) => Promise<ResyncResponse>;
  readonly close: () => Promise<void>;
  /** Last-seen resume token. Persist this if you want resumable
   *  streaming across process restarts. */
  readonly lastResumeToken: () => ResumeToken | null;
}

const defaultToRowDiff = (
  event: MongoChangeEvent,
  version: number,
): RowDiff | null => {
  const op = event.operationType;
  let kind: RowDiff['kind'];
  if (op === 'insert') kind = 'insert';
  else if (op === 'update' || op === 'replace') kind = 'update';
  else if (op === 'delete') kind = 'delete';
  else return null;
  const idRaw = event.documentKey?._id;
  if (idRaw === undefined) return null;
  const pkey =
    typeof idRaw === 'string' || typeof idRaw === 'number'
      ? idRaw
      : typeof (idRaw as { toString?: () => string }).toString === 'function'
        ? (idRaw as { toString: () => string }).toString()
        : null;
  if (pkey === null) return null;
  const fields =
    event.fullDocument ??
    event.updateDescription?.updatedFields ??
    undefined;
  return {
    kind,
    version,
    pkey,
    ...(fields ? { fields } : {}),
  };
};

export function createMongoCdcAdapter(
  opts: MongoCdcAdapterOptions,
): MongoCdcAdapter {
  const toRowDiff = opts.toRowDiff ?? defaultToRowDiff;
  const maxResync = opts.maxResyncDiffs ?? 10_000;
  const subscribers = new Set<(diff: RowDiff) => void>();
  let stream: MongoChangeStream | null = null;
  let lastToken: ResumeToken | null = opts.startAfter ?? null;
  let nextVersion = 0;
  let closed = false;

  const ensureStream = (): void => {
    if (stream || closed) return;
    stream = opts.collection.watch({
      fullDocument: 'updateLookup',
      ...(lastToken ? { resumeAfter: lastToken } : {}),
    });
    stream.on('change', (...args: unknown[]) => {
      const event = args[0] as MongoChangeEvent;
      lastToken = event._id;
      const diff = toRowDiff(event, nextVersion++);
      if (!diff) return;
      for (const sub of subscribers) {
        try {
          sub(diff);
        } catch (err) {
          console.error('@onegrid/mongo: subscriber threw', err);
        }
      }
    });
    stream.on('error', (...args: unknown[]) => {
      console.error('@onegrid/mongo: change stream error', args[0]);
    });
  };

  return {
    subscribe(onDiff): Unsubscribe {
      subscribers.add(onDiff);
      ensureStream();
      return () => {
        subscribers.delete(onDiff);
      };
    },
    async resync(req: ResyncRequest): Promise<ResyncResponse> {
      if (!opts.resyncQuery) {
        return {
          fromVersion: req.fromVersion,
          toVersion: nextVersion,
          diffs: [],
          snapshot: true,
        };
      }
      const diffs = await opts.resyncQuery(req.fromVersion);
      if (diffs.length > maxResync) {
        const lastV = diffs.reduce(
          (max, d) => Math.max(max, d.version),
          req.fromVersion,
        );
        return {
          fromVersion: req.fromVersion,
          toVersion: lastV,
          diffs: [],
          snapshot: true,
        };
      }
      const toVersion =
        diffs.length > 0 ? diffs[diffs.length - 1]!.version : req.fromVersion;
      return {
        fromVersion: req.fromVersion,
        toVersion,
        diffs,
      };
    },
    async close() {
      closed = true;
      subscribers.clear();
      if (stream) {
        await stream.close();
        stream = null;
      }
    },
    lastResumeToken: () => lastToken,
  };
}
