// =============================================================================
// Per-cell vertex buffer protocol (v0.1.0 item 3)
//
// The canvas renderer paints one ctx.fillRect + ctx.fillText per cell. The
// WebGPU renderer instead packs every visible cell into a single interleaved
// Float32 vertex buffer, then issues ONE draw call per frame. Cells become
// instances; the vertex shader reads the per-instance attributes and emits
// a quad.
//
// Layout (8 floats × 4 bytes = 32 bytes per cell instance):
//
//   offset  attribute            kind     notes
//     0     x_top_left           f32      viewport-space pixel
//     4     y_top_left           f32      viewport-space pixel
//     8     width                f32
//    12     height               f32
//    16     bg_color (rgba)      f32×1    packed u32 reinterpreted as f32
//    20     fg_color (rgba)      f32×1    packed u32 reinterpreted as f32
//    24     glyph_atlas_start    u32      index into glyph-run buffer
//    28     glyph_count          u32      number of glyphs in the run
//
// Text is stored in a SECOND buffer (the "glyph run buffer") indexed via
// glyph_atlas_start/glyph_count. Each glyph in the run is 4 floats:
//
//   offset  attribute            kind     notes
//     0     glyph_id             u32      atlas page index
//     4     pen_x_offset         f32      relative to cell's x_top_left
//     8     advance              f32      horizontal advance
//    12     scale                f32      glyph EM-scale factor
//
// This separation lets a 5-character cell pay ~16 bytes/glyph instead of
// duplicating the cell rect for every glyph.
//
// The format is INTENTIONALLY flat + indexed so the GPU sort/filter
// kernels (v0.1.0 item 5) can stream cells through without going via the
// CPU. v0.1.0 ships the protocol + a CPU-side packer; the WGSL vertex
// shader for the canvas→WebGPU migration lands in v0.1.0.x.
// =============================================================================

/** Bytes per cell instance — keep in sync with the WGSL `Cell` struct. */
export const CELL_STRIDE = 32;
/** Bytes per glyph in the glyph-run buffer. */
export const GLYPH_STRIDE = 16;

export interface CellPackInput {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Packed 0xRRGGBBAA. */
  readonly bgColor: number;
  readonly fgColor: number;
  /** Glyph indices into the atlas (one per character). */
  readonly glyphs: ReadonlyArray<{
    readonly glyphId: number;
    readonly penOffset: number;
    readonly advance: number;
    readonly scale: number;
  }>;
}

export interface PackedCellBuffers {
  /** Interleaved per-cell vertex data (CELL_STRIDE bytes × cell count). */
  readonly cells: ArrayBuffer;
  /** Glyph run buffer (GLYPH_STRIDE bytes × total glyph count). */
  readonly glyphs: ArrayBuffer;
  readonly cellCount: number;
  readonly glyphCount: number;
}

/**
 * Pack a list of cells into the two-buffer layout. Returns ArrayBuffers
 * suitable for `device.createBuffer({ usage: VERTEX | STORAGE })`.
 *
 * Color values are written as u32 (interpreted as f32 via reinterpret-
 * cast in the shader). The vertex shader unpacks back to a vec4<f32> via
 * standard bitwise extraction.
 */
export function packCells(cells: ReadonlyArray<CellPackInput>): PackedCellBuffers {
  let totalGlyphs = 0;
  for (const c of cells) totalGlyphs += c.glyphs.length;

  const cellBuf = new ArrayBuffer(CELL_STRIDE * cells.length);
  const cellView = new DataView(cellBuf);
  const glyphBuf = new ArrayBuffer(GLYPH_STRIDE * totalGlyphs);
  const glyphView = new DataView(glyphBuf);

  let glyphOffset = 0;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    const o = i * CELL_STRIDE;
    cellView.setFloat32(o + 0, c.x, true);
    cellView.setFloat32(o + 4, c.y, true);
    cellView.setFloat32(o + 8, c.width, true);
    cellView.setFloat32(o + 12, c.height, true);
    cellView.setUint32(o + 16, c.bgColor >>> 0, true);
    cellView.setUint32(o + 20, c.fgColor >>> 0, true);
    cellView.setUint32(o + 24, glyphOffset, true);
    cellView.setUint32(o + 28, c.glyphs.length, true);
    for (let g = 0; g < c.glyphs.length; g++) {
      const gl = c.glyphs[g]!;
      const go = (glyphOffset + g) * GLYPH_STRIDE;
      glyphView.setUint32(go + 0, gl.glyphId >>> 0, true);
      glyphView.setFloat32(go + 4, gl.penOffset, true);
      glyphView.setFloat32(go + 8, gl.advance, true);
      glyphView.setFloat32(go + 12, gl.scale, true);
    }
    glyphOffset += c.glyphs.length;
  }

  return {
    cells: cellBuf,
    glyphs: glyphBuf,
    cellCount: cells.length,
    glyphCount: totalGlyphs,
  };
}

/** Pack RGBA 0–255 components into a single u32. */
export function packRgba(r: number, g: number, b: number, a: number = 255): number {
  return (
    ((r & 0xff) << 24) |
    ((g & 0xff) << 16) |
    ((b & 0xff) << 8) |
    (a & 0xff)
  ) >>> 0;
}
