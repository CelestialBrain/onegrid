import { describe, it, expect, beforeEach } from 'vitest';
import {
  canonicalizeLocale,
  isValidLocale,
  formatNumber,
  formatDate,
  formatRelative,
  formatList,
  getCollator,
  parseLocalizedNumber,
  loadCatalog,
  t,
  formatTemplate,
  getRtlAwareScrollLeft,
  registerCatalog,
  TRANSLATION_IDS,
} from '../index.js';
import { PluginState, i18nCatalogRegistry } from '@onegrid/plugin-kit';

describe('BCP 47', () => {
  it('canonicalizes case + ordering', () => {
    expect(canonicalizeLocale('en-us')).toBe('en-US');
    expect(canonicalizeLocale('PT-br')).toBe('pt-BR');
  });
  it('rejects garbage', () => {
    expect(isValidLocale('!!nope')).toBe(false);
    expect(isValidLocale('en-US')).toBe(true);
  });
});

describe('Format helpers', () => {
  it('formats numbers, dates, relatives, lists', () => {
    expect(formatNumber(1234.5, 'en-US')).toBe('1,234.5');
    expect(formatNumber(1234.5, 'de-DE')).toBe('1.234,5');
    expect(formatDate(new Date('2026-05-15T00:00:00Z'), 'en-US', { timeZone: 'UTC' })).toContain('2026');
    expect(formatRelative(-1, 'day', 'en-US', { numeric: 'auto' })).toContain('yesterday');
    expect(formatRelative(-1, 'day', 'en-US')).toContain('1 day ago');
    expect(formatList(['a', 'b', 'c'], 'en-US')).toBe('a, b, and c');
  });
  it('caches Intl.Collator instances', () => {
    const a = getCollator('en-US');
    const b = getCollator('en-US');
    expect(a).toBe(b);
  });
});

describe('parseLocalizedNumber', () => {
  it('round-trips through formatNumber for US locale', () => {
    expect(parseLocalizedNumber('1,234.5', 'en-US')).toBe(1234.5);
  });
  it('handles DE-style decimal and group separators', () => {
    expect(parseLocalizedNumber('1.234,5', 'de-DE')).toBe(1234.5);
  });
  it('strips currency symbols', () => {
    expect(parseLocalizedNumber('$1,234.50', 'en-US')).toBe(1234.5);
  });
  it('returns NaN on garbage', () => {
    expect(Number.isNaN(parseLocalizedNumber('abc', 'en-US'))).toBe(true);
  });
});

describe('ICU MessageFormat (subset)', () => {
  it('substitutes simple {name} placeholders', () => {
    expect(formatTemplate('Hello, {name}!', { name: 'Mar' })).toBe('Hello, Mar!');
  });

  it('keeps unknown placeholders literal', () => {
    expect(formatTemplate('Hello, {name}!', {})).toBe('Hello, {name}!');
  });

  it('handles plural with =0, one, other, and # substitution', () => {
    const tpl = '{count, plural, =0 {no items} one {# item} other {# items}}';
    expect(formatTemplate(tpl, { count: 0 })).toBe('no items');
    expect(formatTemplate(tpl, { count: 1 })).toBe('1 item');
    expect(formatTemplate(tpl, { count: 5 })).toBe('5 items');
    expect(formatTemplate(tpl, { count: 1234 })).toBe('1,234 items');
  });

  it('handles select arms with other fallback', () => {
    const tpl = '{gender, select, male {him} female {her} other {them}}';
    expect(formatTemplate(tpl, { gender: 'male' })).toBe('him');
    expect(formatTemplate(tpl, { gender: 'female' })).toBe('her');
    expect(formatTemplate(tpl, { gender: 'enby' })).toBe('them');
  });

  it('resolves messageIds via loaded catalog', () => {
    loadCatalog({ locale: 'en', messages: { 'greeting.hello': 'Hello, {name}' } });
    expect(t('greeting.hello', { name: 'World' }, 'en')).toBe('Hello, World');
  });

  it('falls back to message id on miss', () => {
    expect(t('missing.message.id', {}, 'en')).toBe('missing.message.id');
  });

  it('falls back from regional locale to primary subtag', () => {
    loadCatalog({ locale: 'fr', messages: { 'fr.only': 'salut' } });
    expect(t('fr.only', {}, 'fr-CA')).toBe('salut');
  });
});

describe('getRtlAwareScrollLeft', () => {
  it('returns LTR scrollLeft unchanged when dir is ltr', () => {
    const el = { dir: 'ltr', scrollLeft: 50, scrollWidth: 1000, clientWidth: 500 } as unknown as HTMLElement;
    expect(getRtlAwareScrollLeft(el)).toBe(50);
  });
  it('flips negative RTL scrollLeft to positive logical offset', () => {
    const el = { dir: 'rtl', scrollLeft: -100, scrollWidth: 1000, clientWidth: 500 } as unknown as HTMLElement;
    expect(getRtlAwareScrollLeft(el)).toBe(100);
  });
  it('handles legacy reverse-RTL (max .. 0) convention', () => {
    const el = { dir: 'rtl', scrollLeft: 400, scrollWidth: 1000, clientWidth: 500 } as unknown as HTMLElement;
    // maxScroll = 500; raw=400 → logical = 500 - 400 = 100
    expect(getRtlAwareScrollLeft(el)).toBe(100);
  });
});

describe('Translation catalog surface', () => {
  it('exports a non-empty enumerable TRANSLATION_IDS list', () => {
    expect(TRANSLATION_IDS.length).toBeGreaterThan(50);
    expect(new Set(TRANSLATION_IDS).size).toBe(TRANSLATION_IDS.length);
  });

  it('registers a catalog through @onegrid/plugin-kit', () => {
    const ext = registerCatalog({
      locale: 'en',
      messages: { 'state.empty': 'No data' },
    });
    const state = PluginState.create({ extensions: [ext] });
    const resolved = i18nCatalogRegistry.resolve(state, 'en');
    expect(resolved?.messages['state.empty']).toBe('No data');
  });
});
