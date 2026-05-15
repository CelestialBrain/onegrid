// =============================================================================
// @onegrid/reactive
//
// Salsa-style on-demand memoization substrate, ported from the public
// design described in the salsa-rs documentation and rust-analyzer's
// reactivity model. The formula engine + derived views will migrate
// onto this substrate in v0.0.11.x; the formula engine's existing
// Adapton-style impl stays the canonical reference until then.
//
// Core ideas (Salsa, public docs):
//
//   - Revision counter R, monotonic. Every input mutation bumps R.
//   - Each query memoizes (args → { value, computedAtR, verifiedAtR }).
//   - Read path: if verifiedAtR == R, return cached. Otherwise re-walk
//     dependencies; if every dep's verifiedAtR has advanced WITHOUT
//     changing value, bump cache.verifiedAtR to R (no recompute).
//   - Backdating: when a query DOES recompute, if the new value equals
//     the cached value (by `eq` comparator), the cache keeps its old
//     computedAtR. Dependents observe "no change since computedAtR",
//     short-circuit their own recompute. This is the property that
//     turns O(graph-depth) cascades into O(touched-leaves).
// =============================================================================

// -----------------------------------------------------------------------------
// Revision
// -----------------------------------------------------------------------------

export type Revision = number;

/** Comparator interface for backdating. Default: strict equality. */
export type Equals<T> = (a: T, b: T) => boolean;

const strictEqual = <T>(a: T, b: T): boolean => a === b;

// -----------------------------------------------------------------------------
// Database — the substrate root
// -----------------------------------------------------------------------------

interface Slot<T> {
  value: T;
  /** Revision when this slot was last written with a value not eq to prev. */
  changedAt: Revision;
  eq: Equals<T>;
}

interface Memo<T> {
  args: string;
  value: T;
  computedAt: Revision;
  verifiedAt: Revision;
  deps: ReadonlyArray<DepRef>;
  eq: Equals<T>;
  /** Re-invoke the compute fn. Used by depStillFresh so a stale
   *  upstream can recompute (possibly backdate) without its dependent
   *  having to. */
  rerun: () => T;
}

interface DepRef {
  /** Identifies the upstream slot or query memo. */
  readonly key: string;
  /** Revision at which this dep was last verified. */
  readonly verifiedAt: Revision;
}

export class Database {
  /** Monotonically increasing revision. Starts at 0; bumps on every
   *  input write whose value differs from the previous. */
  private revision: Revision = 0;
  private readonly inputs = new Map<string, Slot<unknown>>();
  private readonly memos = new Map<string, Memo<unknown>>();
  private trace: DepRef[] | null = null;

  /** Current revision counter — debug + telemetry hook. */
  get currentRevision(): Revision {
    return this.revision;
  }

  /** How many memoized query entries the database is holding. */
  get memoCount(): number {
    return this.memos.size;
  }

  /**
   * Define an input slot. Returns a `{ get, set }` pair the caller
   * uses to write the value (which bumps revision on change) and read
   * it (which contributes to the active query's dep set).
   *
   * `eq` overrides the default strict equality — useful for deep
   * comparison or for treating two FilterModel trees as equal when
   * structurally identical.
   */
  defineInput<T>(key: string, initial: T, eq: Equals<T> = strictEqual): {
    readonly get: () => T;
    readonly set: (value: T) => void;
  } {
    if (this.inputs.has(key)) {
      throw new Error(`[OG_REACTIVE_DUPLICATE_INPUT] '${key}' already defined`);
    }
    this.inputs.set(key, {
      value: initial,
      changedAt: 0,
      eq: eq as Equals<unknown>,
    });
    return {
      get: () => this.readInput<T>(key),
      set: (value: T) => this.writeInput<T>(key, value),
    };
  }

