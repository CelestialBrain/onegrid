// =============================================================================
// @onegrid/intl
//
// i18n / l10n / RTL surface. Three layers:
//
//   1. Intl.* thin wrappers — formatNumber / formatDate / formatRelative /
//      formatList. Cached underneath because constructing Intl.NumberFormat
//      etc. is non-trivial.
//   2. ICU MessageFormat (subset) — simple substitution + plural + select.
//      Implemented inline to avoid the FormatJS bundle weight; covers the
//      grid's translation surface. Drop in @formatjs/intl-messageformat
//      yourself if you need nested formats or richTextElements.
//   3. RTL helpers — getRtlAwareScrollLeft (engine-version quirk
//      abstraction) and a BCP 47 validator backed by Intl.Locale.
//
// Catalogs register through @onegrid/plugin-kit's i18nCatalogRegistry so
// adopters can ship locales without forking core.
// =============================================================================

import { i18nCatalogRegistry } from '@onegrid/plugin-kit';
import type { Extension } from '@onegrid/plugin-kit';

// -----------------------------------------------------------------------------
// BCP 47
// -----------------------------------------------------------------------------

/**
 * Validate and canonicalize a BCP 47 locale tag using `Intl.Locale`.
 * Returns the canonical form (case-normalized, subtags ordered) or
 * `undefined` if invalid.
 * @public
 */
export function canonicalizeLocale(tag: string): string | undefined {
  try {
    return new Intl.Locale(tag).toString();
  } catch {
    return undefined;
  }
}

/** @public */
export function isValidLocale(tag: string): boolean {
  return canonicalizeLocale(tag) !== undefined;
}

// -----------------------------------------------------------------------------
// Format helpers — cached Intl.* factories
// -----------------------------------------------------------------------------

const numberFmts = new Map<string, Intl.NumberFormat>();
const dateFmts = new Map<string, Intl.DateTimeFormat>();
const relativeFmts = new Map<string, Intl.RelativeTimeFormat>();
const listFmts = new Map<string, Intl.ListFormat>();
const collators = new Map<string, Intl.Collator>();

function keyFor(locale: string, opts: object): string {
  return `${locale}|${JSON.stringify(opts)}`;
}

/** @public */
export function formatNumber(
  value: number | bigint,
  locale: string = 'en-US',
  opts: Intl.NumberFormatOptions = {},
): string {
  const key = keyFor(locale, opts);
  let fmt = numberFmts.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, opts);
    numberFmts.set(key, fmt);
  }
  return fmt.format(value);
}

/** @public */
export function formatDate(
  value: Date | number,
  locale: string = 'en-US',
  opts: Intl.DateTimeFormatOptions = {},
): string {
  const key = keyFor(locale, opts);
  let fmt = dateFmts.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, opts);
    dateFmts.set(key, fmt);
  }
  return fmt.format(value);
}

/** @public */
export type RelativeUnit =
  | 'year'
  | 'quarter'
  | 'month'
  | 'week'
  | 'day'
  | 'hour'
  | 'minute'
  | 'second';

/** @public */
export function formatRelative(
  value: number,
  unit: RelativeUnit,
  locale: string = 'en-US',
  opts: Intl.RelativeTimeFormatOptions = {},
): string {
  const key = keyFor(locale, opts);
  let fmt = relativeFmts.get(key);
  if (!fmt) {
    fmt = new Intl.RelativeTimeFormat(locale, opts);
    relativeFmts.set(key, fmt);
  }
  return fmt.format(value, unit);
}

/** @public */
export function formatList(
  items: ReadonlyArray<string>,
  locale: string = 'en-US',
  opts: Intl.ListFormatOptions = {},
): string {
  const key = keyFor(locale, opts);
  let fmt = listFmts.get(key);
  if (!fmt) {
    fmt = new Intl.ListFormat(locale, opts);
    listFmts.set(key, fmt);
  }
  return fmt.format([...items]);
}

/**
 * Cached `Intl.Collator` — use for any user-visible string sort.
 * @public
 */
