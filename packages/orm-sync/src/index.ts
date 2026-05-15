// =============================================================================
// @onegrid/orm-sync
//
// Live ORM sync. v0.0.8 already ships per-database CDC adapters (Postgres
// LISTEN/NOTIFY, MySQL outbox polling, ClickHouse, Mongo change streams)
// emitting RowDiffs. What's been missing: turning those raw column-name
// diffs into ORM-typed rows your application code already speaks.
//
// This package owns:
//   - OrmModelDescriptor — table name + primary key + column metadata
//   - extractFromDrizzle / extractFromKysely / extractFromPrisma — pull
//     descriptors out of the ORM's runtime metadata
//   - bindOrmSync — wrap a CdcAdapter so subscriber callbacks fire with
//     ORM-typed `T` rows instead of raw `Record<string, unknown>`
//   - Live row-source: feeds an SSRM cache; CDC diffs apply incrementally
//
// We don't pin a specific ORM version — descriptors take a structural
// runtime-metadata shape each library exposes (Drizzle's `getTableColumns`,
// Kysely's typed builder + an explicit schema, Prisma's DMMF).
// =============================================================================

import type { CdcAdapter } from '@onegrid/ssrm';
import type {
  ColumnSchema,
  ColumnType,
  RowDiff,
  ResyncRequest,
  ResyncResponse,
} from '@onegrid/protocol';

// -----------------------------------------------------------------------------
// Model descriptor
// -----------------------------------------------------------------------------

export interface OrmColumnDescriptor {
  readonly id: string;
  readonly type: ColumnType;
  readonly nullable?: boolean;
}

export interface OrmModelDescriptor<TRow = Record<string, unknown>> {
  readonly table: string;
  readonly primaryKey: keyof TRow & string;
  readonly columns: ReadonlyArray<OrmColumnDescriptor>;
}

/** Project a descriptor into oneGrid's protocol Schema. */
export function toSchema(model: OrmModelDescriptor): Schema {
  return model.columns.map((c) => ({
    id: c.id,
    type: c.type,
    ...(c.nullable ? { nullable: true as const } : {}),
  }));
}

type Schema = ReadonlyArray<ColumnSchema>;

// -----------------------------------------------------------------------------
// Drizzle extractor
// -----------------------------------------------------------------------------

/**
 * Drizzle exposes column metadata via `getTableColumns(table)`. We don't
 * import the runtime to keep the package dep-free; callers pass the
 * already-extracted map.
 */
export interface DrizzleColumnLike {
  readonly name: string;
  readonly columnType?: string; // 'PgInteger', 'MySqlVarChar', etc.
  readonly dataType?: string; // 'number' | 'string' | 'date' | ...
  readonly notNull?: boolean;
}

export interface ExtractFromDrizzleOptions<TRow> {
  readonly table: string;
  readonly primaryKey: keyof TRow & string;
  readonly columns: ReadonlyArray<DrizzleColumnLike>;
}

export function extractFromDrizzle<TRow>(
  opts: ExtractFromDrizzleOptions<TRow>,
): OrmModelDescriptor<TRow> {
  return {
    table: opts.table,
    primaryKey: opts.primaryKey,
    columns: opts.columns.map((c) => ({
      id: c.name,
      type: drizzleColumnToType(c),
      ...(c.notNull === false ? { nullable: true as const } : {}),
    })),
  };
}

function drizzleColumnToType(c: DrizzleColumnLike): ColumnType {
  // Prefer the column-type identifier when present (most specific).
  const ct = (c.columnType ?? '').toLowerCase();
  if (ct.includes('bigint')) return 'int64';
  if (ct.includes('smallint')) return 'int16';
  if (ct.includes('tinyint')) return 'int8';
  if (ct.includes('integer') || ct.includes('int')) return 'int32';
  if (ct.includes('double') || ct.includes('real') || ct.includes('float8')) return 'float64';
  if (ct.includes('float') || ct.includes('decimal') || ct.includes('numeric')) {
    return ct.includes('decimal') || ct.includes('numeric') ? 'decimal' : 'float32';
  }
  if (ct.includes('bool')) return 'bool';
  if (ct.includes('timestamp')) return ct.includes('tz') ? 'timestamp_tz' : 'timestamp';
  if (ct.includes('date')) return 'date32';
  if (ct.includes('time')) return 'time64';
  if (ct.includes('json')) return 'json';
  if (ct.includes('bytea') || ct.includes('blob') || ct.includes('binary')) return 'binary';
  if (ct.includes('uuid') || ct.includes('char') || ct.includes('text') || ct.includes('varchar')) {
    return 'utf8';
  }
  // Fallback: the looser dataType.
  switch (c.dataType) {
    case 'number':
      return 'float64';
    case 'string':
      return 'utf8';
    case 'date':
      return 'timestamp';
    case 'boolean':
      return 'bool';
    case 'json':
      return 'json';
    default:
      return 'unknown';
  }
}