  /**
   * Define a tracked query. The compute fn is called on miss; its
   * dependencies are auto-tracked. On subsequent calls the cached
   * value is returned if (a) all deps verify at current revision OR
   * (b) the deps' values are unchanged since cache.computedAt.
   */
  defineQuery<Args, T>(
    key: string,
    compute: (db: Database, args: Args) => T,
    opts: { readonly eq?: Equals<T>; readonly hashArgs?: (a: Args) => string } = {},
  ): (args: Args) => T {
    const eq = opts.eq ?? strictEqual;
    const hashArgs = opts.hashArgs ?? ((a: Args) => JSON.stringify(a));
    const runOnce = (args: Args): T => {
      const memoKey = `${key}|${hashArgs(args)}`;
      const cached = this.memos.get(memoKey) as Memo<T> | undefined;
      if (cached && this.tryVerify(cached)) {
        if (this.trace) {
          this.trace.push({ key: memoKey, verifiedAt: this.revision });
        }
        return cached.value;
      }
      // Re-evaluate. Capture the new dep trace.
      const prevTrace = this.trace;
      const newTrace: DepRef[] = [];
      this.trace = newTrace;
      let value: T;
      try {
        value = compute(this, args);
      } finally {
        this.trace = prevTrace;
      }
      const next: Memo<T> = {
        args: memoKey,
        value:
          cached && eq(cached.value, value)
            ? cached.value // backdate: keep old reference + computedAt
            : value,
        computedAt: cached && eq(cached.value, value) ? cached.computedAt : this.revision,
        verifiedAt: this.revision,
        deps: newTrace,
        eq: eq as Equals<unknown>,
        rerun: () => runOnce(args),
      };
      this.memos.set(memoKey, next as Memo<unknown>);
      if (prevTrace) prevTrace.push({ key: memoKey, verifiedAt: this.revision });
      return next.value;
    };
    return runOnce;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private readInput<T>(key: string): T {
    const slot = this.inputs.get(key);
    if (!slot) {
      throw new Error(`[OG_REACTIVE_UNKNOWN_INPUT] '${key}'`);
    }
    if (this.trace) {
      this.trace.push({ key: `input:${key}`, verifiedAt: slot.changedAt });
    }
    return slot.value as T;
  }

  private writeInput<T>(key: string, value: T): void {
    const slot = this.inputs.get(key) as Slot<T> | undefined;
    if (!slot) {
      throw new Error(`[OG_REACTIVE_UNKNOWN_INPUT] '${key}'`);
    }
    if (slot.eq(slot.value, value)) return; // backdate at input level
    slot.value = value;
    this.revision++;
    slot.changedAt = this.revision;
  }

  /**
   * Try to verify a cached memo without re-running compute. Returns
   * true if cached.value is still valid at the current revision.
   *
   * Algorithm:
   *   1. If verifiedAt == revision → cached.
   *   2. Walk deps. For each dep, the dep was "fresh" at the moment
   *      the memo was computed iff the dep's CURRENT changedAt is
   *      <= cache.computedAt. (i.e. the dep hasn't changed since.)
   *   3. If every dep checks out, bump verifiedAt = revision and
   *      return true. Otherwise return false (caller re-computes).
   */
  private tryVerify<T>(memo: Memo<T>): boolean {
    if (memo.verifiedAt === this.revision) return true;
    for (const dep of memo.deps) {
      if (!this.depStillFresh(dep, memo.computedAt)) return false;
    }
    memo.verifiedAt = this.revision;
    return true;
  }

  private depStillFresh(dep: DepRef, asOfRevision: Revision): boolean {
    if (dep.key.startsWith('input:')) {
      const slot = this.inputs.get(dep.key.slice('input:'.length));
      if (!slot) return false;
      return slot.changedAt <= asOfRevision;
    }
    const upstream = this.memos.get(dep.key);
    if (!upstream) return false;
    if (upstream.verifiedAt !== this.revision) {
      // Fast-verify first — cheap path.
      if (this.tryVerify(upstream)) return upstream.computedAt <= asOfRevision;
      // Fast-verify failed: upstream's deps changed. Re-run it. The
      // re-run may backdate (new value eq old) — that's the property
      // that lets dependents avoid a recompute cascade.
      upstream.rerun();
    }
    return upstream.computedAt <= asOfRevision;
  }
}
