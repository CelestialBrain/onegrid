// =============================================================================
// audit-client — main-thread wrapper around the audit-worker.
//
// Edits call `append` (fire-and-forget postMessage). The master-detail
// panel calls `query(sourceRow)` which round-trips to the worker. The
// main thread never holds the audit log in React state, so cell edits
// don't re-render the App.
// =============================================================================

export interface AuditEvent {
  readonly ts: number;
  readonly event: 'edit' | 'paste' | 'fill' | 'undo' | 'redo';
  readonly columnId: string;
  readonly oldValue: string;
  readonly newValue: string;
}

interface AppendInput {
  readonly sourceRow: number;
  readonly ts: number;
  readonly event: AuditEvent['event'];
  readonly columnId: string;
  readonly oldValue: string;
  readonly newValue: string;
}

interface QueryResult {
  readonly type: 'queryResult';
  readonly id: number;
  readonly sourceRow: number;
  readonly entries: ReadonlyArray<AuditEvent>;
}

export class AuditClient {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    (entries: ReadonlyArray<AuditEvent>) => void
  >();

  constructor() {
    // Vite resolves this to a worker bundle at build time.
    this.worker = new Worker(new URL('./audit-worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.addEventListener('message', (e: MessageEvent<QueryResult>) => {
      const m = e.data;
      if (m.type === 'queryResult') {
        const cb = this.pending.get(m.id);
        if (cb) {
          this.pending.delete(m.id);
          cb(m.entries);
        }
      }
    });
  }

  append(msg: AppendInput): void {
    this.worker.postMessage({ type: 'append', ...msg });
  }

  query(sourceRow: number): Promise<ReadonlyArray<AuditEvent>> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ type: 'query', id, sourceRow });
    });
  }

  clear(): void {
    this.worker.postMessage({ type: 'clear' });
  }

  destroy(): void {
    this.worker.terminate();
  }
}
