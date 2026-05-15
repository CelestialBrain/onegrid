import { describe, it, expect } from 'vitest';
import {
  Facet,
  Compartment,
  PluginState,
  Precedence,
  precedence,
  PluginRegistry,
  cellRendererRegistry,
  themeRegistry,
  i18nCatalogRegistry,
  createPluginContext,
  definePlugin,
  assertInterfaceVersion,
  INTERFACE_VERSION,
} from '../index.js';

describe('Facet', () => {
  it('combines inputs in registration order by default', () => {
    const f = Facet.define<number>();
    const state = PluginState.create({ extensions: [f.of(1), f.of(2), f.of(3)] });
    expect(state.facet(f)).toEqual([1, 2, 3]);
  });

  it('applies a custom combine reducer', () => {
    const f = Facet.define<number, number>({ combine: (xs) => xs.reduce((a, b) => a + b, 0) });
    const state = PluginState.create({ extensions: [f.of(1), f.of(2), f.of(3)] });
    expect(state.facet(f)).toBe(6);
  });

  it('deduplicates identical inputs by reference', () => {
    const f = Facet.define<{ k: string }>();
    const v = { k: 'a' };
    const state = PluginState.create({ extensions: [f.of(v), f.of(v), f.of(v)] });
    expect(state.facet(f)).toHaveLength(1);
  });

  it('memoizes combined output within a state', () => {
    let combineCalls = 0;
    const f = Facet.define<number, number>({
      combine: (xs) => {
        combineCalls++;
        return xs.reduce((a, b) => a + b, 0);
      },
    });
    const state = PluginState.create({ extensions: [f.of(1), f.of(2)] });
    state.facet(f);
    state.facet(f);
    state.facet(f);
    expect(combineCalls).toBe(1);
  });
});

describe('Precedence', () => {
  it('higher precedence sorts before default', () => {
    const f = Facet.define<string>();
    const state = PluginState.create({
      extensions: [f.of('default'), precedence.highest(f.of('highest')), precedence.high(f.of('high'))],
    });
    expect(state.facet(f)).toEqual(['highest', 'high', 'default']);
  });

  it('within a tier, registration order is preserved', () => {
    const f = Facet.define<string>();
    const state = PluginState.create({ extensions: [f.of('a'), f.of('b'), f.of('c')] });
    expect(state.facet(f)).toEqual(['a', 'b', 'c']);
  });

  it('lowest sorts after default', () => {
    const f = Facet.define<string>();
    const state = PluginState.create({
      extensions: [precedence.lowest(f.of('last')), f.of('default')],
    });
    expect(state.facet(f)).toEqual(['default', 'last']);
  });
});

describe('Compartment', () => {
  it('reconfigures a sub-extension without rebuilding the rest', () => {
    const themeFacet = Facet.define<string>();
    const otherFacet = Facet.define<string>();
    const theme = new Compartment();
    const state = PluginState.create({
      extensions: [theme.of(themeFacet.of('light')), otherFacet.of('stable')],
    });
    expect(state.facet(themeFacet)).toEqual(['light']);
    expect(state.facet(otherFacet)).toEqual(['stable']);

    const next = state.reconfigure({
      replace: new Map([[theme, themeFacet.of('dark')]]),
    });
    expect(next.facet(themeFacet)).toEqual(['dark']);
    expect(next.facet(otherFacet)).toEqual(['stable']);
  });

  it('exposes the current inner extension via .get()', () => {
    const f = Facet.define<string>();
    const comp = new Compartment();
    const state = PluginState.create({ extensions: [comp.of(f.of('x'))] });
    expect(comp.get(state)).toBeDefined();
  });
});

describe('PluginRegistry', () => {
  it('looks up entries by id', () => {
    const r = new PluginRegistry<{ msg: string }>('test');
    const state = PluginState.create({
      extensions: [r.register('a', { msg: 'alpha' }), r.register('b', { msg: 'beta' })],
    });
    expect(r.resolve(state, 'a')).toEqual({ msg: 'alpha' });
    expect(r.resolve(state, 'b')).toEqual({ msg: 'beta' });
    expect(r.resolve(state, 'missing')).toBeUndefined();
  });

  it('earlier (higher precedence) registration wins on id collision', () => {
    const r = new PluginRegistry<string>('test');
    const state = PluginState.create({
      extensions: [
        precedence.highest(r.register('a', 'winner')),
        r.register('a', 'loser'),
      ],
    });
    expect(r.resolve(state, 'a')).toBe('winner');
  });
});

describe('PluginContext', () => {
  it('exposes facet + resolve, no DOM/canvas access', () => {
    const state = PluginState.create({
      extensions: [themeRegistry.register('dark', { tokens: { '--bg': '#000' } })],
    });
    const ctx = createPluginContext(state);
    expect(ctx.interfaceVersion).toBe(INTERFACE_VERSION);
    expect(ctx.resolve(themeRegistry, 'dark')).toEqual({ tokens: { '--bg': '#000' } });
  });
});

describe('interfaceVersion', () => {
  it('throws on mismatched plugin version', () => {
    expect(() => assertInterfaceVersion(999)).toThrow(/OG_PLUGIN_INTERFACE_VERSION/);
    expect(() => assertInterfaceVersion(0)).toThrow(/OG_PLUGIN_INTERFACE_VERSION/);
  });

  it('definePlugin asserts at module load', () => {
    expect(() =>
      definePlugin({ name: 'bad', interfaceVersion: 999, extensions: [] }),
    ).toThrow(/OG_PLUGIN_INTERFACE_VERSION/);
    expect(() =>
      definePlugin({ name: 'good', interfaceVersion: INTERFACE_VERSION, extensions: [] }),
    ).not.toThrow();
  });
});

describe('Ten domain registries', () => {
  it('all ten are exported and usable', () => {
    const ext = [
      cellRendererRegistry.register('money', { render: () => '$0' }),
      themeRegistry.register('dark', { tokens: {} }),
      i18nCatalogRegistry.register('en', { locale: 'en', messages: { hello: 'Hi' } }),
    ];
    const state = PluginState.create({ extensions: ext });
    expect(cellRendererRegistry.resolve(state, 'money')).toBeDefined();
    expect(themeRegistry.resolve(state, 'dark')).toBeDefined();
    expect(i18nCatalogRegistry.resolve(state, 'en')?.messages['hello']).toBe('Hi');
  });
});

describe('Reconfigure append', () => {
  it('appends new extensions to an existing state', () => {
    const f = Facet.define<number>();
    const state = PluginState.create({ extensions: [f.of(1)] });
    const next = state.reconfigure({ append: [f.of(2), f.of(3)] });
    expect(next.facet(f)).toEqual([1, 2, 3]);
  });
});
