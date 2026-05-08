// =============================================================================
// OptimisticMutator — unit tests.
// =============================================================================

import { describe, expect, it, vi } from 'vitest';
import type {
  DataSource,
  Mutation,
  MutationResult,
  MutationResultEntry,
  Schema,
  UpdateMutation,
} from '@onegrid/protocol';
import { createOptimisticMutator } from '../optimistic';

const SCHEMA: Schema = [
  { id: 'id', type: 'int64' },
  { id: 'name', type: 'utf8' },
];

function makeDataSource(
  mutateImpl: (mutations: ReadonlyArray<Mutation>) => Promise<MutationResult>,
): DataSource {
  return {
    schema: () => SCHEMA,
    fetchBlock: async () => ({
      encoding: 'json',
      rows: [],
      nextCursor: null,
      prevCursor: null,
    }),
    mutate: mutateImpl,
  };
}

function update(clientId: string, rowId: string | number, fields: Record<string, unknown>): UpdateMutation {
  return { kind: 'update', clientId, rowId, fields };
}

describe('createOptimisticMutator', () => {
  it('calls onApply BEFORE the server responds, then onCommit on ok', async () => {
    const events: string[] = [];
    const ds = makeDataSource(async (ms) => {
      events.push('server-call');
      return ms.map(
        (m): MutationResultEntry => ({
          kind: 'ok',
          clientId: m.clientId,
          rowId: m.kind === 'update' ? m.rowId : (m as { rowId: number }).rowId,
        }),
      );
    });
    const mutator = createOptimisticMutator({
      dataSource: ds,
      onApply: () => events.push('apply'),
      onCommit: () => events.push('commit'),
      onRollback: () => events.push('rollback'),
    });

    await mutator.apply(update('m1', 7, { name: 'new' }));
    expect(events).toEqual(['apply', 'server-call', 'commit']);
  });

  it('calls onRollback when the server returns a conflict', async () => {
    const onRollback = vi.fn();
    const ds = makeDataSource(async (ms) =>
      ms.map(
        (m): MutationResultEntry => ({
          kind: 'conflict',
          clientId: m.clientId,
          rowId: 7,
          server: { name: 'server-truth' },
        }),
      ),
    );
    const mutator = createOptimisticMutator({
      dataSource: ds,
      onApply: () => undefined,
      onRollback,
    });
    const result = await mutator.apply(update('m2', 7, { name: 'mine' }));
    expect(result.kind).toBe('conflict');
    expect(onRollback).toHaveBeenCalledOnce();
    const [, conflict] = onRollback.mock.calls[0]!;
    expect((conflict as { kind: string }).kind).toBe('conflict');
  });

  it('calls onRollback when the server returns an error', async () => {
    const onRollback = vi.fn();
    const ds = makeDataSource(async (ms) =>
      ms.map(
        (m): MutationResultEntry => ({
          kind: 'error',
          clientId: m.clientId,
          message: 'pkey conflict',
          code: 'CONFLICT',
        }),
      ),
    );
    const mutator = createOptimisticMutator({
      dataSource: ds,
      onApply: () => undefined,
      onRollback,
    });
    const result = await mutator.apply(update('m3', 1, { name: 'x' }));
    expect(result.kind).toBe('error');
    expect(onRollback).toHaveBeenCalledOnce();
  });

  it('rolls back when the server returns no entry for the clientId', async () => {
    const onRollback = vi.fn();
    const ds = makeDataSource(async () => []);
    const mutator = createOptimisticMutator({
      dataSource: ds,
      onApply: () => undefined,
      onRollback,
    });
    const result = await mutator.apply(update('m4', 1, { name: 'x' }));
    expect(result.kind).toBe('error');
    expect((result as { code?: string }).code).toBe('INTERNAL');
    expect(onRollback).toHaveBeenCalledOnce();
  });

  it('forwards transport errors via onTransportError and rejects', async () => {
    const onTransportError = vi.fn();
    const ds = makeDataSource(async () => {
      throw new Error('network down');
    });
    const mutator = createOptimisticMutator({
      dataSource: ds,
      onApply: () => undefined,
      onRollback: () => undefined,
      onTransportError,
    });
    await expect(mutator.apply(update('m5', 1, { name: 'x' }))).rejects.toThrow(
      'network down',
    );
    expect(onTransportError).toHaveBeenCalledOnce();
  });

  it('tracks pending mutations until the server responds', async () => {
    let resolve!: (results: MutationResult) => void;
    const ds = makeDataSource(
      () =>
        new Promise<MutationResult>((res) => {
          resolve = res;
        }),
    );
    const mutator = createOptimisticMutator({
      dataSource: ds,
      onApply: () => undefined,
      onRollback: () => undefined,
    });
    const promise = mutator.apply(update('m6', 1, { name: 'x' }));
    expect(mutator.pendingCount()).toBe(1);
    expect(mutator.pending()[0]?.clientId).toBe('m6');
    resolve([{ kind: 'ok', clientId: 'm6', rowId: 1 }]);
    await promise;
    expect(mutator.pendingCount()).toBe(0);
  });

  it('auto-generates a clientId when the caller omits it', async () => {
    let captured: ReadonlyArray<Mutation> = [];
    const ds = makeDataSource(async (ms) => {
      captured = ms;
      return ms.map(
        (m): MutationResultEntry => ({
          kind: 'ok',
          clientId: m.clientId,
          rowId: 1,
        }),
      );
    });
    const mutator = createOptimisticMutator({
      dataSource: ds,
      onApply: () => undefined,
      onRollback: () => undefined,
    });
    // Bypass the type by casting: the public API requires `clientId`,
    // but the implementation tolerates omission.
    await mutator.apply({
      kind: 'update',
      rowId: 1,
      fields: { name: 'x' },
    } as unknown as Mutation);
    expect(captured[0]?.clientId).toMatch(/^og-/);
  });

  it('throws on construction when the DataSource has no mutate', () => {
    const ds: DataSource = {
      schema: () => SCHEMA,
      fetchBlock: async () => ({
        encoding: 'json',
        rows: [],
        nextCursor: null,
        prevCursor: null,
      }),
    };
    expect(() =>
      createOptimisticMutator({
        dataSource: ds,
        onApply: () => undefined,
        onRollback: () => undefined,
      }),
    ).toThrow(/mutate is required/);
  });
});
