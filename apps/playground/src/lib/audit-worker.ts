// =============================================================================
// audit-worker — off-main-thread per-row edit log.
//
// Why a worker?
//   Tracking every cell edit on the React side (Map<sourceRow, Event[]> +
//   setState) re-renders the whole App on each write. A fill-handle over
//   100k cells = 100k re-renders. Moving the log into a worker means:
//     - writes are fire-and-forget postMessage (cheap)
//     - the main thread never re-renders on edits
//     - the worker owns the ring-buffer cap (memory bound)
//     - IndexedDB persistence is opaque to the main thread
//
// Bounds:
//   - per-row max 50 entries (newest first)
//   - global max 200 rows tracked (FIFO eviction by insertion order)
//   - string values truncated to 60 chars to keep payloads small
//
// Persistence:
//   - hydrate from IDB on init (one read)
//   - debounced write every 2 s if dirty (one write per window)
// =============================================================================

type AuditEvent = {
  readonly ts: number;
  readonly event: 'edit' | 'paste' | 'fill' | 'undo' | 'redo';
  readonly columnId: string;
  readonly oldValue: string;
  readonly newValue: string;
};

const MAX_PER_ROW = 50;
const MAX_TOTAL_ROWS = 200;
const DB_NAME = 'onegrid-audit';
const STORE = 'log';
const TRUNC = 60;
const PERSIST_INTERVAL_MS = 2000;

let log = new Map<number, AuditEvent[]>();
let dirty = false;
let dbReady: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbReady) return dbReady;
  dbReady = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (): void => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = (): void => {
      resolve(req.result);
    };
    req.onerror = (): void => {
      reject(req.error);
    };
  });
  return dbReady;
}

async function hydrate(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.get('log');
    await new Promise<void>((resolve) => {
      req.onsuccess = (): void => {
        const data = req.result as ReadonlyArray<[number, AuditEvent[]]> | undefined;
        if (Array.isArray(data)) {
          log = new Map(data);
        }
        resolve();
      };
      req.onerror = (): void => {
        resolve();
      };
    });
  } catch {
    // Worker storage unavailable (private mode / quota). The log
    // still works in-memory for the session.
  }
}

async function persist(): Promise<void> {
  if (!dirty) return;
  dirty = false;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    // Serialize as [key, value][] (Map isn't structured-cloneable as
    // a key in IDB; we round-trip via array).
    tx.objectStore(STORE).put(Array.from(log.entries()), 'log');
  } catch {
    dirty = true; // retry next tick
  }
}

setInterval(() => {
  void persist();
}, PERSIST_INTERVAL_MS);
void hydrate();

function trunc(s: string): string {
  return s.length > TRUNC ? s.slice(0, TRUNC - 1) + '…' : s;
}

type Incoming =
  | {
      readonly type: 'append';
      readonly sourceRow: number;
      readonly ts: number;
      readonly event: AuditEvent['event'];
      readonly columnId: string;
      readonly oldValue: string;
      readonly newValue: string;
    }
  | { readonly type: 'query'; readonly id: number; readonly sourceRow: number }
  | { readonly type: 'clear' };

self.addEventListener('message', (ev: MessageEvent<Incoming>) => {
  const m = ev.data;
  if (m.type === 'append') {
    const e: AuditEvent = {
      ts: m.ts,
      event: m.event,
      columnId: m.columnId,
      oldValue: trunc(m.oldValue),
      newValue: trunc(m.newValue),
    };
    let arr = log.get(m.sourceRow);
    if (!arr) {
      // Evict oldest row (FIFO by Map insertion order) if at cap.
      if (log.size >= MAX_TOTAL_ROWS) {
        const firstKey = log.keys().next().value;
        if (firstKey !== undefined) log.delete(firstKey);
      }
      arr = [];
      log.set(m.sourceRow, arr);
    }
    arr.unshift(e);
    if (arr.length > MAX_PER_ROW) arr.length = MAX_PER_ROW;
    dirty = true;
    return;
  }
  if (m.type === 'query') {
    const entries = log.get(m.sourceRow) ?? [];
    self.postMessage({
      type: 'queryResult',
      id: m.id,
      sourceRow: m.sourceRow,
      entries,
    });
    return;
  }
  if (m.type === 'clear') {
    log.clear();
    dirty = true;
    void persist();
    return;
  }
});
