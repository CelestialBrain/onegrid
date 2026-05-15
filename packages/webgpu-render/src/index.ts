// =============================================================================
// @onegrid/webgpu-render
//
// WebGPU rendering scaffold for the v0.1.0 milestone. Ships:
//
//   - Per-cell vertex buffer protocol (CELL_STRIDE = 32 bytes interleaved)
//   - MSDF atlas format + WGSL fragment snippet
//   - createRenderScaffold(canvas) — device + swap chain + cell-quad pipeline
//
// The full canvas→WebGPU renderer migration is a v0.1.0.x effort — this
// package establishes the protocol + scaffolding that migration lands on.
// =============================================================================

export {
  packCells,
  packRgba,
  CELL_STRIDE,
  GLYPH_STRIDE,
  type CellPackInput,
  type PackedCellBuffers,
} from './vertex-buffer.js';

export {
  lookupGlyph,
  screenPxRange,
  MSDF_WGSL,
  type MsdfAtlas,
  type MsdfGlyph,
} from './msdf.js';

export {
  createRenderScaffold,
  type RenderScaffold,
  type RenderScaffoldOptions,
} from './scaffold.js';
