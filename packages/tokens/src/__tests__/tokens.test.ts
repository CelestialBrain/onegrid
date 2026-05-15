import { describe, it, expect, vi } from 'vitest';
import {
  flattenDtcg,
  toCssCustomProperties,
  compileTheme,
  watchPrefersColorScheme,
  forcedColorsBlock,
  registerTheme,
  COLOR_TOKEN_NAMES,
  DENSITY_TOKEN_NAMES,
  type DtcgBundle,
} from '../index.js';
import { lightDtcg, lightTheme } from '../themes/light.js';
import { darkDtcg } from '../themes/dark.js';
import compactDtcg from '../density/compact.js';
import comfortableDtcg from '../density/comfortable.js';
import spaciousDtcg from '../density/spacious.js';
import { PluginState, themeRegistry } from '@onegrid/plugin-kit';

describe('flattenDtcg', () => {
  it('flattens nested DTCG groups using dot paths', () => {
    const bundle: DtcgBundle = {
      color: {
        $type: 'color',
        bg: { $value: '#fff' },
        text: { $value: '#000' },
      },
    };
    const flat = flattenDtcg(bundle);
    expect(flat.get('color.bg')).toBe('#fff');
    expect(flat.get('color.text')).toBe('#000');
  });

  it('resolves single-hop aliases', () => {
    const bundle: DtcgBundle = {
      color: {
        $type: 'color',
        primary: { $value: '#0969da' },
        link: { $value: '{color.primary}' },
      },
    };
    const flat = flattenDtcg(bundle);
    expect(flat.get('color.link')).toBe('#0969da');
  });

  it('throws on alias cycles', () => {
    const bundle: DtcgBundle = {
      color: {
        a: { $value: '{color.b}' },
        b: { $value: '{color.a}' },
      },
    };
    expect(() => flattenDtcg(bundle)).toThrow(/OG_TOKEN_CYCLE/);
  });

  it('throws on unknown alias targets', () => {
    const bundle: DtcgBundle = {
      color: { a: { $value: '{color.missing}' } },
    };
    expect(() => flattenDtcg(bundle)).toThrow(/OG_TOKEN_UNKNOWN/);
  });
});

describe('toCssCustomProperties', () => {
  it('formats names as --og- kebab-case', () => {
    const flat = new Map([
      ['color.background', '#fff'],
      ['size.row-height', '32px'],
    ]);
    const css = toCssCustomProperties(flat);
    expect(css).toContain('--og-color-background: #fff;');
    expect(css).toContain('--og-size-row-height: 32px;');
  });
});

describe('compileTheme', () => {
  it('wraps declarations in a [data-og-root] block by default', () => {
    const css = compileTheme(lightDtcg);
    expect(css).toMatch(/^\[data-og-root\] \{/);
    expect(css).toContain('--og-color-background:');
  });

  it('adds [data-og-theme] selector when themeName given', () => {
    const css = compileTheme(darkDtcg, { themeName: 'dark' });
    expect(css).toContain('[data-og-root][data-og-theme="dark"]');
  });

  it('adds [data-og-density] selector when densityName given', () => {
    const css = compileTheme(compactDtcg, { densityName: 'compact' });
    expect(css).toContain('[data-og-density="compact"]');
  });
});

describe('built-in bundles cover the documented token catalog', () => {
  it('light theme defines every named color token', () => {
    const flat = flattenDtcg(lightDtcg);
    for (const name of COLOR_TOKEN_NAMES) {
      expect(flat.get(name), `light missing ${name}`).toBeDefined();
    }
  });

  it('dark theme defines every named color token', () => {
    const flat = flattenDtcg(darkDtcg);
    for (const name of COLOR_TOKEN_NAMES) {
      expect(flat.get(name), `dark missing ${name}`).toBeDefined();
    }
  });

  it('each density bundle defines every named density token', () => {
    for (const [label, bundle] of [
      ['compact', compactDtcg],
      ['comfortable', comfortableDtcg],
      ['spacious', spaciousDtcg],
    ] as const) {
      const flat = flattenDtcg(bundle);
      for (const name of DENSITY_TOKEN_NAMES) {
        expect(flat.get(name), `${label} missing ${name}`).toBeDefined();
      }
    }
  });
});

describe('forcedColorsBlock', () => {
  it('emits @media (forced-colors: active) with system color keywords', () => {
    const css = forcedColorsBlock();
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('CanvasText');
    expect(css).toContain('Highlight');
    expect(css).toContain('forced-color-adjust: none');
  });
});

describe('watchPrefersColorScheme', () => {
  it('returns a no-op cleanup when matchMedia is unavailable', () => {
    const cleanup = watchPrefersColorScheme(() => {});
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('fires once on subscribe and again on change', () => {
    const listeners = new Map<string, (e: MediaQueryListEvent) => void>();
    const mql = {
      matches: false,
      addEventListener: (k: string, fn: (e: MediaQueryListEvent) => void) =>
        listeners.set(k, fn),
      removeEventListener: (k: string) => listeners.delete(k),
    };
    vi.stubGlobal('window', { matchMedia: () => mql });
    const onChange = vi.fn();
    const cleanup = watchPrefersColorScheme(onChange);
    expect(onChange).toHaveBeenCalledWith('light');
    listeners.get('change')!({ matches: true } as MediaQueryListEvent);
    expect(onChange).toHaveBeenCalledWith('dark');
    cleanup();
    expect(listeners.has('change')).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('registerTheme', () => {
  it('produces an Extension that the themeRegistry can resolve', () => {
    const ext = registerTheme(lightTheme);
    const state = PluginState.create({ extensions: [ext] });
    const resolved = themeRegistry.resolve(state, 'light');
    expect(resolved).toBeDefined();
    expect(resolved!.tokens['color.background']).toBe('#ffffff');
  });
});
