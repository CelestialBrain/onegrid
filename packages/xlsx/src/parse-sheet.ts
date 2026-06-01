// =============================================================================
// OOXML sheet1.xml formula reader.
//
// Walks a worksheet XML string and emits one entry per cell that carries a
// formula (`<f>…</f>`). Each entry's formula text is fed through
// @onegrid/formula's parser so callers receive a structured AST.
//
// Shared formulas (`<f t="shared" ref="…" si="…">`) are tracked by their
// `si` index; subsequent cells referring back to that index reuse the
// shared AST. The OOXML "array" variant is parsed the same way — array
// semantics are surfaced via the entry's `formulaType`.
// =============================================================================

import { parseFormula, type FormulaNode, FormulaSyntaxError } from '@onegrid/formula';
import { unescapeXml } from './xml';

export type OoxmlFormulaType = 'normal' | 'array' | 'shared' | 'dataTable';

export interface SheetFormulaEntry {
  /** A1-style cell reference (e.g. "B2"). */
  readonly ref: string;
  /** Raw formula text from `<f>…</f>` (XML-unescaped). */
  readonly source: string;
  /**
   * Parsed AST, or `undefined` if the formula failed to parse. A parse
   * failure does NOT throw out of the reader — callers can decide whether
   * to skip, raise, or fall back to the source text.
   */
  readonly ast: FormulaNode | undefined;
  /** Parse error if `ast` is undefined. */
  readonly parseError?: FormulaSyntaxError;
  /** OOXML formula type from the `<f t>` attribute (default: "normal"). */
  readonly formulaType: OoxmlFormulaType;
  /** Cached value from the `<v>` sibling if present. */
  readonly cachedValue?: string;
  /** Shared-formula group id (`<f si>`) if `formulaType === 'shared'`. */
  readonly sharedIndex?: number;
  /** Anchor range for the shared formula if `formulaType === 'shared'`. */
  readonly sharedRef?: string;
}

const CELL_RE = /<c\b([^>]*?)>([\s\S]*?)<\/c>/g;
const SELF_CLOSING_CELL_RE = /<c\b([^/>]*?)\/>/g;
const FORMULA_RE = /<f\b([^>]*?)>([\s\S]*?)<\/f>|<f\b([^>]*?)\/>/;
const VALUE_RE = /<v>([\s\S]*?)<\/v>/;
const ATTR_RE = /(\w+)="([^"]*)"/g;

function readAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(ATTR_RE)) {
    out[m[1]!] = m[2]!;
  }
  return out;
}

function parseFormulaType(raw: string | undefined): OoxmlFormulaType {
  switch (raw) {
    case 'array':
    case 'shared':
    case 'dataTable':
      return raw;
    default:
      return 'normal';
  }
}

/**
 * Parse every formula-bearing `<c>` element in an OOXML worksheet XML
 * string. Cells without a formula are skipped silently. Self-closing
 * `<c .../>` cells (which never carry formulas) are also skipped.
 *
 * Returns a flat array preserving worksheet order, which lets callers
 * iterate in the same order Excel would.
 */
export function parseSheetFormulas(xml: string): SheetFormulaEntry[] {
  const out: SheetFormulaEntry[] = [];
  const shared = new Map<number, { ast: FormulaNode | undefined; source: string }>();

  for (const m of xml.matchAll(CELL_RE)) {
    const attrs = readAttrs(m[1] ?? '');
    const body = m[2] ?? '';
    const ref = attrs.r;
    if (!ref) continue;
    const fMatch = FORMULA_RE.exec(body);
    const vMatch = VALUE_RE.exec(body);
    const cachedValue = vMatch ? unescapeXml(vMatch[1] ?? '') : undefined;
    if (!fMatch) continue;
    const fAttrs = readAttrs((fMatch[1] ?? fMatch[3]) ?? '');
    const sourceRaw = fMatch[2] ?? '';
    const source = unescapeXml(sourceRaw);
    const formulaType = parseFormulaType(fAttrs.t);
    const sharedIndex = fAttrs.si !== undefined ? Number(fAttrs.si) : undefined;
    const sharedRef = fAttrs.ref;

    let ast: FormulaNode | undefined;
    let parseError: FormulaSyntaxError | undefined;

    if (formulaType === 'shared' && !sourceRaw && sharedIndex !== undefined) {
      // Reference-only shared cell — reuse the previously seen master AST.
      const master = shared.get(sharedIndex);
      ast = master?.ast;
    } else if (source) {
      // OOXML <f> tags omit the leading "=", but the parser accepts both.
      const text = source.startsWith('=') ? source : `=${source}`;
      try {
        ast = parseFormula(text);
      } catch (err) {
        if (err instanceof FormulaSyntaxError) {
          parseError = err;
        } else {
          throw err;
        }
      }
      if (formulaType === 'shared' && sharedIndex !== undefined) {
        shared.set(sharedIndex, { ast, source });
      }
    }

    out.push({
      ref,
      source,
      ast,
      ...(parseError ? { parseError } : {}),
      formulaType,
      ...(cachedValue !== undefined ? { cachedValue } : {}),
      ...(sharedIndex !== undefined ? { sharedIndex } : {}),
      ...(sharedRef ? { sharedRef } : {}),
    });
  }

  // Self-closing cells never carry formulas; explicitly noted for clarity:
  // the regex above skips them. The `SELF_CLOSING_CELL_RE` constant exists
  // so a future Chunk-A pass that needs to enumerate value-only cells can
  // pick it up.
  void SELF_CLOSING_CELL_RE;

  return out;
}
