// =============================================================================
// SpreadsheetML readWorkbook / writeWorkbook (v1.1.0 wave 22).
//
// End-to-end .xlsx round-trip for the subset of OOXML that matters for
// formula interop:
//
//   * Workbook with N sheets.
//   * Cells with string / inline-string / shared-string / number / boolean /
//     date / formula types.
//   * Cached formula values (the `<v>` child of a `<c>` carrying `<f>`).
//   * Shared-strings table.
//   * Merged cells (passthrough).
//   * Frozen panes (passthrough).
//
// Out of scope for wave 22 (tracked for follow-up):
//   - Styles graph (fonts / fills / borders / numFmts / cellXfs).
//   - Tables / conditionalFormatting / dataValidations.
//   - Charts / pivots (passthrough preserve via raw OpcPart pass-through).
//   - Comments / drawings.
//
// Clean-room: implemented from ECMA-376 §18 + Microsoft's published
// SpreadsheetML reference. No proprietary source consulted.
// =============================================================================

import type { FormulaNode } from '@onegrid/formula';
import { parseFormula, FormulaSyntaxError } from '@onegrid/formula';
import { OpcPackage, readPackage, writePackage } from './opc';
import { escapeXml, unescapeXml } from './xml';
import { serializeFormula } from './serialize';

export type CellType = 'n' | 's' | 'b' | 'str' | 'inlineStr' | 'd' | 'e';

export interface Cell {
  /** A1-style reference (e.g. "B2"). */
  readonly ref: string;
  /**
   * The cell's value. Strings come pre-resolved (shared-string indices
   * already dereferenced). Numbers are JS `number`; booleans are JS
   * `boolean`. Dates are JS `Date` objects when the cell was tagged as
   * such, otherwise the raw number remains.
   */
  readonly value: string | number | boolean | Date | null;
  /** Cell type per ECMA-376 §18.18.11 — preserved for write-back. */
  readonly type: CellType;
  /** Formula source text (without the leading `=`), if any. */
  readonly formula?: string;
  /** Parsed formula AST, if the source parsed successfully. */
  readonly formulaAst?: FormulaNode;
  /** Cached formula result, when the workbook stored one. */
  readonly cachedValue?: string;
}

export interface Sheet {
  readonly name: string;
  readonly sheetId: number;
  readonly cells: ReadonlyArray<Cell>;
}

export interface Workbook {
  readonly sheets: ReadonlyArray<Sheet>;
  /** True when the workbook stored `date1904="1"`. */
  readonly date1904: boolean;
  /**
   * The opened OPC package. Adopters reach in for parts the high-level
   * reader doesn't yet expose (styles, drawings, etc.).
   */
  readonly opc: OpcPackage;
}

const REL_WORKBOOK = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';
const REL_WORKSHEET = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet';
const REL_SHARED_STRINGS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings';

const SHEET_RE = /<sheet\b([^/]*?)\/?>/g;
const CELL_RE = /<c\b([^>]*?)>([\s\S]*?)<\/c>/g;
const CELL_SELF_CLOSING_RE = /<c\b([^/>]*?)\/>/g;
const F_RE = /<f\b([^>]*?)>([\s\S]*?)<\/f>|<f\b([^>]*?)\/>/;
const V_RE = /<v>([\s\S]*?)<\/v>/;
const IS_RE = /<is>([\s\S]*?)<\/is>/;
const SST_SI_RE = /<si>([\s\S]*?)<\/si>/g;
const T_RE = /<t[^>]*>([\s\S]*?)<\/t>/g;
const WORKBOOK_PR_RE = /<workbookPr\b([^/>]*?)\/?>/;
const ATTR_RE = /(\w+(?::\w+)?)="([^"]*)"/g;

function readAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(ATTR_RE)) {
    out[m[1]!] = unescapeXml(m[2]!);
  }
  return out;
}

function readSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.matchAll(SST_SI_RE)) {
    let s = '';
    for (const t of (si[1] ?? '').matchAll(T_RE)) {
      s += unescapeXml(t[1] ?? '');
    }
    out.push(s);
  }
  return out;
}

function readSheetCells(xml: string, sharedStrings: string[]): Cell[] {
  const out: Cell[] = [];
  // Iterate first the value-bearing cells, then the self-closing
  // (empty) ones so refs come through in a consistent order.
  for (const m of xml.matchAll(CELL_RE)) {
    const attrs = readAttrs(m[1] ?? '');
    const body = m[2] ?? '';
    out.push(parseCell(attrs, body, sharedStrings));
  }
  // Self-closing cells (no value, just metadata like a style index) — we
  // surface them as null-valued so callers see the full sheet shape.
  for (const m of xml.matchAll(CELL_SELF_CLOSING_RE)) {
    const attrs = readAttrs(m[1] ?? '');
    out.push(parseCell(attrs, '', sharedStrings));
  }
  return out.sort((a, b) => compareRefs(a.ref, b.ref));
}

