import { describe, it, expect, vi } from 'vitest';
import {
  bindOrmSync,
  extractFromDrizzle,
  extractFromKysely,
  extractFromPrisma,
  toSchema,
  type OrmModelDescriptor,
} from '../index.js';
import type { CdcAdapter } from '@onegrid/ssrm';
import type { RowDiff } from '@onegrid/protocol';

interface Order {
  id: number;
  total: number;
  status: string;
}

interface OrderLike extends Record<string, unknown> {
  id: number;
  total: number;
  status: string;
}

const orderModel: OrmModelDescriptor<OrderLike> = {
  table: 'orders',
  primaryKey: 'id',
  columns: [
    { id: 'id', type: 'int32' },
    { id: 'total', type: 'float64' },
    { id: 'status', type: 'utf8', nullable: true },
  ],
};

function makeFakeCdc(): {
  cdc: CdcAdapter;
  emit: (diff: RowDiff) => void;
  unsubscribed: { called: boolean };
} {
  const unsubscribed = { called: false };
  let callback: ((d: RowDiff) => void) | null = null;
  const cdc: CdcAdapter = {
    subscribe: (onDiff) => {
      callback = onDiff;
      return () => {
        unsubscribed.called = true;
      };
    },
    resync: async () => ({ fromVersion: 0, toVersion: 0, diffs: [], snapshot: true as const }),
  };
  return {
    cdc,
    emit: (diff) => callback?.(diff),
    unsubscribed,
  };
}

describe('toSchema', () => {
  it('projects an OrmModelDescriptor onto protocol Schema', () => {
    const schema = toSchema(orderModel as unknown as OrmModelDescriptor);
    expect(schema).toEqual([
      { id: 'id', type: 'int32' },
      { id: 'total', type: 'float64' },
      { id: 'status', type: 'utf8', nullable: true },
    ]);
  });
});

describe('extractFromDrizzle', () => {
  it('maps Postgres column types', () => {
    const m = extractFromDrizzle<Order>({
      table: 'orders',
      primaryKey: 'id',
      columns: [
        { name: 'id', columnType: 'PgBigInt', notNull: true },
        { name: 'total', columnType: 'PgDoublePrecision' },
        { name: 'status', columnType: 'PgVarchar', notNull: false },
      ],
    });
    expect(m.columns.find((c) => c.id === 'id')?.type).toBe('int64');
    expect(m.columns.find((c) => c.id === 'total')?.type).toBe('float64');
    expect(m.columns.find((c) => c.id === 'status')?.type).toBe('utf8');
    expect(m.columns.find((c) => c.id === 'status')?.nullable).toBe(true);
  });

  it('falls back to dataType when columnType is generic', () => {
    const m = extractFromDrizzle({
      table: 't',
      primaryKey: 'id',
      columns: [
        { name: 'x', dataType: 'string' },
        { name: 'y', dataType: 'date' },
      ],
    });
    expect(m.columns[0]?.type).toBe('utf8');
    expect(m.columns[1]?.type).toBe('timestamp');
  });
});

describe('extractFromKysely', () => {
  it('uses the same shape as Drizzle (Kysely is type-level only)', () => {
    const m = extractFromKysely<Order>({
      table: 'orders',
      primaryKey: 'id',
      columns: [
        { name: 'id', columnType: 'integer' },
        { name: 'total', columnType: 'numeric' },
      ],
    });
    expect(m.columns[0]?.type).toBe('int32');
    expect(m.columns[1]?.type).toBe('decimal');
  });
});

describe('extractFromPrisma', () => {
  it('maps Prisma DMMF field types', () => {
    const m = extractFromPrisma<Order>({
      table: 'Order',
      primaryKey: 'id',
      fields: [
        { name: 'id', type: 'Int', isRequired: true },
        { name: 'total', type: 'Float' },
        { name: 'status', type: 'String', isRequired: false },
      ],
    });
    expect(m.columns[0]?.type).toBe('int32');
    expect(m.columns[1]?.type).toBe('float64');
    expect(m.columns[2]?.type).toBe('utf8');
    expect(m.columns[2]?.nullable).toBe(true);
  });
});

describe('bindOrmSync', () => {
  it('translates RowDiff into typed TypedRowDiff', () => {
    const { cdc, emit } = makeFakeCdc();
    const seen: unknown[] = [];
    const handle = bindOrmSync<OrderLike>({
      cdc,
      model: orderModel,
      onDiff: (d) => {
        seen.push(d);
      },
    });
    emit({
      kind: 'insert',
      version: 1,
      pkey: 42,
      fields: { id: 42, total: 99.5, status: 'paid' },
    });
    expect(seen).toEqual([
      {
        kind: 'insert',
        version: 1,
        pkey: 42,
        row: { id: 42, total: 99.5, status: 'paid' },
      },
    ]);
    expect(handle.lastVersion()).toBe(1);
  });

  it('omits row on delete', () => {
    const { cdc, emit } = makeFakeCdc();
    const seen: unknown[] = [];
    bindOrmSync<OrderLike>({
      cdc,
      model: orderModel,
      onDiff: (d) => {
        seen.push(d);
      },
    });
    emit({ kind: 'delete', version: 7, pkey: 42 });
    expect(seen[0]).toEqual({
      kind: 'delete',
      version: 7,
      pkey: 42,
    });
  });

  it('routes onDiff throws into onError', () => {
    const { cdc, emit } = makeFakeCdc();
    const onError = vi.fn();
    bindOrmSync<OrderLike>({
      cdc,
      model: orderModel,
      onDiff: () => {
        throw new Error('apply failed');
      },
      onError,
    });
    emit({ kind: 'insert', version: 1, pkey: 1, fields: { id: 1, total: 1 } });
    expect(onError).toHaveBeenCalled();
  });

  it('close calls the CDC unsubscribe', () => {
    const { cdc, unsubscribed } = makeFakeCdc();
    const handle = bindOrmSync<OrderLike>({
      cdc,
      model: orderModel,
      onDiff: () => {},
    });
    handle.close();
    expect(unsubscribed.called).toBe(true);
  });
});
