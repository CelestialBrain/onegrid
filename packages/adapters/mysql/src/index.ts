// =============================================================================
// @onegrid/mysql
//
// MySQL adapter for oneGrid SSRM. Translates BlockRequest into
// parameterized SQL via a pure compiler; ships a polling-based CDC
// adapter that conforms to the universal row-diff stream shape.
//
// Requires `mysql2` ^3.6.0 as a peer dependency.
// =============================================================================

export { createMyDataSource } from './datasource';
export type { MyDataSourceOptions, MyQueryable } from './datasource';

export { createMyCdcAdapter, SnapshotRequired } from './cdc';
export type {
  MyCdcAdapter,
  MyCdcAdapterOptions,
  MyOutboxQueryable,
} from './cdc';

export {
  compileBlockQuery,
  encodeKeysetCursor,
  decodeKeysetCursor,
  isKeysetCursor,
  isLegacyOffsetCursor,
} from './sql';
export type { CompiledQuery, MyTableDescriptor } from './sql';