export function getCollator(
  locale: string = 'en-US',
  opts: Intl.CollatorOptions = {},
): Intl.Collator {
  const key = keyFor(locale, opts);
  let col = collators.get(key);
  if (!col) {
    col = new Intl.Collator(locale, opts);
    collators.set(key, col);
  }
  return col;
}

// -----------------------------------------------------------------------------
// Locale-aware number / date parsers
// -----------------------------------------------------------------------------

/**
 * Parse a localized number string back to a number. Walks
 * `Intl.NumberFormat.formatToParts` to learn the decimal + group
 * separators for the locale, then strips groups and replaces the
 * locale decimal with `.` before `Number()`.
 *
 * Returns `NaN` if the cleaned string fails `Number()`.
 * @public
 */
export function parseLocalizedNumber(
  input: string,
  locale: string = 'en-US',
): number {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  const groupSep = parts.find((p) => p.type === 'group')?.value ?? ',';
  const decimalSep = parts.find((p) => p.type === 'decimal')?.value ?? '.';
  let cleaned = input.trim();
  // Remove group separators and convert the decimal separator to '.'.
  cleaned = cleaned.split(groupSep).join('');
  cleaned = cleaned.replace(decimalSep, '.');
  // Strip currency symbols / spaces that may have prefixed.
  cleaned = cleaned.replace(/[^0-9.\-+eE]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '+') return NaN;
  return Number(cleaned);
}

// -----------------------------------------------------------------------------
// ICU MessageFormat (subset) — `t(messageId, params, locale?)`
//
// Supported syntax:
//
//   "Hello, {name}!"
//   "{count, plural, =0 {none} one {# item} other {# items}}"
//   "{gender, select, male {him} female {her} other {them}}"
//
// `#` inside a plural arm substitutes the count. Plural keyword set
// driven by `Intl.PluralRules`.
// -----------------------------------------------------------------------------

interface Catalog {
  readonly locale: string;
  readonly messages: Readonly<Record<string, string>>;
}

const loadedCatalogs = new Map<string, Catalog>();

/**
 * Load an inline catalog. Last write wins per locale.
 * @public
 */
export function loadCatalog(catalog: Catalog): void {
  if (!isValidLocale(catalog.locale)) {
    throw new Error(
      `[OG_I18N_INVALID_LOCALE] '${catalog.locale}' is not a valid BCP 47 tag`,
    );
  }
  loadedCatalogs.set(canonicalizeLocale(catalog.locale)!, catalog);
}

function resolveMessage(messageId: string, locale: string): string {
  const canonical = canonicalizeLocale(locale) ?? locale;
  // Exact match first, then primary subtag fallback (en-US → en).
  let cat = loadedCatalogs.get(canonical);
  if (!cat) {
    const primary = canonical.split('-')[0];
    if (primary) cat = loadedCatalogs.get(primary);
  }
  if (cat && messageId in cat.messages) {
    return cat.messages[messageId]!;
  }
  return messageId; // Fallback: return the id, like FormatJS.
}

/**
 * Translate a message. `params` keys substitute into `{name}`
 * placeholders; numeric params drive plural arms via
 * `Intl.PluralRules`.
 * @public
 */
export function t(
  messageId: string,
  params: Readonly<Record<string, string | number>> = {},
  locale: string = 'en-US',
): string {
  const template = resolveMessage(messageId, locale);
  return formatTemplate(template, params, locale);
}

const pluralRulesCache = new Map<string, Intl.PluralRules>();
function getPluralRules(locale: string): Intl.PluralRules {
  let pr = pluralRulesCache.get(locale);
  if (!pr) {
    pr = new Intl.PluralRules(locale);
    pluralRulesCache.set(locale, pr);
  }
  return pr;
}

/** @public */
export function formatTemplate(
  template: string,
  params: Readonly<Record<string, string | number>>,
  locale: string = 'en-US',
): string {
  return parseAndRender(template, params, locale);
}

