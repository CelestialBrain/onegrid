// =============================================================================
// OptimisticMutator
//
// Orchestrates the optimistic-write lifecycle for SSRM mutations:
//
//   1. Caller invokes `apply(mutation)`.
//   2. The mutator immediately calls `onApply(mutation)` so the
//      consumer's cache / view reflects the change BEFORE the
//      server responds. The UI feels instant.
//   3. The mutator submits the mutation to the server via
//      `dataSource.mutate`.
//   4. When the server responds with a `MutationOk`, the mutator
//      calls `onCommit(mutation, result)` — the consumer can use
//      the server's authoritative `rowId` to reconcile any
//      client-generated id placeholders.
//   5. When the server responds with `MutationConflict` or
//      `MutationError`, the mutator calls `onRollback(mutation,
//      result)` so the consumer can revert the optimistic apply
//      and surface the conflict (or retry).
//
// Concurrency: every mutation carries a `clientId` (caller-provided
// or auto-generated). The mutator tracks pending mutations by that
// id. Applying a second mutation for the same `rowId` while one is
// still in flight is the consumer's responsibility — typical
// strategies are queue-and-replay (write-after-write) or
// last-write-wins.
//
// Concurrency vs row-diff streams: when the SSRM CDC stream emits a
// RowDiff for a row that has a pending mutation, the consumer's
// reconciliation policy decides which "wins" — the server-side
// truth (overwrite optimistic apply) or the local one (defer the
// remote diff until the local mutation commits). The mutator
// itself is unopinionated; it just exposes `pending()` so the
// consumer can implement their preferred policy.
// =============================================================================

import type {
  DataSource,
  FetchOptions,
  Mutation,
  MutationConflict,
  MutationError,
  MutationOk,
  MutationResultEntry,
} from '@onegrid/protocol';

export interface OptimisticMutatorOptions {
  /** Server-bound DataSource. Must implement `mutate`. */
  readonly dataSource: DataSource;
  /** Apply a mutation to local state. Called BEFORE the server
   *  responds. Side-effect free other than mutating the consumer's
   *  cache. */
  readonly onApply: (mutation: Mutation) => void;
  /** Confirm a mutation: the server accepted it. The consumer can
   *  reconcile any local placeholder rowId with `result.rowId`. */
  readonly onCommit?: (mutation: Mutation, result: MutationOk) => void;
  /** Roll back a mutation: the server rejected it (conflict or
   *  error). The consumer reverts the optimistic apply. The result
   *  carries the server's authoritative state for conflicts so the
   *  consumer can offer a "discard / merge / overwrite" UI. */
  readonly onRollback: (
    mutation: Mutation,
    result: MutationConflict | MutationError,
  ) => void;
  /** Called when `dataSource.mutate` itself rejects (network error,
   *  timeout). The consumer typically rolls back AND retries; the
   *  mutator does neither automatically. */
  readonly onTransportError?: (mutation: Mutation, err: unknown) => void;
}

export interface OptimisticMutator {
  /** Apply a mutation optimistically + submit to the server.
   *  Returns the server's verdict (or rejects on transport error).
   *  The local apply has already happened by the time this resolves. */
  readonly apply: (
    mutation: Mutation,
    opts?: FetchOptions,
  ) => Promise<MutationResultEntry>;
  /** Count of mutations whose server response hasn't landed yet. */
  readonly pendingCount: () => number;
  /** Snapshot of in-flight mutations, indexed by clientId. */
  readonly pending: () => ReadonlyArray<Mutation>;
}

let autoId = 0;
function ensureClientId(mutation: Mutation): Mutation {
  if (mutation.clientId) return mutation;
  return { ...mutation, clientId: `og-${String(++autoId)}` } as Mutation;
}

export function createOptimisticMutator(
  options: OptimisticMutatorOptions,
): OptimisticMutator {
  const inflight = new Map<string, Mutation>();
  const { dataSource, onApply, onCommit, onRollback, onTransportError } =
    options;
  if (!dataSource.mutate) {
    throw new Error(
      'createOptimisticMutator: dataSource.mutate is required.',
    );
  }
  const dataSourceMutate = dataSource.mutate;

  const apply = async (
    mutation: Mutation,
    opts?: FetchOptions,
  ): Promise<MutationResultEntry> => {
    const m = ensureClientId(mutation);
    inflight.set(m.clientId, m);
    onApply(m);

    let result: MutationResultEntry;
    try {
      const results = await dataSourceMutate([m], opts);
      const entry = results.find((e) => e.clientId === m.clientId);
      if (!entry) {
        // Server returned an empty / mismatched response — treat as
        // an error and roll the optimistic apply back.
        const err: MutationError = {
          kind: 'error',
          clientId: m.clientId,
          message: 'No result entry returned for clientId.',
          code: 'INTERNAL',
        };
        onRollback(m, err);
        result = err;
      } else {
        result = entry;
        if (entry.kind === 'ok') {
          onCommit?.(m, entry);
        } else {
          onRollback(m, entry);
        }
      }
    } catch (err) {
      onTransportError?.(m, err);
      throw err;
    } finally {
      inflight.delete(m.clientId);
    }
    return result;
  };

  return {
    apply,
    pendingCount: () => inflight.size,
    pending: () => Array.from(inflight.values()),
  };
}
