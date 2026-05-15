# @onegrid/webgpu-render

WebGPU rendering scaffold for oneGrid. v0.1.0 ships **scaffolding +
protocol**; the full canvas→WebGPU renderer migration lands in
v0.1.0.x as `@onegrid/core/features/webgpu-render`.

## Three pieces

### 1. Per-cell vertex buffer protocol

Every visible cell packs into a single interleaved Float32 vertex
buffer. The vertex shader treats each cell as an instance and emits
a quad. Cell stride: **32 bytes**; glyph stride: **16 bytes**.

```ts
import { packCells, packRgba } from '@onegrid/webgpu-render';

const { cells, glyphs, cellCount, glyphCount } = packCells([
  {
    x: 100, y: 0, width: 120, height: 32,
    bgColor: packRgba(255, 255, 255, 255),
    fgColor: packRgba(0, 0, 0, 255),
    glyphs: [
      { glyphId: 65, penOffset: 0,  advance: 12, scale: 1 },
      { glyphId: 66, penOffset: 12, advance: 12, scale: 1 },
    ],
  },
]);

const cellBuf = device.createBuffer({
  size: cells.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(cellBuf, 0, cells);
```

### 2. MSDF atlas format + WGSL snippet

Multi-channel signed distance field text. Atlas JSON follows the
`msdf-bmfont-xml` / `msdf-atlas-gen` standard layout. The WGSL
snippet `MSDF_WGSL` exports `msdf_median()`, `msdf_distance()`, and
`msdf_alpha()` — drop into your fragment shader.

```wgsl
${MSDF_WGSL}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let s = textureSample(atlas, atlasSampler, uv);
  let d = msdf_distance(s.rgb);
  let alpha = msdf_alpha(d, screen_px_range);
  return vec4f(fg_color.rgb, fg_color.a * alpha);
}
```

`screen_px_range` is the per-frame uniform that scales the baked
distance range to the on-screen pixel size:

```ts
import { screenPxRange } from '@onegrid/webgpu-render';

const uniform = screenPxRange(atlas, currentEmPxOnScreen);
```

We don't ship the offline baker — use `msdf-bmfont-xml` or
`msdf-atlas-gen`; both produce JSON in the shape `@onegrid/webgpu-render`
expects.

### 3. Render scaffold

```ts
import { createRenderScaffold } from '@onegrid/webgpu-render';

const scaffold = await createRenderScaffold({ canvas });

// Per-frame:
const encoder = scaffold.device.createCommandEncoder();
const pass = encoder.beginRenderPass({
  colorAttachments: [{
    view: scaffold.context.getCurrentTexture().createView(),
    clearValue: { r: 0, g: 0, b: 0, a: 1 },
    loadOp: 'clear',
    storeOp: 'store',
  }],
});
pass.setPipeline(scaffold.cellPipeline);
pass.setVertexBuffer(0, cellBuf);
pass.draw(6, cellCount); // 6 verts per quad × N instances
pass.end();
scaffold.device.queue.submit([encoder.finish()]);
```

The scaffold throws `[OG_WEBGPU_UNAVAILABLE]` when `navigator.gpu` is
missing — callers fall back to the canvas renderer at the
`@onegrid/core` layer.

## What v0.1.0.x adds

- Per-cell vertex shader with MSDF text composition in one pipeline
- Cell-renderer overlay → GPU compute path (no DOM mounts on the
  hot scroll path)
- Integration with v0.0.10 column virtualization (only visible cells
  reach the GPU)
- WebGPU benchmark suite (60 FPS at 100 visible cells × M rows scrolling)

## License

MIT
