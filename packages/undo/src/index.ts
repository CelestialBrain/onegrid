// =============================================================================
// @onegrid/undo
//
// Undo / redo manager for grid mutations. The Grid emits mutation callbacks
// (onCellEdit, onFillHandle, onPaste, onColumnReorder, onColumnResize) and
// adopters push `{ forward, inverse }` entries onto this manager. Cmd+Z
// dispatches the inverse; Cmd+Shift+Z dispatches the forward again.
//
// Design notes:
//   - Adopter owns the data store. This package owns the STACK, not the
//     data. apply(payload) is what the adopter wires to mutate their state.
//   - Each user-visible operation pushes ONE entry. Multi-cell ops
//     (fill handle, paste, range-delete) group via transaction() so a
//     single Cmd+Z reverses the whole op.
//   - Pushing a new entry drops the redo stack (standard undo semantics).
//   - Default cap is 100 entries. Older entries are dropped FIFO.
// =============================================================================

export interface UndoEntry<T = unknown> {
  /** Domain-specific kind tag adopters dispatch on. */
  readonly kind: string;
  /** Optional UI label ("Edit cell", "Fill range", "Reorder column"). */
  readonly label?: string;
  /** Forward = the user's original action; replayed on redo. */
  readonly forward: T;
  /** Inverse = the action that undoes the forward; dispatched on undo. */
  readonly inverse: T;
  /** Wall-clock timestamp at push time. */
  readonly ts: number;
}

export interface UndoManagerOptions<T> {
  /** Apply a payload to the adopter's data store. Called on undo (with
   *  the entry's `inverse`) and on redo (with `forward`). */
  readonly apply: (payload: T) => void;
  /** Max stack depth per direction. Default 100. */
  readonly maxDepth?: number;
  /** Called after every push / undo / redo / clear with the new depths.
   *  Useful for toolbar enable/disable state. */
  readonly onChange?: (state: UndoState) => void;
}

export interface UndoState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoCount: number;
  readonly redoCount: number;
  /** Label of the next undo entry (if any) — for "Undo Edit cell" tooltips. */
  readonly nextUndoLabel: string | undefined;
  readonly nextRedoLabel: string | undefined;
}

export interface UndoManager<T> {
  /** Push a new entry. Drops the redo stack. Bundle multi-step ops via
   *  `transaction()` so the whole op reverses as one Cmd+Z. */
  readonly push: (entry: Omit<UndoEntry<T>, 'ts'>) => void;
  /** Group multiple `push` calls into one undo entry. The user's
   *  `body()` is called synchronously; every push inside merges into a
   *  single multi-payload entry. */
  readonly transaction: (
    body: () => void,
    opts?: { readonly kind?: string; readonly label?: string },
  ) => void;
  /** Pop + apply the top entry's inverse. Returns the entry (for telemetry)
   *  or null if the stack is empty. */
  readonly undo: () => UndoEntry<T> | null;
  /** Pop + apply the top redo entry's forward. Returns the entry or null. */
  readonly redo: () => UndoEntry<T> | null;
  readonly canUndo: () => boolean;
  readonly canRedo: () => boolean;
  readonly state: () => UndoState;
  /** Wipe both stacks. Used on mode switch when the prior session's
   *  edits no longer apply to the new dataset. */
  readonly clear: () => void;
  /**
   * Bind Cmd+Z / Ctrl+Z (undo) and Cmd+Shift+Z / Ctrl+Y / Ctrl+Shift+Z (redo)
   * to the target. Returns an unsubscribe function.
   *
   * Stops propagation by default so the browser's text-input undo doesn't
   * also fire inside grid cells. Pass `{ stopPropagation: false }` to
   * disable.
   */
  readonly bindKeyboard: (
    target: Document | HTMLElement | Window,
    opts?: { readonly stopPropagation?: boolean },
  ) => () => void;
}

interface InternalEntry<T> extends UndoEntry<T> {
  /** When multiple payloads were grouped via transaction(), they live
   *  in this array; otherwise `forward` and `inverse` are single
   *  payloads. The apply path dispatches each payload in turn. */
  readonly forwardList?: ReadonlyArray<T>;
  readonly inverseList?: ReadonlyArray<T>;
}

