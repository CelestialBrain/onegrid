// =============================================================================
// @onegrid/sparklines
//
// In-cell sparkline renderer. Three chart shapes — line, bar, win-loss —
// drawn straight to a Canvas2D context the grid's renderer already owns.
// No dependencies; pure functions; ~1 KB gz.
//
// Numeric ranges and per-bar coloring are computed inline so the same call
// works for a one-shot cell render or a batched per-row pass.
// =============================================================================

export type SparklineKind = 'line' | 'bar' | 'winloss';

export interface SparklineOptions {
  /** Stroke color for line; positive fill for bar/winloss. Default '#0969da'. */
  readonly color?: string;
  /** Negative fill for bar/winloss. Default '#cf222e'. */
  readonly negativeColor?: string;
  /** Background fill — drawn under the chart. Default transparent. */
  readonly background?: string;
  /** Stroke width (line). Default 1. */
  readonly lineWidth?: number;
  /**
   * Fill the area under the line. Default false. Uses `color` at 0.18
   * alpha derived from the source color (caller passes pre-composed
   * `areaColor` if it doesn't trust our naive RGBA tweak).
   */
  readonly area?: boolean;
  readonly areaColor?: string;
  /** Highlight min/max with dots. Default false. */
  readonly highlightExtrema?: boolean;
  /** Min dot color. Default `negativeColor`. */
  readonly minColor?: string;
  /** Max dot color. Default `color`. */
  readonly maxColor?: string;
  /**
   * Override the data domain. When omitted, range is fit to the data
   * with a small margin. Passing a fixed [min, max] (e.g. [0, 100])
   * makes multiple sparklines visually comparable.
   */
  readonly domain?: readonly [number, number];
  /** Inner padding in px from the bounding rect. Default 1. */
  readonly padding?: number;
  /** For 'bar' only: gap between bars in px. Default 1. */
  readonly barGap?: number;
}

export interface SparklineRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const DEFAULTS = {
  color: '#0969da',
  negativeColor: '#cf222e',
  lineWidth: 1,
  padding: 1,
  barGap: 1,
} as const;

interface MinimalCtx {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
}

/**
 * Draw a sparkline into the given rect. The chart is clamped to the
 * inner area (rect minus padding). Pass `kind: 'line'` for a continuous
 * line, `'bar'` for a column chart, `'winloss'` for +1/-1 lollipops.
 */
export function drawSparkline(
  ctx: MinimalCtx,
  rect: SparklineRect,
  data: ReadonlyArray<number>,
  kind: SparklineKind = 'line',
  opts: SparklineOptions = {},
): void {
  if (data.length === 0) return;
  const pad = opts.padding ?? DEFAULTS.padding;
  const innerX = rect.x + pad;
  const innerY = rect.y + pad;
  const innerW = Math.max(0, rect.width - 2 * pad);
  const innerH = Math.max(0, rect.height - 2 * pad);
  if (innerW <= 0 || innerH <= 0) return;

  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  const color = opts.color ?? DEFAULTS.color;
  const neg = opts.negativeColor ?? DEFAULTS.negativeColor;
  ctx.lineWidth = opts.lineWidth ?? DEFAULTS.lineWidth;

  if (kind === 'winloss') {
    drawWinLoss(ctx, innerX, innerY, innerW, innerH, data, color, neg);
    return;
  }

  let domainMin: number;
  let domainMax: number;
  if (opts.domain) {
    [domainMin, domainMax] = opts.domain;
  } else {
    domainMin = Infinity;
    domainMax = -Infinity;
    for (const v of data) {
      if (v < domainMin) domainMin = v;
      if (v > domainMax) domainMax = v;
    }
  }
  if (!Number.isFinite(domainMin) || !Number.isFinite(domainMax)) return;
  const range = domainMax - domainMin || 1;

  if (kind === 'bar') {
    drawBars(ctx, innerX, innerY, innerW, innerH, data, domainMin, range, color, neg, opts);
    return;
  }
  drawLine(ctx, innerX, innerY, innerW, innerH, data, domainMin, range, color, opts);
}

