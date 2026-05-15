# @onegrid/tokens

oneGrid design tokens — W3C DTCG (Design Tokens Community Group)
Format Module 2025.10 JSON bundles compiled to CSS custom properties
scoped to `[data-og-root]`. Theme switching via `[data-og-theme]`;
density via `[data-og-density]`.

DTCG 2025.10 reached its first stable version on 2025-10-28. The
leaf shape is `{ "$type": "color", "$value": "#hex" }`; nested
objects form groups; `{group.subgroup.leaf}` references resolve as
aliases.

## Quickstart

```ts
import { compileTheme } from '@onegrid/tokens';
import { lightDtcg } from '@onegrid/tokens/themes/light';
import compactDtcg from '@onegrid/tokens/density/compact';

const themeCss = compileTheme(lightDtcg, { themeName: 'light' });
const densityCss = compileTheme(compactDtcg, { densityName: 'compact' });

document.adoptedStyleSheets = [
  new CSSStyleSheet().replaceSync(themeCss),
  new CSSStyleSheet().replaceSync(densityCss),
];
```

Then in your HTML:

```html
<div data-og-root data-og-theme="light" data-og-density="compact">
  <!-- grid mounts here -->
</div>
```

## Built-in bundles

- **Themes** — `@onegrid/tokens/themes/light`, `…/themes/dark`
- **Density** — `…/density/compact`, `…/density/comfortable`,
  `…/density/spacious`

Sub-path imports mean you only ship the bundles you use.

## Token catalog

**~30 color tokens** — bg/bg-alt/text/text-muted/text-inverse, border
+ border-strong, header bg+text, pinned + sticky bg, hover, selection
bg+text, focus ring, scrollbar thumb+track, chevron, detail-panel,
status-bar bg+text, floating-filter, tooltip bg+text, drag-indicator,
validation-error + validation-warning, aggregation, pivot, context-menu.

**~15 density tokens** — row/header/detail heights, font sizes
(base + header), cell padding (x + y), border thickness, chevron /
checkbox / resize-handle sizes, line-height, touch-hit-zone, scrollbar
width, icon size.

Every theme bundle defines every color token; every density bundle
defines every density token. The catalog is exported as
`COLOR_TOKEN_NAMES` / `DENSITY_TOKEN_NAMES` so adopters can verify
their custom bundles cover the full surface.

## Auto color-scheme

```ts
import { watchPrefersColorScheme } from '@onegrid/tokens';

const cleanup = watchPrefersColorScheme((scheme) => {
  document.querySelector('[data-og-root]')!
    .setAttribute('data-og-theme', scheme);
});
// later
cleanup();
```

Safe in non-DOM environments — returns a no-op cleanup when
`matchMedia` is unavailable.

## Forced colors (high contrast)

```ts
import { forcedColorsBlock } from '@onegrid/tokens';

const hcCss = forcedColorsBlock();
// → @media (forced-colors: active) { ... CanvasText, Highlight, ... }
```

Maps oneGrid color tokens to the CSS Color Module Level 4 system
color keywords (`Canvas`, `CanvasText`, `Highlight`, `HighlightText`,
`GrayText`, `LinkText`) when Windows High Contrast Mode is active.
`forced-color-adjust: none` prevents the OS from overriding our
mapping.

## Registering themes via @onegrid/plugin-kit

```ts
import { registerTheme } from '@onegrid/tokens';
import { lightTheme } from '@onegrid/tokens/themes/light';
import { PluginState } from '@onegrid/plugin-kit';

const state = PluginState.create({
  extensions: [registerTheme(lightTheme)],
});
```

Themes registered this way are discoverable by other v0.0.9 plugins —
no DOM coupling, no global registries.

## License

MIT
