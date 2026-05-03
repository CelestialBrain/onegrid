// =============================================================================
// @onegrid/export
//
// Two formats, one shared row-shape:
//
//   exportToCsv / downloadCsv      — RFC 4180, zero runtime deps.
//   exportToXlsx / downloadXlsx    — SheetJS via optional peer `xlsx`.
//
// Both formats ship MIT — Excel export is a first-class feature, not a
// premium tier.
// =============================================================================

export { exportToCsv, downloadCsv } from './csv';
export type { ExportToCsvOptions } from './csv';

export { exportToXlsx, downloadXlsx } from './xlsx';
export type { ExportToXlsxOptions, XlsxBlob } from './xlsx';

export type { ExportColumn, ExportRow } from './types';