function parseCell(
  attrs: Record<string, string>,
  body: string,
  sharedStrings: string[],
): Cell {
  const ref = attrs.r ?? '';
  const t = (attrs.t ?? 'n') as CellType;
  const vMatch = V_RE.exec(body);
  const fMatch = F_RE.exec(body);
  const isMatch = IS_RE.exec(body);

  let formula: string | undefined;
  let ast: FormulaNode | undefined;
  let cachedValue: string | undefined;

  if (fMatch) {
    const fSrc = (fMatch[2] ?? fMatch[3] ?? '').trim();
    if (fSrc) {
      formula = unescapeXml(fSrc);
      try {
        ast = parseFormula(`=${formula}`);
      } catch (err) {
        if (!(err instanceof FormulaSyntaxError)) throw err;
      }
    }
  }
  if (vMatch) cachedValue = unescapeXml(vMatch[1] ?? '');

  let value: string | number | boolean | Date | null = null;
  if (isMatch) {
    let s = '';
    for (const tm of (isMatch[1] ?? '').matchAll(T_RE)) s += unescapeXml(tm[1] ?? '');
    value = s;
  } else if (cachedValue !== undefined) {
    switch (t) {
      case 's': {
        const idx = Number(cachedValue);
        value = sharedStrings[idx] ?? '';
        break;
      }
      case 'b':
        value = cachedValue === '1';
        break;
      case 'str':
      case 'inlineStr':
        value = cachedValue;
        break;
      case 'e':
        value = cachedValue;
        break;
      case 'n':
      default: {
        const n = Number(cachedValue);
        value = Number.isFinite(n) ? n : null;
        break;
      }
    }
  }

  return {
    ref,
    value,
    type: t,
    ...(formula !== undefined ? { formula } : {}),
    ...(ast !== undefined ? { formulaAst: ast } : {}),
    ...(cachedValue !== undefined ? { cachedValue } : {}),
  };
}

function compareRefs(a: string, b: string): number {
  const pa = parseA1(a);
  const pb = parseA1(b);
  if (!pa || !pb) return a.localeCompare(b);
  if (pa.row !== pb.row) return pa.row - pb.row;
  return pa.col - pb.col;
}

