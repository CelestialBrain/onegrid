// =============================================================================
// @onegrid/xlsx — OOXML formula interop (Chunk A scaffold).
//
// The .xlsx wire format (ECMA-376 §18) stores cell formulas verbatim as
// strings in the worksheet XML, e.g.:
//
//   <c r="B2"><f>SUM(A1:A10)</f><v>55</v></c>
//
// Excel's formula syntax is what @onegrid/formula already parses, so this
// package's job is two-fold:
//
//   1. Surface a `parseSheetFormulas(xml)` reader that walks an OOXML
//      worksheet XML string and emits a `{ ref → astNode }` map. Each
//      formula goes through @onegrid/formula's parser so callers get a
//      structured AST, not raw text.
//   2. Serialize an AST back to an OOXML-compatible formula string via
//      `serializeFormula(node)`, suitable for emitting <f> tags on write.
//
// This is the v1.1.0 Chunk A scaffold: the worksheet reader handles the
// minimal subset of OOXML needed to round-trip <c>/<f> cells and shared
// formulas. ZIP container parsing, the full styles.xml / sharedStrings.xml
// graph, and write-out of the whole xlsx archive are tracked as follow-ups.
//
// Clean-room MIT: implemented from the OOXML standard text only; no
// inspection of commercial spreadsheet source.
// =============================================================================

export { parseSheetFormulas, type SheetFormulaEntry, type OoxmlFormulaType } from './parse-sheet';
export { serializeFormula } from './serialize';
export { unescapeXml, escapeXml } from './xml';

// Wave 21 (2026-06-02) — OPC container layer:
//   * `readZip` / `writeZip` — minimal PKZIP reader and writer, no jszip
//     dep; uses native `DecompressionStream` in browsers and `node:zlib`
//     under Node.
//   * `readPackage` / `writePackage` — promotes the flat ZIP entry list
//     into an `OpcPackage` (parts + relationships graph) per ECMA-376.
export { readZip, writeZip, type ZipEntry, type ZipReadOptions } from './zip';
export {
  OpcPackage,
  readPackage,
  writePackage,
  type OpcPart,
  type OpcRelationship,
} from './opc';

// Wave 22 (2026-06-02) — SpreadsheetML round-trip:
//   * `readWorkbook(bytes)` opens an `.xlsx` archive and returns a typed
//     Workbook with sheets, cells, formula ASTs, and shared-string
//     resolution. Styles / drawings / charts ride through as raw OpcParts.
//   * `writeWorkbook(workbook)` emits a fresh archive — Content_Types +
//     rels + workbook + worksheets + sharedStrings.
export { readWorkbook, writeWorkbook, type Workbook, type Sheet, type Cell, type CellType } from './workbook';