function drawLine(
  ctx: MinimalCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  data: ReadonlyArray<number>,
  domainMin: number,
  range: number,
  color: string,
  opts: SparklineOptions,
): void {
  const stepX = data.length > 1 ? w / (data.length - 1) : 0;
  const pointAt = (i: number): { x: number; y: number } => ({
    x: x + i * stepX,
    y: y + h - ((data[i]! - domainMin) / range) * h,
  });

  if (opts.area) {
    ctx.fillStyle = opts.areaColor ?? withAlpha(color, 0.18);
    ctx.beginPath();
    const p0 = pointAt(0);
    ctx.moveTo(p0.x, y + h);
    for (let i = 0; i < data.length; i++) {
      const p = pointAt(i);
      ctx.lineTo(p.x, p.y);
    }
    const pn = pointAt(data.length - 1);
    ctx.lineTo(pn.x, y + h);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = color;
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const p = pointAt(i);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  if (opts.highlightExtrema) {
    let iMin = 0;
    let iMax = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i]! < data[iMin]!) iMin = i;
      if (data[i]! > data[iMax]!) iMax = i;
    }
    const min = pointAt(iMin);
    const max = pointAt(iMax);
    drawDot(ctx, min.x, min.y, opts.minColor ?? opts.negativeColor ?? DEFAULTS.negativeColor);
    drawDot(ctx, max.x, max.y, opts.maxColor ?? color);
  }
}

function drawBars(
  ctx: MinimalCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  data: ReadonlyArray<number>,
  domainMin: number,
  range: number,
  color: string,
  neg: string,
  opts: SparklineOptions,
): void {
  const gap = opts.barGap ?? DEFAULTS.barGap;
  const totalGap = gap * Math.max(0, data.length - 1);
  const barW = Math.max(1, (w - totalGap) / data.length);
  // Baseline at zero if the domain crosses zero; else at the min.
  const baselineV = domainMin <= 0 && domainMin + range >= 0 ? 0 : domainMin;
  const baselineY = y + h - ((baselineV - domainMin) / range) * h;
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    const px = x + i * (barW + gap);
    const py = y + h - ((v - domainMin) / range) * h;
    ctx.fillStyle = v >= baselineV ? color : neg;
    if (py < baselineY) ctx.fillRect(px, py, barW, baselineY - py);
    else ctx.fillRect(px, baselineY, barW, py - baselineY);
  }
}

function drawWinLoss(
  ctx: MinimalCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  data: ReadonlyArray<number>,
  color: string,
  neg: string,
): void {
  const gap = 1;
  const barW = Math.max(1, (w - gap * Math.max(0, data.length - 1)) / data.length);
  const half = h / 2;
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    if (v === 0) continue;
    const px = x + i * (barW + gap);
    ctx.fillStyle = v > 0 ? color : neg;
    if (v > 0) ctx.fillRect(px, y + half * 0.4, barW, half * 0.6);
    else ctx.fillRect(px, y + half, barW, half * 0.6);
  }
}

function drawDot(
  ctx: MinimalCtx,
  cx: number,
  cy: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

function withAlpha(hex: string, alpha: number): string {
  // Naive: append two-digit alpha to a 6-digit hex. Caller passes
  // pre-composed `areaColor` if they need rgba()/hsla()/named colors.
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
    return `${hex}${a}`;
  }
  return hex;
}

// -----------------------------------------------------------------------------
// Cell renderer factory — drop straight into a ColumnDef.renderer slot.
//
// Usage:
//   const renderer = createSparklineRenderer({
//     kind: 'line',
//     getData: (row) => row.history as number[],
//     options: { highlightExtrema: true, area: true },
//   });
// -----------------------------------------------------------------------------

export interface SparklineRendererInput<T = unknown> {
  readonly kind?: SparklineKind;
  readonly getData: (row: T) => ReadonlyArray<number>;
  readonly options?: SparklineOptions;
}

export interface SparklineRenderResult {
  /** Call with a canvas context + cell rect to paint the sparkline. */
  readonly paint: (ctx: MinimalCtx, rect: SparklineRect, row: unknown) => void;
}

export function createSparklineRenderer<T>(
  input: SparklineRendererInput<T>,
): SparklineRenderResult {
  return {
    paint: (ctx, rect, row) =>
      drawSparkline(ctx, rect, input.getData(row as T), input.kind ?? 'line', input.options ?? {}),
  };
}
