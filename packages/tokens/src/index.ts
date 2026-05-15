// =============================================================================
// @onegrid/tokens
//
// W3C DTCG (Design Tokens Community Group) Format Module 2025.10 token
// bundles compiled to CSS custom properties scoped to [data-og-root].
// Theme switching via [data-og-theme]; density via [data-og-density].
//
// The DTCG format reached its first stable version on 2025-10-28; the
// shape is `{ "$type": "color", "$value": "#hex" }` for leaf tokens,
// nested objects for groups, `{value}` references for aliases.
//
// Token registration is via @onegrid/plugin-kit's themeRegistry — so
// adopters can ship their own theme bundles without forking core.
// =============================================================================

import { themeRegistry } from '@onegrid/plugin-kit';
import type { Extension } from '@onegrid/plugin-kit';

// -----------------------------------------------------------------------------
// DTCG types (minimal — we only consume colors, dimensions, fontFamilies)
// -----------------------------------------------------------------------------

export type DtcgType =
  | 'color'
  | 'dimension'
  | 'fontFamily'
  | 'fontWeight'
  | 'duration'
  | 'number'
  | 'string';

export interface DtcgToken {
  readonly $type?: DtcgType;
  readonly $value: string | number;
  readonly $description?: string;
}

export interface DtcgGroup {
  readonly $type?: DtcgType;
  readonly $description?: string;
  readonly [key: string]: DtcgToken | DtcgGroup | string | undefined;
}

export type DtcgBundle = DtcgGroup;

// -----------------------------------------------------------------------------
// Compile DTCG → flat token map → CSS
// -----------------------------------------------------------------------------

/**
 * Flatten a DTCG bundle into a `{ "color.background": "#fff" }` map.
 * Group `$type` propagates down; `$value` strings of the form
 * `{group.subgroup.leaf}` are resolved as aliases (single-pass; cycles
 * throw with `OG_TOKEN_CYCLE`).
 */
export function flattenDtcg(bundle: DtcgBundle): Map<string, string | number> {
  const flat = new Map<string, string | number>();
  const walk = (group: DtcgGroup, path: readonly string[]): void => {
    for (const [key, val] of Object.entries(group)) {
      if (key.startsWith('$')) continue;
      if (val === undefined) continue;
      if (typeof val === 'string') continue; // shorthand not in DTCG 2025.10
      const next = [...path, key];
      if (isDtcgToken(val)) {
        flat.set(next.join('.'), val.$value);
      } else {
        walk(val as DtcgGroup, next);
      }
    }
  };
  walk(bundle, []);
  return resolveAliases(flat);
}

function isDtcgToken(v: DtcgToken | DtcgGroup): v is DtcgToken {
  return typeof (v as DtcgToken).$value !== 'undefined';
}

function resolveAliases(
  flat: Map<string, string | number>,
): Map<string, string | number> {
  const aliasRe = /^\{([^}]+)\}$/;
  const seen = new Set<string>();
  const resolve = (key: string, chain: Set<string>): string | number => {
    const val = flat.get(key);
    if (val === undefined) {
      throw new Error(`[OG_TOKEN_UNKNOWN] alias target missing: ${key}`);
    }
    if (typeof val !== 'string') return val;
    const m = val.match(aliasRe);
    if (!m) return val;
    const target = m[1]!;
    if (chain.has(target)) {
      throw new Error(`[OG_TOKEN_CYCLE] alias cycle through ${target}`);
    }
    chain.add(target);
    const resolved = resolve(target, chain);
    flat.set(key, resolved);
    seen.add(key);
    return resolved;
  };
  for (const key of [...flat.keys()]) {
    if (!seen.has(key)) resolve(key, new Set([key]));
  }
  return flat;
}

/**
 * Format a flat token map into `--og-name: value` CSS custom-property
 * declarations. `color.background` → `--og-color-background`.
 */
export function toCssCustomProperties(
  flat: ReadonlyMap<string, string | number>,
): string {
  const lines: string[] = [];
  for (const [name, value] of flat) {
    const cssName = `--og-${name.replaceAll('.', '-')}`;
    lines.push(`  ${cssName}: ${String(value)};`);
  }
  return lines.join('\n');
}

export interface CompileThemeOptions {
  /** Scope selector. Default: `[data-og-root]`. */
  readonly selector?: string;
  /** `[data-og-theme="<name>"]` attribute value, if any. */
  readonly themeName?: string;
  /** `[data-og-density="<name>"]` attribute value, if any. */
  readonly densityName?: string;
}

/**
 * Compile a DTCG bundle straight to a CSS rule block. The result is
 * `<scope-selector>[<theme/density-attr>] { --og-*: ...; }` and can be
 * injected via a `<style>` tag or adopted-stylesheet.
 */
