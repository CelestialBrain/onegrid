# @onegrid/touch

Touch / mobile interaction surface for oneGrid. 2 KB gz.

- **`bindGestures(target, listener, opts)`** — Pointer-Events-3
  recognizer for `tap`, `doubleTap`, `longPress` (≥500 ms), `pan`,
  `panEnd`, `swipe`, `dragFromEdge`. Cleans up on `pointercancel`.
- **`touchCss(selector?)`** — emits the four-property CSS oneGrid
  expects on the host: `touch-action: manipulation` on tappables,
  `none` on drag affordances, `pan-x pan-y` on the grid body
  reserving pinch for the OS, `overscroll-behavior: contain` to
  prevent scroll-chaining, and a `(pointer: coarse)` block that
  bumps row height + chevron hit-zone to `--og-size-touch-hit-zone`
  so Apple HIG 44pt / Material 48dp is met without forcing
  `density="spacious"` on desktop.
- **`attachVirtualKeyboard(onInset)`** — prefers the VirtualKeyboard
  API (Chromium-only, sets `overlaysContent: true` and listens for
  `geometrychange`); falls back to `visualViewport` resize tracking
  for iOS Safari. Returns a cleanup function.
- **`inputmodeForColumn(type)`** — maps a protocol `ColumnType` to
  the HTML `inputmode` value cell editors should use so the soft
  keyboard surfaces the right glyph set.

## Quickstart

```ts
import {
  bindGestures, touchCss, attachVirtualKeyboard, inputmodeForColumn,
} from '@onegrid/touch';

// CSS — drop once at app boot
document.adoptedStyleSheets.push(
  new CSSStyleSheet().replaceSync(touchCss()),
);

// Gestures
const cleanup = bindGestures(gridBodyEl, (e) => {
  if (e.kind === 'longPress') openContextMenu(e.x, e.y);
  if (e.kind === 'dragFromEdge' && e.edge === 'left') startRowSelectDrag(e);
});

// Virtual keyboard inset for sticky footers
attachVirtualKeyboard((inset) => {
  document.documentElement.style.setProperty('--og-vk-inset', `${inset}px`);
});

// Cell editor — let the soft keyboard help
<input inputmode={inputmodeForColumn('float64')} />  // 'decimal'
```

## Defaults

`DEFAULT_LONG_PRESS_ACTION` is `'context-menu'` — matches Android
+ iOS platform conventions. Opt-in `'row-drag'` for
spreadsheet-style apps where long-press should pick up the row.

## Standards

- W3C Pointer Events Level 3 (https://www.w3.org/TR/pointerevents3/)
- CSS `touch-action` (CSS Pointer Events 2)
- CSS `overscroll-behavior` (CSS Overscroll Behavior Module 1)
- VirtualKeyboard API (https://www.w3.org/TR/virtual-keyboard/)
- HTML `inputmode` (HTML Living Standard)

## License

MIT