function parseAndRender(
  template: string,
  params: Readonly<Record<string, string | number>>,
  locale: string,
): string {
  let out = '';
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch === '{') {
      const end = findMatchingBrace(template, i);
      const segment = template.slice(i + 1, end);
      out += renderSegment(segment, params, locale);
      i = end + 1;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

function findMatchingBrace(s: string, start: number): number {
  let depth = 1;
  for (let i = start + 1; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`[OG_I18N_UNBALANCED_BRACES] in: ${s}`);
}

function renderSegment(
  segment: string,
  params: Readonly<Record<string, string | number>>,
  locale: string,
): string {
  // Simple substitution: "name"
  const commaIdx = segment.indexOf(',');
  if (commaIdx === -1) {
    const key = segment.trim();
    const v = params[key];
    return v === undefined ? `{${key}}` : String(v);
  }
  const key = segment.slice(0, commaIdx).trim();
  const rest = segment.slice(commaIdx + 1).trim();
  const kindCommaIdx = rest.indexOf(',');
  if (kindCommaIdx === -1) {
    return `{${segment}}`; // Malformed — bail out gracefully.
  }
  const kind = rest.slice(0, kindCommaIdx).trim();
  const arms = rest.slice(kindCommaIdx + 1).trim();
  if (kind === 'plural') {
    return renderPlural(key, arms, params, locale);
  }
  if (kind === 'select') {
    return renderSelect(key, arms, params, locale);
  }
  return `{${segment}}`; // Unknown kind — pass through verbatim.
}

function renderPlural(
  key: string,
  arms: string,
  params: Readonly<Record<string, string | number>>,
  locale: string,
): string {
  const count = Number(params[key] ?? 0);
  const cat = getPluralRules(locale).select(count);
  const parsed = parseArms(arms);
  const armText =
    parsed[`=${count}`] ?? parsed[cat] ?? parsed['other'] ?? '';
  // `#` inside the arm substitutes the count.
  const withCount = armText.replaceAll(
    '#',
    formatNumber(count, locale),
  );
  return parseAndRender(withCount, params, locale);
}

function renderSelect(
  key: string,
  arms: string,
  params: Readonly<Record<string, string | number>>,
  locale: string,
): string {
  const v = String(params[key] ?? '');
  const parsed = parseArms(arms);
  const armText = parsed[v] ?? parsed['other'] ?? '';
  return parseAndRender(armText, params, locale);
}

/**
 * Parse `=0 {none} one {# item} other {# items}` into
 * `{ '=0': 'none', one: '# item', other: '# items' }`.
 */
function parseArms(arms: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < arms.length) {
    while (i < arms.length && /\s/.test(arms[i]!)) i++;
    if (i >= arms.length) break;
    // Read keyword until '{'.
    const start = i;
    while (i < arms.length && arms[i] !== '{') i++;
    const keyword = arms.slice(start, i).trim();
    if (i >= arms.length) break;
    const end = findMatchingBrace(arms, i);
    out[keyword] = arms.slice(i + 1, end);
    i = end + 1;
  }
  return out;
}

// -----------------------------------------------------------------------------
// RTL helpers
// -----------------------------------------------------------------------------

/**
 * Normalize `scrollLeft` across the three engine conventions:
 *
 *   default:   0 .. (scrollWidth - clientWidth)  in LTR;  negative in RTL (Chromium 85+, Firefox)
 *   negative:  0 .. -(scrollWidth - clientWidth) in RTL                 (legacy Firefox)
 *   reverse:   (scrollWidth - clientWidth) .. 0  in RTL                 (legacy Chromium / Safari)
 *
 * Returns the LTR-equivalent scrollLeft (0 = start of content in
 * logical reading order). Maps cleanly onto `inset-inline-start`
 * positioning.
 * @public
 */