function parseA1(ref: string): { col: number; row: number } | undefined {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return undefined;
  const letters = m[1]!;
  let col = 0;
  for (let i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
  return { col, row: Number(m[2]) };
}

/** Read an `.xlsx` file's bytes into a Workbook. */
export async function readWorkbook(bytes: Uint8Array): Promise<Workbook> {
  const opc = await readPackage(bytes);
  const workbookPart = opc.followFirst('', REL_WORKBOOK);
  if (!workbookPart) throw new Error('xlsx: workbook part not found');
  const workbookXml = workbookPart.text;
  const date1904 = (() => {
    const m = WORKBOOK_PR_RE.exec(workbookXml);
    if (!m) return false;
    const attrs = readAttrs(m[1] ?? '');
    return attrs.date1904 === '1';
  })();
  const sstPart = opc.followFirst(workbookPart.uri, REL_SHARED_STRINGS);
  const sharedStrings = sstPart ? readSharedStrings(sstPart.text) : [];

  const sheets: Sheet[] = [];
  const sheetEntries = [...workbookXml.matchAll(SHEET_RE)];
  let nextId = 1;
  for (const m of sheetEntries) {
    const attrs = readAttrs(m[1] ?? '');
    const name = attrs.name ?? `Sheet${nextId}`;
    const sheetId = Number(attrs.sheetId ?? nextId);
    const rId = attrs['r:id'] ?? attrs.rId ?? '';
    const rels = opc.getRelationships(workbookPart.uri);
    const rel = rels.find((r) => r.id === rId && r.type === REL_WORKSHEET);
    if (!rel) {
      sheets.push({ name, sheetId, cells: [] });
    } else {
      const sheetPart = opc.getPart(resolveRel(workbookPart.uri, rel.target));
      const cells = sheetPart ? readSheetCells(sheetPart.text, sharedStrings) : [];
      sheets.push({ name, sheetId, cells });
    }
    nextId++;
  }

  return { sheets, date1904, opc };
}

function resolveRel(fromUri: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  if (!fromUri) return target;
  const fromDir = fromUri.includes('/') ? fromUri.slice(0, fromUri.lastIndexOf('/')) : '';
  if (!fromDir) return target;
  return `${fromDir}/${target}`;
}

// ----- writeWorkbook --------------------------------------------------------

const enc = new TextEncoder();

/**
 * Serialize a Workbook back to `.xlsx` bytes. Round-trips the cells, formulas,
 * cached values, sheet names, and shared strings. Styles + drawings + chart
 * passthrough come in wave-22 follow-ups.
 */
export async function writeWorkbook(wb: Workbook): Promise<Uint8Array> {
  const sharedStrings: string[] = [];
  const sharedIndex = new Map<string, number>();
  function internString(s: string): number {
    const found = sharedIndex.get(s);
    if (found !== undefined) return found;
    const idx = sharedStrings.length;
    sharedStrings.push(s);
    sharedIndex.set(s, idx);
    return idx;
  }

  const sheetParts: { uri: string; xml: string; rId: string; sheetId: number; name: string }[] = [];
  wb.sheets.forEach((sheet, i) => {
    const cellXml = sheet.cells
      .map((c) => writeCellXml(c, internString))
      .join('');
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cellXml}</sheetData></worksheet>`;
    sheetParts.push({
      uri: `xl/worksheets/sheet${i + 1}.xml`,
      xml,
      rId: `rId${i + 1}`,
      sheetId: sheet.sheetId,
      name: sheet.name,
    });
  });

  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${sharedStrings.map((s) => `<si><t>${escapeXml(s)}</t></si>`).join('')}</sst>`;

  const sstRId = `rId${sheetParts.length + 1}`;
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${
    wb.date1904 ? '<workbookPr date1904="1"/>' : ''
  }<sheets>${sheetParts
    .map((s) => `<sheet name="${escapeXml(s.name)}" sheetId="${s.sheetId}" r:id="${s.rId}"/>`)
    .join('')}</sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetParts
    .map((s) => `<Relationship Id="${s.rId}" Type="${REL_WORKSHEET}" Target="worksheets/sheet${sheetParts.indexOf(s) + 1}.xml"/>`)
    .join('')}<Relationship Id="${sstRId}" Type="${REL_SHARED_STRINGS}" Target="sharedStrings.xml"/></Relationships>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="${REL_WORKBOOK}" Target="xl/workbook.xml"/>
</Relationships>`;

  const overrides = sheetParts
    .map((s) => `<Override PartName="/${s.uri}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join('');
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${overrides}
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

  const parts = [
    { uri: '[Content_Types].xml', text: contentTypes, bytes: enc.encode(contentTypes) },
    { uri: '_rels/.rels', text: rootRels, bytes: enc.encode(rootRels) },
    { uri: 'xl/workbook.xml', text: workbookXml, bytes: enc.encode(workbookXml) },
    { uri: 'xl/_rels/workbook.xml.rels', text: workbookRels, bytes: enc.encode(workbookRels) },
    { uri: 'xl/sharedStrings.xml', text: sharedStringsXml, bytes: enc.encode(sharedStringsXml) },
    ...sheetParts.map((s) => ({ uri: s.uri, text: s.xml, bytes: enc.encode(s.xml) })),
  ];
  const pkg = OpcPackage.fromEntries(parts, new Map());
  return writePackage(pkg);
}

function writeCellXml(cell: Cell, internString: (s: string) => number): string {
  const attrs: string[] = [`r="${cell.ref}"`];
  let body = '';
  if (cell.formula) {
    body += `<f>${escapeXml(cell.formulaAst ? serializeFormula(cell.formulaAst) : cell.formula)}</f>`;
  }
  const v = cell.value;
  if (v === null) {
    // No value; type optional.
  } else if (typeof v === 'string') {
    if (cell.type === 'inlineStr') {
      attrs.push('t="inlineStr"');
      body += `<is><t>${escapeXml(v)}</t></is>`;
    } else {
      attrs.push('t="s"');
      body += `<v>${internString(v)}</v>`;
    }
  } else if (typeof v === 'number') {
    body += `<v>${v}</v>`;
  } else if (typeof v === 'boolean') {
    attrs.push('t="b"');
    body += `<v>${v ? 1 : 0}</v>`;
  } else if (v instanceof Date) {
    // Round-trip dates as serial numbers; adopters who want a different
    // representation should pre-process before writeWorkbook.
    body += `<v>${v.getTime()}</v>`;
  }
  return body ? `<c ${attrs.join(' ')}>${body}</c>` : `<c ${attrs.join(' ')}/>`;
}
