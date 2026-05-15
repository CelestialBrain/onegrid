# @onegrid/intl

oneGrid i18n / l10n / RTL surface. Three layers:

1. **`Intl.*` thin wrappers** — `formatNumber`, `formatDate`,
   `formatRelative`, `formatList`, `getCollator`. Each cached by
   `(locale, options)` because constructing `Intl.NumberFormat` is
   non-trivial and grids re-format the same column thousands of
   times per scroll.
2. **ICU MessageFormat (subset)** — `t(messageId, params, locale)`.
   Implements substitution + plural + select inline (no FormatJS
   dependency). Drop in `@formatjs/intl-messageformat` yourself if
   you need nested formats or rich-text elements.
3. **RTL helpers** — `getRtlAwareScrollLeft` abstracts the three
   engine-version conventions for RTL `scrollLeft`; a BCP 47
   validator (`canonicalizeLocale`, `isValidLocale`) backed by
   `Intl.Locale`.

## Quickstart

```ts
import {
  formatNumber, formatDate, formatRelative,
  parseLocalizedNumber, t, loadCatalog, registerCatalog,
} from '@onegrid/intl';

formatNumber(1234.5, 'de-DE');           // '1.234,5'
parseLocalizedNumber('1.234,5', 'de-DE'); // 1234.5

formatRelative(-1, 'day', 'en-US', { numeric: 'auto' });
// 'yesterday'

loadCatalog({
  locale: 'en',
  messages: {
    'state.empty': 'No data',
    'group.footerCount':
      '{count, plural, =0 {no items} one {# item} other {# items}}',
  },
});

t('group.footerCount', { count: 5 }, 'en');  // '5 items'
```

## ICU MessageFormat (subset)

Supported syntax:

```
Hello, {name}!
{count, plural, =0 {none} one {# item} other {# items}}
{gender, select, male {him} female {her} other {them}}
```

- `#` inside a plural arm substitutes the formatted count
- Plural keyword set comes from `Intl.PluralRules`
- Regional locale falls back to its primary subtag (`en-US` → `en`)
- Unknown message ids fall through (the id itself is returned)

Nested format types (`{date, date, short}`, `{n, number, ::compact-short}`)
are NOT supported in the inline parser. Wire up FormatJS yourself
if you need them — `formatTemplate` is exported as a stand-alone
hook point.

## RTL

```ts
import { getRtlAwareScrollLeft } from '@onegrid/intl';

const logical = getRtlAwareScrollLeft(gridEl);
// Always returns the "distance scrolled from the start of content",
// regardless of whether the browser uses negative-RTL (modern Chrome /
// Firefox) or reverse-RTL (legacy Webkit).
```

Pair with CSS logical properties (`inset-inline-start`,
`margin-inline-end`, `padding-inline`) throughout your styles
so RTL is a one-line `dir="rtl"` flip at the host level.

## Translation surface

`TRANSLATION_IDS` is the full enumerable list of every message id
oneGrid emits. Use it to gate your custom catalog in tests:

```ts
import { TRANSLATION_IDS } from '@onegrid/intl';

for (const id of TRANSLATION_IDS) {
  expect(myCatalog[id], `missing translation: ${id}`).toBeDefined();
}
```

Covers chevron labels, empty / loading / error states, validation
messages, context-menu items, column-tool panel, row-group footers,
8 aggregation function names, 13 filter operator names, status bar
labels, floating-filter placeholders, drag-drop indicators,
pagination, tooltip help, detail panel, 12 month names + 7 weekday
names + AM/PM, currency.

## Registering catalogs via plugin-kit

```ts
import { registerCatalog } from '@onegrid/intl';
import { PluginState } from '@onegrid/plugin-kit';

const state = PluginState.create({
  extensions: [
    registerCatalog({ locale: 'en', messages: { /* … */ } }),
    registerCatalog({ locale: 'es', messages: { /* … */ } }),
  ],
});
```

Catalogs registered this way are discoverable by other v0.0.9
plugins — formula functions, aggregators, filter operators — so
their human-readable labels participate in translation without
each feature wiring up its own registry.

## License

MIT