export function createUndoManager<T>(
  opts: UndoManagerOptions<T>,
): UndoManager<T> {
  const apply = opts.apply;
  const maxDepth = opts.maxDepth ?? 100;
  const onChange = opts.onChange;

  const undoStack: InternalEntry<T>[] = [];
  const redoStack: InternalEntry<T>[] = [];

  // transaction state: when active, push() routes entries into pending
  // arrays instead of straight onto the stack.
  let txKind: string | null = null;
  let txLabel: string | undefined;
  let txForward: T[] | null = null;
  let txInverse: T[] | null = null;

  const emit = (): void => {
    onChange?.({
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      undoCount: undoStack.length,
      redoCount: redoStack.length,
      nextUndoLabel: undoStack[undoStack.length - 1]?.label,
      nextRedoLabel: redoStack[redoStack.length - 1]?.label,
    });
  };

  const pushInternal = (entry: InternalEntry<T>): void => {
    undoStack.push(entry);
    while (undoStack.length > maxDepth) undoStack.shift();
    redoStack.length = 0; // pushing a new entry invalidates redo
    emit();
  };

  return {
    push: (entry) => {
      if (txForward && txInverse) {
        // Inside a transaction — accumulate.
        txForward.push(entry.forward);
        // Inverses must run in REVERSE order on undo, so prepend.
        txInverse.unshift(entry.inverse);
        return;
      }
      pushInternal({ ...entry, ts: Date.now() });
    },

    transaction: (body, txOpts) => {
      if (txForward !== null) {
        // Nested transaction — flatten into the current one.
        body();
        return;
      }
      txKind = txOpts?.kind ?? 'transaction';
      txLabel = txOpts?.label;
      txForward = [];
      txInverse = [];
      try {
        body();
      } finally {
        const forwardList = txForward;
        const inverseList = txInverse;
        const kind = txKind;
        const label = txLabel;
        txForward = null;
        txInverse = null;
        txKind = null;
        txLabel = undefined;
        if (forwardList.length === 0) return; // nothing pushed
        // First payload is exposed as the canonical .forward / .inverse
        // for adopters that don't iterate the lists.
        const entry: InternalEntry<T> = {
          kind: kind!,
          ...(label !== undefined ? { label } : {}),
          forward: forwardList[0]!,
          inverse: inverseList[0]!,
          forwardList,
          inverseList,
          ts: Date.now(),
        };
        pushInternal(entry);
      }
    },

    undo: () => {
      const entry = undoStack.pop();
      if (!entry) {
        emit();
        return null;
      }
      const list = entry.inverseList ?? [entry.inverse];
      for (const p of list) apply(p);
      redoStack.push(entry);
      emit();
      return entry;
    },

    redo: () => {
      const entry = redoStack.pop();
      if (!entry) {
        emit();
        return null;
      }
      const list = entry.forwardList ?? [entry.forward];
      for (const p of list) apply(p);
      undoStack.push(entry);
      emit();
      return entry;
    },

    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,

    state: () => ({
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      undoCount: undoStack.length,
      redoCount: redoStack.length,
      nextUndoLabel: undoStack[undoStack.length - 1]?.label,
      nextRedoLabel: redoStack[redoStack.length - 1]?.label,
    }),

    clear: () => {
      undoStack.length = 0;
      redoStack.length = 0;
      emit();
    },

    bindKeyboard: (target, bindOpts) => {
      const stopPropagation = bindOpts?.stopPropagation ?? true;
      const handler = (rawEvent: Event): void => {
        const e = rawEvent as KeyboardEvent;
        // mod = Cmd on Mac, Ctrl elsewhere.
        const mod = e.metaKey || e.ctrlKey;
        if (!mod) return;
        const k = e.key.toLowerCase();
        // Undo: Cmd/Ctrl+Z (no shift)
        if (k === 'z' && !e.shiftKey) {
          // If the event originated inside an editable element, let the
          // browser handle it — we only want grid-level undo.
          if (isInsideEditable(e.target)) return;
          e.preventDefault();
          if (stopPropagation) e.stopPropagation();
          const entry = undoStack.pop();
          if (!entry) return;
          const list = entry.inverseList ?? [entry.inverse];
          for (const p of list) apply(p);
          redoStack.push(entry);
          emit();
          return;
        }
        // Redo: Cmd/Ctrl+Shift+Z OR Ctrl+Y
        if ((k === 'z' && e.shiftKey) || k === 'y') {
          if (isInsideEditable(e.target)) return;
          e.preventDefault();
          if (stopPropagation) e.stopPropagation();
          const entry = redoStack.pop();
          if (!entry) return;
          const list = entry.forwardList ?? [entry.forward];
          for (const p of list) apply(p);
          undoStack.push(entry);
          emit();
          return;
        }
      };
      target.addEventListener('keydown', handler as EventListener, true);
      return () => {
        target.removeEventListener('keydown', handler as EventListener, true);
      };
    },
  };
}

function isInsideEditable(target: EventTarget | null): boolean {
  if (!target) return false;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}