export function compileTheme(
  bundle: DtcgBundle,
  opts: CompileThemeOptions = {},
): string {
  const flat = flattenDtcg(bundle);
  const decls = toCssCustomProperties(flat);
  const scope = opts.selector ?? '[data-og-root]';
  let selector = scope;
  if (opts.themeName) selector += `[data-og-theme="${opts.themeName}"]`;
  if (opts.densityName) selector += `[data-og-density="${opts.densityName}"]`;
  return `${selector} {\n${decls}\n}`;
}

// -----------------------------------------------------------------------------
// prefers-color-scheme watcher
// -----------------------------------------------------------------------------

export type ColorScheme = 'light' | 'dark';

/**
 * Watch `prefers-color-scheme`. Returns a cleanup function. Safe to
 * call in non-DOM environments — it short-circuits when `matchMedia`
 * is undefined.
 */
export function watchPrefersColorScheme(
  onChange: (scheme: ColorScheme) => void,
): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent | MediaQueryList): void => {
    onChange(e.matches ? 'dark' : 'light');
  };
  handler(mql);
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}

// -----------------------------------------------------------------------------
// Forced colors (high contrast) helper
// -----------------------------------------------------------------------------

/**
 * Emit a `@media (forced-colors: active)` block mapping our tokens to
 * the CSS system color keywords. Used by the high-contrast bundle.
 */
export function forcedColorsBlock(
  selector: string = '[data-og-root]',
): string {
  // CSS system color keywords per CSS Color Module Level 4 forced-colors.
  return [
    `@media (forced-colors: active) {`,
    `  ${selector} {`,
    `    --og-color-background: Canvas;`,
    `    --og-color-text: CanvasText;`,
    `    --og-color-border: GrayText;`,
    `    --og-color-selection-bg: Highlight;`,
    `    --og-color-selection-text: HighlightText;`,
    `    --og-color-focus-ring: Highlight;`,
    `    --og-color-link: LinkText;`,
    `    --og-color-disabled: GrayText;`,
    `    forced-color-adjust: none;`,
    `  }`,
    `}`,
  ].join('\n');
}

// -----------------------------------------------------------------------------
// Register a theme bundle with @onegrid/plugin-kit
// -----------------------------------------------------------------------------

export interface ThemeBundle {
  readonly name: string;
  readonly dtcg: DtcgBundle;
  readonly inheritsFrom?: string;
}

/**
 * Register a theme bundle so the grid can `[data-og-theme]`-switch to
 * it. Returns an Extension the consumer attaches to their PluginState.
 */
export function registerTheme(bundle: ThemeBundle): Extension {
  const flat = flattenDtcg(bundle.dtcg);
  const tokens: Record<string, string> = {};
  for (const [k, v] of flat) tokens[k] = String(v);
  return themeRegistry.register(bundle.name, {
    tokens,
    ...(bundle.inheritsFrom ? { inheritsFrom: bundle.inheritsFrom } : {}),
  });
}

// -----------------------------------------------------------------------------
// Token catalog — names every theme bundle is expected to provide.
//
// Color tokens (~30): bg, header, pinned, sticky, hover, selection,
// focus, borders, text, scrollbar, chevron, detail-panel, status-bar,
// floating-filter, tooltip, drag-indicator, validation, aggregation,
// pivot, context-menu.
//
// Density tokens (~15): row/header/detail heights + font sizes +
// padding + border thickness + chevron/checkbox/resize-handle sizes
// + line heights.
// -----------------------------------------------------------------------------

export const COLOR_TOKEN_NAMES = [
  'color.background',
  'color.background-alt',
  'color.text',
  'color.text-muted',
  'color.text-inverse',
  'color.border',
  'color.border-strong',
  'color.header-background',
  'color.header-text',
  'color.pinned-background',
  'color.sticky-background',
  'color.hover-background',
  'color.selection-background',
  'color.selection-text',
  'color.focus-ring',
  'color.scrollbar-thumb',
  'color.scrollbar-track',
  'color.chevron',
  'color.detail-panel-background',
  'color.status-bar-background',
  'color.status-bar-text',
  'color.floating-filter-background',
  'color.tooltip-background',
  'color.tooltip-text',
  'color.drag-indicator',
  'color.validation-error',
  'color.validation-warning',
  'color.aggregation-background',
  'color.pivot-background',
  'color.context-menu-background',
] as const;

export const DENSITY_TOKEN_NAMES = [
  'size.row-height',
  'size.header-height',
  'size.detail-row-height',
  'size.font-base',
  'size.font-header',
  'size.padding-cell-x',
  'size.padding-cell-y',
  'size.border-thickness',
  'size.chevron',
  'size.checkbox',
  'size.resize-handle',
  'size.line-height',
  'size.touch-hit-zone',
  'size.scrollbar',
  'size.icon',
] as const;

export type ColorTokenName = (typeof COLOR_TOKEN_NAMES)[number];
export type DensityTokenName = (typeof DENSITY_TOKEN_NAMES)[number];
