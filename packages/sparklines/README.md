# @onegrid/sparklines

In-cell sparklines for oneGrid — line / bar / win-loss charts drawn
straight to the grid's canvas. No deps; ~1 KB gz.

## Three chart kinds

- **`line`** — continuous line through the data points. Optional
  area fill, extrema dots, caller-supplied y-domain.
- **`bar`** — column chart. Positive bars use `color`, negative use
  `negativeColor`; baseline is zero when the domain crosses zero
  (otherwise the min).
- **`winloss`** — top-half lollipops for `+`, bottom-half for `-`,
  zeros skipped.

## Quickstart — drop into a cell renderer

```ts
import { createSparklineRenderer } from '@onegrid/sparklines';

const trendRenderer = createSparklineRenderer<MyRow>({
  kind: 'line',
  getData: (row) => row.history, // number[]
  options: {
    area: true,
    highlightExtrema: true,
  },
});

const columns = [
  // ...
  {
    id: 'trend',
    width: 120,
    renderer: trendRenderer, // grid calls .paint(ctx, rect, row)
  },
];
```

## Direct call

```ts
import { drawSparkline } from '@onegrid/sparklines';

drawSparkline(ctx, { x: 10, y: 4, width: 100, height: 24 }, [3, 5, 2, 8, 6], 'line', {
  color: '#0969da',
  area: true,
  highlightExtrema: true,
});
```

## Options

| Option              | Default       | Meaning                                                 |
| ------------------- | ------------- | ------------------------------------------------------- |
| `color`             | `'#0969da'`   | Stroke (line); positive fill (bar/winloss)              |
| `negativeColor`     | `'#cf222e'`   | Negative fill (bar/winloss)                             |
| `background`        | transparent   | Cell background                                         |
| `lineWidth`         | `1`           | Line stroke width                                       |
| `area`              | `false`       | Area fill under line                                    |
| `areaColor`         | derived       | Override the area fill (defaults to `color` at α 0.18)  |
| `highlightExtrema`  | `false`       | Dot at min + max                                        |
| `minColor`/`maxColor` | `negativeColor`/`color` | Override extrema dots                       |
| `domain`            | fit to data   | `[min, max]` — fix so multiple sparklines are comparable |
| `padding`           | `1`           | Inner padding in px                                     |
| `barGap`            | `1`           | Bar gap (bar only)                                      |

## License

MIT
