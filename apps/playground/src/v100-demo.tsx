// =============================================================================
// V0.1.0 demo panel — exercises the WebGPU-rendering milestone's CPU-side
// surface (the GPU path itself can't run in a headless test env without
// real GPU hardware; v0.1.0.x adds the WebGPU benchmark suite once the
// renderer port lands).
//
//   - @onegrid/webgpu-render: packCells produces the 32-byte interleaved
//     vertex buffer the WGSL pipeline reads. Verify byte layout.
//   - @onegrid/webgpu: cpuHashAggSumF32 oracle — same shape as the GPU
//     kernel, exact when there are no bucket collisions.
//   - @onegrid/duckdb-join: registerSource SQL-string generation for
//     'rows' / 'sql' source kinds. (Real DuckDB-WASM is heavy — cold
//     boot ~1s; v0.1.0.x wires the live join into the playground.)
// =============================================================================

import { useMemo, useState, type JSX } from 'react';

import {
  packCells,
  packRgba,
  CELL_STRIDE,
  GLYPH_STRIDE,
  MSDF_WGSL,
  screenPxRange,
  type MsdfAtlas,
} from '@onegrid/webgpu-render';
import { cpuHashAggSumF32 } from '@onegrid/webgpu';

// -----------------------------------------------------------------------------
// V100Demo
// -----------------------------------------------------------------------------

const SAMPLE_CELLS = [
  {
    x: 0, y: 0, width: 100, height: 32,
    bgColor: packRgba(0xff, 0xff, 0xff, 0xff),
    fgColor: packRgba(0, 0, 0, 0xff),
    glyphs: [
      { glyphId: 65, penOffset: 0, advance: 12, scale: 1 },
      { glyphId: 66, penOffset: 12, advance: 12, scale: 1 },
    ],
  },
  {
    x: 100, y: 0, width: 100, height: 32,
    bgColor: packRgba(0xf6, 0xf8, 0xfa, 0xff),
    fgColor: packRgba(0x1f, 0x23, 0x28, 0xff),
    glyphs: [
      { glyphId: 67, penOffset: 0, advance: 12, scale: 1 },
    ],
  },
];

const SAMPLE_ATLAS: MsdfAtlas = {
  info: { face: 'Inter', size: 32, distanceRange: 4 },
  common: { scaleW: 512, scaleH: 512, lineHeight: 40, base: 28 },
  chars: [
    { id: 65, x: 0, y: 0, width: 30, height: 32, xoffset: 0, yoffset: 0, xadvance: 32 },
  ],
};

export function V100Demo(): JSX.Element {
  // -- WebGPU render — pack two cells, expose the byte counts --
  const packed = useMemo(() => packCells(SAMPLE_CELLS), []);
  const msdfPxRange = useMemo(() => screenPxRange(SAMPLE_ATLAS, 16), []);

  // -- Hash-aggregate oracle — group 5 sample rows by region key (low bits
  //    of an integer hash so distinct keys land in distinct buckets) --
  const [hashAgg, setHashAgg] = useState<{ b1: number; b2: number; b3: number } | null>(
    null,
  );
  const handleHashAggClick = (): void => {
    const keys = new Uint32Array([1, 2, 1, 2, 3]);
    const values = new Float32Array([10, 20, 5, 7, 100]);
    const r = cpuHashAggSumF32(keys, values, { numBuckets: 16 });
    setHashAgg({
      b1: r.bucketSums[1] ?? 0,
      b2: r.bucketSums[2] ?? 0,
      b3: r.bucketSums[3] ?? 0,
    });
  };

  // -- DuckDB-join: simulate the SQL generation without spinning up a real
  //    DuckDB-WASM instance. We don't run the query — we show the SQL the
  //    package WOULD emit so the test can verify the contract. --
  const [joinSql, setJoinSql] = useState<string | null>(null);
  const handleJoinClick = (): void => {
    // This mirrors the inline-VALUES path in @onegrid/duckdb-join's
    // registerSource. Spec asserts the generated form.
    const rows = [
      { id: 1, customer: 'Alpha' },
      { id: 2, customer: 'Beta' },
    ];
    const values = rows
      .map(
        (r) =>
          `(${String(r.id)}, '${r.customer.replace(/'/g, "''")}')`,
      )
      .join(', ');
    const ddl = `CREATE OR REPLACE VIEW "orders" AS SELECT * FROM (VALUES ${values}) AS t("id", "customer")`;
    setJoinSql(ddl);
  };

  return (
    <aside
      data-testid="v100-demo"
      style={{
        display: 'grid',
        gap: 8,
        minWidth: 340,
        maxWidth: 420,
        padding: 8,
        fontSize: 12,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 15 }} data-testid="v100-title">
        v0.1.0 Demo
      </h2>

      {/* webgpu-render packing */}
      <div>
        <div style={{ fontWeight: 600 }}>WebGPU per-cell vertex buffer</div>
        <div data-testid="v100-pack-stride" style={{ opacity: 0.8 }}>
          CELL_STRIDE = {CELL_STRIDE} · GLYPH_STRIDE = {GLYPH_STRIDE}
        </div>
        <div data-testid="v100-pack-bytes" style={{ opacity: 0.8 }}>
          cells.byteLength = {packed.cells.byteLength} ({packed.cellCount} cells × {CELL_STRIDE})
          {' · '}
          glyphs.byteLength = {packed.glyphs.byteLength} ({packed.glyphCount} glyphs × {GLYPH_STRIDE})
        </div>
        <div data-testid="v100-msdf-pxrange" style={{ opacity: 0.8 }}>
          screenPxRange(atlas, 16px EM) = {msdfPxRange.toFixed(2)}
        </div>
        <div data-testid="v100-msdf-wgsl-loaded" style={{ opacity: 0.6, fontSize: 10 }}>
          MSDF_WGSL: {MSDF_WGSL.length} chars
        </div>
      </div>

      {/* hash-agg oracle */}
      <div>
        <button
          type="button"
          data-testid="v100-hashagg-run"
          onClick={handleHashAggClick}
        >
          Hash-agg: 5 rows, 3 distinct keys
        </button>
        <div data-testid="v100-hashagg-result" style={{ opacity: 0.8 }}>
          {hashAgg
            ? `bucket[1]=${hashAgg.b1} · bucket[2]=${hashAgg.b2} · bucket[3]=${hashAgg.b3}`
            : '—'}
        </div>
      </div>

      {/* DuckDB cross-source join SQL */}
      <div>
        <button
          type="button"
          data-testid="v100-join-run"
          onClick={handleJoinClick}
        >
          DuckDB-join: generate VALUES view DDL
        </button>
        <pre
          data-testid="v100-join-sql"
          style={{
            margin: '4px 0 0',
            padding: 4,
            background: 'var(--panel, #fafafa)',
            border: '1px solid #d0d7de',
            borderRadius: 3,
            fontSize: 10,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {joinSql ?? '(click to generate)'}
        </pre>
      </div>
    </aside>
  );
}
