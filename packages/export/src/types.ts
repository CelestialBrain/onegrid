// =============================================================================
// Shared types for @onegrid/export.
//
// Decoupled from @onegrid/core's ColumnDef so this package can be consumed
// by users who haven't installed core (e.g. server-side report generation).
// The shape matches the visual ColumnDef closely enough that adapter-free
// usage is trivial.
// =============================================================================

export interface ExportColumn<TValue = unknown> {
  /** Column id matching the row data key. */
  readonly id: string;
  /** Header text. Defaults to id. */
  readonly header?: string;
  /**
   * Optional formatter — if provided, the exporter emits the formatted
   * string. Otherwise the raw cell value is used (typed by SheetJS for XLSX,
   * stringified for CSV).
   */
  readonly format?: (value: TValue, rowIndex: number) => string;
  /**
   * Type hint for XLSX: 'n' number, 's' string, 'b' bool, 'd' date.
   * Without a hint the exporter infers from `typeof`.
   */
  readonly type?: 'n' | 's' | 'b' | 'd';
}

/**
 * A row is a plain object indexed by column id. Values may be primitives,
 * Dates, or any JSON-serializable type. Strings are escaped at the wire
 * level by the exporter.
 */
export type ExportRow = Record<string, unknown>;
