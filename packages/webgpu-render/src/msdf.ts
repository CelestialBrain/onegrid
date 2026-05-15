// =============================================================================
// MSDF (Multi-channel Signed Distance Field) glyph atlas — format + WGSL
// fragment-shader snippet.
//
// MSDF rendering produces sharp glyph edges at arbitrary scale from a single
// pre-baked texture. The atlas stores per-glyph: a 3-channel SDF (red, green,
// blue encode independent distance fields) inside a rectangle in atlas-UV
// space. The fragment shader reconstructs the implicit curve via a median()
// of the three channels and antialiases via fwidth().
//
// Standard reference: Viktor Chlumský, "Shape Decomposition for Multi-Channel
// Distance Fields" (master's thesis, 2015) — the public algorithm every MSDF
// implementation derives from.
//
// We ship:
//   - The atlas JSON format (consumed by the runtime)
//   - The WGSL fragment-shader snippet (string export)
//   - A `lookupGlyph(atlas, charCode)` helper for per-character placement
//
// What we DON'T ship: the offline baker. Adopters use `msdf-bmfont-xml`,
// `msdf-atlas-gen` (CLI), or any tool that outputs the standard layout —
// all of them produce JSON in the same shape.
// =============================================================================

/** One glyph's placement + advance metrics. */
export interface MsdfGlyph {
  /** Unicode code point. */
  readonly id: number;
  /** Position in the atlas texture (pixels). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Render offset from baseline pen. */
  readonly xoffset: number;
  readonly yoffset: number;
  /** Horizontal advance after rendering. */
  readonly xadvance: number;
}

/** Standard MSDF atlas JSON shape (compatible with `msdf-bmfont-xml`). */
export interface MsdfAtlas {
  readonly info: {
    readonly face: string;
    readonly size: number;
    readonly distanceRange: number; // px; passed into screenPxRange()
  };
  readonly common: {
    readonly scaleW: number; // atlas texture width in px
    readonly scaleH: number;
    readonly lineHeight: number;
    readonly base: number; // baseline-from-top in EM units
  };
  readonly chars: ReadonlyArray<MsdfGlyph>;
}

/** Resolve a Unicode code point to its glyph entry. */
export function lookupGlyph(
  atlas: MsdfAtlas,
  charCode: number,
): MsdfGlyph | undefined {
  // Lookup is O(N) here for simplicity; real consumers build a Map at
  // load time. Atlases are small (Latin-1 ~ 256 glyphs).
  for (const g of atlas.chars) {
    if (g.id === charCode) return g;
  }
  return undefined;
}

/**
 * Compile-time WGSL fragment-shader snippet implementing the standard
 * MSDF distance-field reconstruction. Embed inside a render pipeline's
 * fragment entry point:
 *
 *   ```wgsl
 *   ${MSDF_WGSL}
 *
 *   @fragment
 *   fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
 *     let s = textureSample(atlas, atlasSampler, uv);
 *     let d = msdf_distance(s.rgb);
 *     let alpha = msdf_alpha(d, screen_px_range);
 *     return vec4f(fg_color.rgb, fg_color.a * alpha);
 *   }
 *   ```
 *
 * `screen_px_range` is the per-frame ratio of atlas pixels to screen
 * pixels at the current glyph scale — pass it in as a uniform. The
 * standard formula:
 *
 *   screen_px_range = (atlas.distanceRange / atlas_glyph_height) * screen_glyph_height
 */
export const MSDF_WGSL = `
fn msdf_median(rgb: vec3f) -> f32 {
  return max(min(rgb.r, rgb.g), min(max(rgb.r, rgb.g), rgb.b));
}

fn msdf_distance(rgb: vec3f) -> f32 {
  return msdf_median(rgb) - 0.5;
}

/** Convert MSDF distance → alpha. \`px_range\` is the per-pixel
    spread of the distance field on screen (uniform). */
fn msdf_alpha(distance: f32, px_range: f32) -> f32 {
  let signed = distance * px_range;
  return clamp(signed + 0.5, 0.0, 1.0);
}
`.trim();

/**
 * Compute the `screen_px_range` uniform for the current frame given the
 * atlas's baked distance range and the on-screen pixel height of one
 * EM unit.
 *
 *   screen_px_range = atlas.distanceRange × (screen_em_px / atlas.size)
 *
 * Reference: msdfgen / msdf-atlas-gen documentation, public.
 */
export function screenPxRange(atlas: MsdfAtlas, screenEmPx: number): number {
  return atlas.info.distanceRange * (screenEmPx / atlas.info.size);
}