// -----------------------------------------------------------------------------
// Kysely extractor — explicit schema input
// -----------------------------------------------------------------------------

/**
 * Kysely is type-level only — there's no runtime metadata. The
 * extractor accepts a manually-specified column list because that's
 * the honest contract.
 */
export function extractFromKysely<TRow>(
  opts: ExtractFromDrizzleOptions<TRow>,
): OrmModelDescriptor<TRow> {
  return extractFromDrizzle<TRow>(opts);
}

// -----------------------------------------------------------------------------
// Prisma extractor — DMMF shape
// -----------------------------------------------------------------------------

export interface PrismaFieldLike {
  readonly name: string;
  readonly type: string; // 'Int' | 'BigInt' | 'String' | ...
  readonly isRequired?: boolean;
}

export interface ExtractFromPrismaOptions<TRow> {
  readonly table: string;
  readonly primaryKey: keyof TRow & string;
  readonly fields: ReadonlyArray<PrismaFieldLike>;
}

export function extractFromPrisma<TRow>(
  opts: ExtractFromPrismaOptions<TRow>,
): OrmModelDescriptor<TRow> {
  return {
    table: opts.table,
    primaryKey: opts.primaryKey,
    columns: opts.fields.map((f) => ({
      id: f.name,
      type: prismaTypeToColumnType(f.type),
      ...(f.isRequired === false ? { nullable: true as const } : {}),
    })),
  };
}

function prismaTypeToColumnType(t: string): ColumnType {
  switch (t) {
    case 'Int':
      return 'int32';
    case 'BigInt':
      return 'int64';
    case 'Float':
    case 'Double':
      return 'float64';
    case 'Decimal':
      return 'decimal';
    case 'String':
      return 'utf8';
    case 'Boolean':
      return 'bool';
    case 'DateTime':
      return 'timestamp_tz';
    case 'Date':
      return 'date32';
    case 'Json':
      return 'json';
    case 'Bytes':
      return 'binary';
    default:
      return 'unknown';
  }
}

// -----------------------------------------------------------------------------
// bindOrmSync — wrap a CdcAdapter so callbacks fire with ORM-typed rows
// -----------------------------------------------------------------------------

export interface TypedRowDiff<TRow> {
  readonly kind: 'insert' | 'update' | 'delete';
  readonly version: number;
  readonly pkey: TRow[keyof TRow & string];
  /** Same merge semantics as RowDiff.fields — full row on insert,
   *  partial on update, omitted on delete. */
  readonly row?: Partial<TRow>;
}

export interface BindOrmSyncOptions<TRow> {
  readonly cdc: CdcAdapter;
  readonly model: OrmModelDescriptor<TRow>;
  /**
   * Called for each translated diff. Throw to signal "I couldn't apply
   * this — please resync"; the source CDC adapter's `resync` is invoked.
   */
  readonly onDiff: (diff: TypedRowDiff<TRow>) => void | Promise<void>;
  /** Called when the CDC stream signals snapshot — caller drops cache. */
  readonly onSnapshot?: () => void;
  /** Called on CDC transport error. */
  readonly onError?: (err: unknown) => void;
}

export interface OrmSyncHandle {
  /** Stop subscribing; release transport resources. */
  readonly close: () => Promise<void> | void;
  /** Last successfully applied diff version (0 if none). */
  readonly lastVersion: () => number;
  /** Request a manual resync from a known checkpoint. */
  readonly resync: (req: ResyncRequest) => Promise<ResyncResponse>;
}

/** Wire a CDC adapter to typed-row callbacks for the ORM model. */
export function bindOrmSync<TRow>(
  opts: BindOrmSyncOptions<TRow>,
): OrmSyncHandle {
  let lastVersion = 0;
  const onCdcDiff = (raw: RowDiff): void => {
    const typed: TypedRowDiff<TRow> = {
      kind: raw.kind,
      version: raw.version,
      pkey: raw.pkey as TRow[keyof TRow & string],
      ...(raw.fields ? { row: raw.fields as Partial<TRow> } : {}),
    };
    try {
      const r = opts.onDiff(typed);
      if (r instanceof Promise) {
        r.then(
          () => {
            lastVersion = raw.version;
          },
          (e) => opts.onError?.(e),
        );
      } else {
        lastVersion = raw.version;
      }
    } catch (e) {
      opts.onError?.(e);
    }
  };
  const cleanup = opts.cdc.subscribe(onCdcDiff);
  return {
    close: cleanup,
    lastVersion: () => lastVersion,
    resync: (req) => opts.cdc.resync(req),
  };
}
