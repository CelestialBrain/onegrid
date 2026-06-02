// =============================================================================
// WebGPU compute — CPU oracle vs GPU kernel surface.
// =============================================================================

import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { cpuHashAggSumF32 } from '@onegrid/webgpu';
import {
  packCells,
  packRgba,
  CELL_STRIDE,
  GLYPH_STRIDE,
  MSDF_WGSL,
} from '@onegrid/webgpu-render';
import { Btn, Card, Mono, Output } from '../ui';

export function WebgpuTab(): JSX.Element {
  const [keyCount, setKeyCount] = useState(100);
  const [rowCount, setRowCount] = useState(10_000);
  const [gpuAvailable, setGpuAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const nav = navigator as unknown as { gpu?: unknown };
    setGpuAvailable(!!nav.gpu);
  }, []);

  const { result, durationMs } = useMemo(() => {
    const ks = new Uint32Array(rowCount);
    const vs = new Float32Array(rowCount);
    for (let i = 0; i < rowCount; i++) {
      ks[i] = i % keyCount;
      vs[i] = (i * 0.37) % 1000;
    }
    const t0 = performance.now();
    const out = cpuHashAggSumF32(ks, vs);
    const t1 = performance.now();
    return { result: out, durationMs: t1 - t0 };
  }, [keyCount, rowCount]);

  const sampleCells = useMemo(() => [
    {
      x: 0, y: 0, width: 100, height: 32,
      bgColor: packRgba(0xff, 0xff, 0xff, 0xff),
      fgColor: packRgba(0, 0, 0, 0xff),
      glyphs: [
        { glyphId: 65, penOffset: 0, advance: 12, scale: 1 },
        { glyphId: 66, penOffset: 12, advance: 12, scale: 1 },
      ],
    },
  ], []);
  const packed = useMemo(() => packCells(sampleCells), [sampleCells]);

  return (
    <div>
      <Card title="GPU availability">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>navigator.gpu:</span>
          <Mono>
            {gpuAvailable === null ? '...' : gpuAvailable ? 'present (WebGPU works)' : 'absent (CPU fallback active)'}
          </Mono>
        </div>
      </Card>

      <Card title="cpuHashAggSumF32 — CPU oracle (same shape as the GPU kernel)">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--muted)' }}>
            keys:{' '}
            <select
              value={keyCount}
              onChange={(e) => setKeyCount(Number(e.target.value))}
              style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              {[10, 100, 1000, 10_000].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 11, color: 'var(--muted)' }}>
            rows:{' '}
            <select
              value={rowCount}
              onChange={(e) => setRowCount(Number(e.target.value))}
              style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              {[1_000, 10_000, 100_000, 1_000_000].map((n) => (
                <option key={n} value={n}>{n.toLocaleString()}</option>
              ))}
            </select>
          </label>
          <Mono>{durationMs.toFixed(2)} ms</Mono>
        </div>
        <Output>
{`first 8 buckets (key → sum, count):
  ${Array.from(result.bucketKeys.slice(0, 8)).map((k, i) => `[${i}] key=${k} sum=${(result.bucketSums[i] ?? 0).toFixed(2)} count=${result.bucketCounts[i] ?? 0}`).join('\n  ')}
total non-empty buckets: ${Array.from(result.bucketCounts).filter((v) => v !== 0).length} / ${result.bucketKeys.length}`}
        </Output>
      </Card>

      <Card title="packCells — vertex buffer for the GPU pipeline">
        <Output>
{`CELL_STRIDE = ${CELL_STRIDE} bytes
GLYPH_STRIDE = ${GLYPH_STRIDE} bytes
packed: ${packed.cells.byteLength}-byte cell buffer + ${packed.glyphs.byteLength}-byte glyph buffer
glyph count: ${packed.glyphs.byteLength / GLYPH_STRIDE}`}
        </Output>
      </Card>

      <Card title="MSDF WGSL fragment (first 400 chars)">
        <Output>{MSDF_WGSL.slice(0, 400) + '...'}</Output>
      </Card>
    </div>
  );
}
