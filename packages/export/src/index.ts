// =============================================================================
// @onegrid/export
//
// Two formats, one shared row-shape:
//
//   exportToCsv / downloadCsv      — RFC 4180, zero runtime deps.
//   exportToXlsx / downloadXlsx    — SheetJS via optional peer `xlsx`.
//
// Why this lives in a separate package: the matrix's "Premium features"
// tier shows that every commercial grid (AG Grid Enterprise, MUI X
// Premium, Webix, Syncfusion, Bryntum, Kendo, DevExtreme, Infragistics)
// gates Excel export behind a paid tier. Tabulator is the only MIT
// alternative. oneGrid ships both formats MIT-free in v0.0.4.
// =============================================================================

export { exportToCsv, downloadCsv } from './csv';
export type { ExportToCsvOptions } from './csv';

export { exportToXlsx, downloadXlsx } from './xlsx';
export type { ExportToXlsxOptions, XlsxBlob } from './xlsx';

export type { ExportColumn, ExportRow } from './types';