export function getRtlAwareScrollLeft(el: Element): number {
  const dir = (el as HTMLElement).dir ||
    getComputedStyleSafe(el)?.direction ||
    'ltr';
  const raw = el.scrollLeft;
  if (dir !== 'rtl') return raw;
  const maxScroll = el.scrollWidth - el.clientWidth;
  // Modern (Chromium 85+, Firefox 95+): RTL scrollLeft is negative.
  if (raw <= 0) return -raw;
  // Reverse (legacy Webkit / Edge Legacy): RTL scrollLeft counts down from max.
  return maxScroll - raw;
}

function getComputedStyleSafe(el: Element): CSSStyleDeclaration | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.getComputedStyle(el);
}

// -----------------------------------------------------------------------------
// Translation surface — the full enumerable string id catalog
// -----------------------------------------------------------------------------

/**
 * Every translatable message-id used inside oneGrid. Exported so
 * adopters can prove their custom catalog covers the full surface
 * (the test suite asserts every id is present in the bundled
 * locales).
 * @public
 */
export const TRANSLATION_IDS = [
  // chevron + grouping
  'grouping.expand',
  'grouping.collapse',
  'grouping.expandAll',
  'grouping.collapseAll',
  'grouping.groupBy',
  'grouping.removeGroup',
  // empty / loading
  'state.empty',
  'state.loading',
  'state.error',
  'state.noResults',
  // validation
  'validation.required',
  'validation.invalid',
  'validation.outOfRange',
  // context menu
  'menu.copy',
  'menu.paste',
  'menu.cut',
  'menu.delete',
  'menu.pin.left',
  'menu.pin.right',
  'menu.unpin',
  'menu.expand',
  'menu.collapse',
  // column tool panel
  'columnTool.show',
  'columnTool.hide',
  'columnTool.reset',
  'columnTool.searchPlaceholder',
  'columnTool.title',
  // row group footers
  'group.footerCount',
  // aggregation function names
  'agg.sum',
  'agg.avg',
  'agg.min',
  'agg.max',
  'agg.count',
  'agg.first',
  'agg.last',
  'agg.median',
  // filter operator names
  'filter.eq',
  'filter.neq',
  'filter.lt',
  'filter.lte',
  'filter.gt',
  'filter.gte',
  'filter.contains',
  'filter.startsWith',
  'filter.endsWith',
  'filter.between',
  'filter.in',
  'filter.isNull',
  'filter.isNotNull',
  // status bar
  'statusBar.selectedRows',
  'statusBar.totalRows',
  'statusBar.filteredRows',
  // floating filter placeholders
  'filter.placeholder.text',
  'filter.placeholder.number',
  'filter.placeholder.date',
  // drag-drop indicators
  'dnd.moveColumn',
  'dnd.groupColumn',
  // pagination
  'pagination.next',
  'pagination.prev',
  'pagination.first',
  'pagination.last',
  'pagination.pageOf',
  // tooltip help text
  'tooltip.sortAsc',
  'tooltip.sortDesc',
  'tooltip.filter',
  'tooltip.menu',
  // detail panel
  'detail.expand',
  'detail.collapse',
  'detail.title',
  // date / time
  'date.month.1', 'date.month.2', 'date.month.3', 'date.month.4',
  'date.month.5', 'date.month.6', 'date.month.7', 'date.month.8',
  'date.month.9', 'date.month.10', 'date.month.11', 'date.month.12',
  'date.weekday.0', 'date.weekday.1', 'date.weekday.2', 'date.weekday.3',
  'date.weekday.4', 'date.weekday.5', 'date.weekday.6',
  'date.am', 'date.pm',
  // currency
  'currency.format',
] as const;

/** @public */
export type TranslationId = (typeof TRANSLATION_IDS)[number];

// -----------------------------------------------------------------------------
// Plugin-kit integration
// -----------------------------------------------------------------------------

/**
 * Register a translation catalog into @onegrid/plugin-kit's i18nCatalogRegistry.
 * @public
 */
export function registerCatalog(catalog: Catalog): Extension {
  return i18nCatalogRegistry.register(catalog.locale, {
    locale: catalog.locale,
    messages: catalog.messages,
  });
}
