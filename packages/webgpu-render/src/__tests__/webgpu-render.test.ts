import { describe, it, expect } from 'vitest';
import {
  packCells,
  packRgba,
  CELL_STRIDE,
  GLYPH_STRIDE,
  lookupGlyph,
  screenPxRange,
  MSDF_WGSL,
  type MsdfAtlas,
  type CellPackInput,
} from '../index.js';

describe('packRgba', () => {
  it('packs RGBA into 32 bits in the documented order', () => {
    const packed = packRgba(0xff, 0x80, 0x40, 0xc0);
    // Stored as 0xRRGGBBAA
    expect(packed).toBe(0xff8040c0);
  });

  it('clamps components to 8 bits', () => {
    const packed = packRgba(0x1ff, 0, 0, 0);
    expect(packed).toBe(0xff000000);
  });
});

describe('packCells', () => {
  function makeCell(x = 0, glyphs: CellPackInput['glyphs'] = []): CellPackInput {
    return {
      x,
      y: 0,
      width: 100,
      height: 32,
      bgColor: packRgba(0xff, 0xff, 0xff, 0xff),
      fgColor: packRgba(0, 0, 0, 0xff),
      glyphs,
    };
  }

  it('emits CELL_STRIDE bytes per cell', () => {
    const buffers = packCells([makeCell(), makeCell(100), makeCell(200)]);
    expect(buffers.cells.byteLength).toBe(CELL_STRIDE * 3);
    expect(buffers.cellCount).toBe(3);
  });

  it('writes top-left position at the documented offsets', () => {
    const buffers = packCells([makeCell(42)]);
    const view = new DataView(buffers.cells);
    expect(view.getFloat32(0, true)).toBe(42);   // x_top_left
    expect(view.getFloat32(4, true)).toBe(0);    // y_top_left
    expect(view.getFloat32(8, true)).toBe(100);  // width
    expect(view.getFloat32(12, true)).toBe(32);  // height
  });

  it('packs glyphs into the secondary buffer at GLYPH_STRIDE bytes each', () => {
    const buffers = packCells([
      makeCell(0, [
        { glyphId: 65, penOffset: 0, advance: 10, scale: 1 },
        { glyphId: 66, penOffset: 10, advance: 10, scale: 1 },
        { glyphId: 67, penOffset: 20, advance: 10, scale: 1 },
      ]),
    ]);
    expect(buffers.glyphs.byteLength).toBe(GLYPH_STRIDE * 3);
    expect(buffers.glyphCount).toBe(3);
    const gview = new DataView(buffers.glyphs);
    expect(gview.getUint32(0, true)).toBe(65);
    expect(gview.getUint32(GLYPH_STRIDE, true)).toBe(66);
    expect(gview.getUint32(GLYPH_STRIDE * 2, true)).toBe(67);
  });

  it('writes correct glyph_atlas_start indices into adjacent cells', () => {
    const buffers = packCells([
      makeCell(0, [
        { glyphId: 65, penOffset: 0, advance: 8, scale: 1 },
        { glyphId: 66, penOffset: 8, advance: 8, scale: 1 },
      ]),
      makeCell(100, [
        { glyphId: 67, penOffset: 0, advance: 8, scale: 1 },
      ]),
    ]);
    const view = new DataView(buffers.cells);
    // First cell's glyph_atlas_start should be 0; second's should be 2.
    expect(view.getUint32(24, true)).toBe(0);
    expect(view.getUint32(28, true)).toBe(2); // first cell's glyph_count
    expect(view.getUint32(CELL_STRIDE + 24, true)).toBe(2);
    expect(view.getUint32(CELL_STRIDE + 28, true)).toBe(1);
  });

  it('handles cells with zero glyphs', () => {
    const buffers = packCells([makeCell()]);
    expect(buffers.glyphCount).toBe(0);
    expect(buffers.glyphs.byteLength).toBe(0);
  });
});

describe('MSDF atlas lookup', () => {
  const atlas: MsdfAtlas = {
    info: { face: 'Inter', size: 32, distanceRange: 4 },
    common: { scaleW: 512, scaleH: 512, lineHeight: 40, base: 28 },
    chars: [
      { id: 65, x: 0, y: 0, width: 30, height: 32, xoffset: 0, yoffset: 0, xadvance: 32 },
      { id: 66, x: 30, y: 0, width: 28, height: 32, xoffset: 0, yoffset: 0, xadvance: 30 },
    ],
  };

  it('resolves a known code point', () => {
    expect(lookupGlyph(atlas, 65)?.xadvance).toBe(32);
  });

  it('returns undefined for an unknown code point', () => {
    expect(lookupGlyph(atlas, 9999)).toBeUndefined();
  });
});

describe('screenPxRange', () => {
  it('scales the baked distance range by the on-screen EM ratio', () => {
    const atlas: MsdfAtlas = {
      info: { face: 'F', size: 32, distanceRange: 4 },
      common: { scaleW: 0, scaleH: 0, lineHeight: 0, base: 0 },
      chars: [],
    };
    // Screen EM = 16 px → ratio = 16/32 = 0.5 → 4 * 0.5 = 2
    expect(screenPxRange(atlas, 16)).toBe(2);
    // Screen EM = 64 px → ratio = 2 → 4 * 2 = 8
    expect(screenPxRange(atlas, 64)).toBe(8);
  });
});

describe('MSDF_WGSL', () => {
  it('exports a non-empty WGSL snippet defining the median + alpha helpers', () => {
    expect(MSDF_WGSL).toContain('msdf_median');
    expect(MSDF_WGSL).toContain('msdf_distance');
    expect(MSDF_WGSL).toContain('msdf_alpha');
  });
});
