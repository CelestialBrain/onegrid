// =============================================================================
// Minimal XML escape/unescape — handles the five OOXML-defined entities.
// We deliberately avoid pulling in an XML parser; the worksheet reader uses
// targeted regex matching against ECMA-376 §18.3 grammar.
// =============================================================================

const ENTITY_TO_CHAR: ReadonlyArray<readonly [string, string]> = [
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&amp;', '&'],
  ['&quot;', '"'],
  ['&apos;', "'"],
];

const CHAR_TO_ENTITY: ReadonlyArray<readonly [string, string]> = [
  ['&', '&amp;'], // must come first to avoid double-escaping
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&apos;'],
];

export function unescapeXml(text: string): string {
  let out = text;
  for (const [entity, char] of ENTITY_TO_CHAR) {
    out = out.split(entity).join(char);
  }
  // Numeric entities (decimal + hex). OOXML uses these for control chars.
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)));
  out = out.replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)));
  return out;
}

export function escapeXml(text: string): string {
  let out = text;
  for (const [char, entity] of CHAR_TO_ENTITY) {
    out = out.split(char).join(entity);
  }
  return out;
}
