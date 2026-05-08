// =============================================================================
// Introspection helpers — unit tests.
// =============================================================================

import { describe, expect, it } from 'vitest';
import type { Schema } from '@onegrid/protocol';
import {
  columnsFromSchema,
  columnTypeFromSql,
  schemaFromSqlRows,
  schemaFromSqliteRows,
} from '../index';

describe('columnTypeFromSql', () => {
  it('maps Postgres types', () => {
    expect(columnTypeFromSql('bigint')).toBe('int64');
    expect(columnTypeFromSql('integer')).toBe('int32');
    expect(columnTypeFromSql('smallint')).toBe('int16');
    expect(columnTypeFromSql('double precision')).toBe('float64');
    expect(columnTypeFromSql('real')).toBe('float64');
    expect(columnTypeFromSql('numeric(10,2)')).toBe('decimal');
    expect(columnTypeFromSql('text')).toBe('utf8');
    expect(columnTypeFromSql('character varying')).toBe('utf8');
    expect(columnTypeFromSql('boolean')).toBe('bool');
    expect(columnTypeFromSql('timestamp with time zone')).toBe('timestamp_tz');
    expect(columnTypeFromSql('timestamp without time zone')).toBe('timestamp');
    expect(columnTypeFromSql('date')).toBe('date32');
    expect(columnTypeFromSql('jsonb')).toBe('json');
    expect(columnTypeFromSql('json')).toBe('json');
    expect(columnTypeFromSql('uuid')).toBe('utf8');
    expect(columnTypeFromSql('bytea')).toBe('binary');
  });

  it('maps MySQL types', () => {
    expect(columnTypeFromSql('TINYINT')).toBe('int8');
    expect(columnTypeFromSql('INT(11)')).toBe('int32');
    expect(columnTypeFromSql('VARCHAR(255)')).toBe('utf8');
    expect(columnTypeFromSql('DATETIME')).toBe('timestamp');
    expect(columnTypeFromSql('BLOB')).toBe('binary');
    expect(columnTypeFromSql('ENUM(\'a\',\'b\')')).toBe('utf8');
  });

  it('maps SQLite affinity names', () => {
    expect(columnTypeFromSql('INTEGER')).toBe('int32');
    expect(columnTypeFromSql('REAL')).toBe('float64');
    expect(columnTypeFromSql('TEXT')).toBe('utf8');
    expect(columnTypeFromSql('BLOB')).toBe('binary');
  });

  it('falls back to "unknown" on unrecognized types', () => {
    expect(columnTypeFromSql('quantum_state')).toBe('unknown');
  });
});

describe('schemaFromSqlRows', () => {
  it('builds a Schema from information_schema.columns rows', () => {
    const rows = [
      { column_name: 'id', data_type: 'bigint', is_nullable: 'NO' },
      { column_name: 'email', data_type: 'character varying', is_nullable: 'YES' },
      { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
    ];
    const schema = schemaFromSqlRows(rows);
    expect(schema).toEqual([
      { id: 'id', type: 'int64' },
      { id: 'email', type: 'utf8', nullable: true },
      { id: 'created_at', type: 'timestamp_tz' },
    ]);
  });

  it('accepts boolean is_nullable values', () => {
    const rows = [
      { column_name: 'a', data_type: 'integer', is_nullable: true },
      { column_name: 'b', data_type: 'integer', is_nullable: false },
    ];
    expect(schemaFromSqlRows(rows)).toEqual([
      { id: 'a', type: 'int32', nullable: true },
      { id: 'b', type: 'int32' },
    ]);
  });
});

describe('schemaFromSqliteRows', () => {
  it('builds a Schema from PRAGMA table_info rows', () => {
    const rows = [
      { name: 'id', type: 'INTEGER', notnull: 1 },
      { name: 'email', type: 'TEXT', notnull: 0 },
    ];
    expect(schemaFromSqliteRows(rows)).toEqual([
      { id: 'id', type: 'int32' },
      { id: 'email', type: 'utf8', nullable: true },
    ]);
  });
});

describe('columnsFromSchema', () => {
  const schema: Schema = [
    { id: 'id', type: 'int64' },
    { id: 'email', type: 'utf8' },
    { id: 'is_active', type: 'bool' },
    { id: 'created_at', type: 'timestamp_tz' },
    { id: 'amount', type: 'decimal' },
  ];

  it('produces one ColumnDef per Schema entry', () => {
    const cols = columnsFromSchema(schema);
    expect(cols.length).toBe(5);
    expect(cols.map((c) => c.id)).toEqual([
      'id',
      'email',
      'is_active',
      'created_at',
      'amount',
    ]);
  });

  it('humanizes ids into displayName', () => {
    const cols = columnsFromSchema(schema);
    expect(cols.find((c) => c.id === 'is_active')?.displayName).toBe('Is Active');
    expect(cols.find((c) => c.id === 'created_at')?.displayName).toBe('Created At');
  });

  it('chooses heuristic widths by type', () => {
    const cols = columnsFromSchema(schema);
    const byId = (id: string): number => cols.find((c) => c.id === id)!.width;
    expect(byId('id')).toBe(80); // id-shaped → narrow
    expect(byId('email')).toBe(200); // utf8 → 200
    expect(byId('is_active')).toBe(80); // bool → 80
    expect(byId('created_at')).toBe(160); // timestamp → 160
    expect(byId('amount')).toBe(120); // decimal → 120
  });

  it('honors per-column width overrides', () => {
    const cols = columnsFromSchema(schema, { widths: { email: 320 } });
    expect(cols.find((c) => c.id === 'email')?.width).toBe(320);
  });

  it('honors displayName overrides', () => {
    const cols = columnsFromSchema(schema, {
      displayNames: { email: 'Email Address' },
    });
    expect(cols.find((c) => c.id === 'email')?.displayName).toBe('Email Address');
  });

  it('skips listed columns', () => {
    const cols = columnsFromSchema(schema, { skip: ['amount', 'created_at'] });
    expect(cols.map((c) => c.id)).toEqual(['id', 'email', 'is_active']);
  });

  it('applies a default formatter for booleans', () => {
    const cols = columnsFromSchema(schema);
    const fmt = cols.find((c) => c.id === 'is_active')?.format;
    expect(fmt?.(true, 0)).toBe('true');
    expect(fmt?.(false, 0)).toBe('false');
    expect(fmt?.(null, 0)).toBe('');
  });

  it('applies a default formatter for timestamps', () => {
    const cols = columnsFromSchema(schema);
    const fmt = cols.find((c) => c.id === 'created_at')?.format;
    expect(fmt?.('2026-05-08T14:30:00.000Z', 0)).toBe('2026-05-08 14:30:00');
    expect(fmt?.(new Date('2026-05-08T14:30:00.000Z'), 0)).toBe(
      '2026-05-08 14:30:00',
    );
  });

  it('per-column formatter overrides win', () => {
    const cols = columnsFromSchema(schema, {
      formatters: { is_active: (v) => (v === true ? '✓' : '✗') },
    });
    const fmt = cols.find((c) => c.id === 'is_active')?.format;
    expect(fmt?.(true, 0)).toBe('✓');
    expect(fmt?.(false, 0)).toBe('✗');
  });
});
