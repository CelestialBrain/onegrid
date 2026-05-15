// =============================================================================
// WebGPU render scaffold — device acquisition, swap chain configuration,
// cell-quad pipeline construction.
//
// Wraps @onegrid/webgpu's compute-only device acquisition with the render
// pipeline configuration we need for cell painting: swap-chain format,
// vertex buffer binding layout, MSDF text shader integration.
//
// What v0.1.0 ships: the scaffold + a stub WGSL pipeline that draws solid-
// color cell quads. Text rendering, the canvas→WebGPU renderer swap, and
// the GPU-side sort/filter integration land in v0.1.0.x once the API
// surface here has soaked.
// =============================================================================

import { getDevice, webgpuAvailable } from '@onegrid/webgpu';
import { CELL_STRIDE, GLYPH_STRIDE } from './vertex-buffer.js';

export interface RenderScaffoldOptions {
  readonly canvas: HTMLCanvasElement;
  /** Preferred swap-chain format. Defaults to `navigator.gpu.getPreferredCanvasFormat()`. */
  readonly format?: GPUTextureFormat;
}

export interface RenderScaffold {
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
  readonly format: GPUTextureFormat;
  readonly cellPipeline: GPURenderPipeline;
  /** Free GPU resources owned by the scaffold. */
  readonly dispose: () => void;
}

/**
 * Acquire a GPUDevice, configure the canvas, and build the cell-quad
 * render pipeline. Throws if WebGPU is unavailable — callers should
 * fall back to the canvas renderer at the @onegrid/core layer.
 */
export async function createRenderScaffold(
  opts: RenderScaffoldOptions,
): Promise<RenderScaffold> {
  if (!webgpuAvailable()) {
    throw new Error('[OG_WEBGPU_UNAVAILABLE] navigator.gpu missing — use CPU canvas renderer');
  }
  const device = await getDevice();
  const context = opts.canvas.getContext('webgpu');
  if (!context) {
    throw new Error('[OG_WEBGPU_NO_CONTEXT] canvas.getContext("webgpu") returned null');
  }
  const format =
    opts.format ?? (navigator as Navigator & { gpu: GPU }).gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  const cellPipeline = buildCellPipeline(device, format);

  return {
    device,
    context,
    format,
    cellPipeline,
    dispose: () => {
      context.unconfigure();
      // Device is shared via getDevice() cache — don't destroy it here.
    },
  };
}

/**
 * Cell-quad pipeline. Each instance draws one rectangle in viewport
 * pixel coordinates. Vertex shader transforms to clip space; fragment
 * paints with the per-instance bg color.
 *
 * v0.1.0 ships solid-color quads as proof. Text rendering integrates
 * the MSDF fragment snippet via a second pipeline in v0.1.0.x.
 */
function buildCellPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
): GPURenderPipeline {
  const wgsl = `
    struct Uniforms {
      viewport: vec2f,
    };
    @group(0) @binding(0) var<uniform> u: Uniforms;

    struct VsIn {
      @location(0) cell_pos: vec2f,   // top-left in viewport px
      @location(1) cell_size: vec2f,  // width, height in viewport px
      @location(2) bg_color: u32,
      @builtin(vertex_index) vid: u32,
    };

    struct VsOut {
      @builtin(position) position: vec4f,
      @location(0) color: vec4f,
    };

    fn unpack_rgba(u: u32) -> vec4f {
      return vec4f(
        f32((u >> 24u) & 0xffu) / 255.0,
        f32((u >> 16u) & 0xffu) / 255.0,
        f32((u >> 8u)  & 0xffu) / 255.0,
        f32( u         & 0xffu) / 255.0,
      );
    }

    @vertex
    fn vs_main(in: VsIn) -> VsOut {
      // Two triangles per quad, generated from vertex_index 0..5.
      let quad = array<vec2f, 6>(
        vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
        vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
      );
      let corner = quad[in.vid];
      let px = in.cell_pos + corner * in.cell_size;
      // Map pixel → clip space: x ∈ [-1, 1], y inverted because GPU y-up.
      let clip = vec2f(
        (px.x / u.viewport.x) * 2.0 - 1.0,
        1.0 - (px.y / u.viewport.y) * 2.0,
      );
      var out: VsOut;
      out.position = vec4f(clip, 0.0, 1.0);
      out.color = unpack_rgba(in.bg_color);
      return out;
    }

    @fragment
    fn fs_main(in: VsOut) -> @location(0) vec4f {
      return in.color;
    }
  `;
  const module = device.createShaderModule({ code: wgsl });
  return device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vs_main',
      buffers: [
        {
          arrayStride: CELL_STRIDE,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },   // cell_pos
            { shaderLocation: 1, offset: 8, format: 'float32x2' },   // cell_size
            { shaderLocation: 2, offset: 16, format: 'uint32' },     // bg_color
          ],
        },
      ],
    },
    fragment: {
      module,
      entryPoint: 'fs_main',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list' },
  });
}

/** Re-export the per-cell stride so the WGSL struct stays in sync. */
export { CELL_STRIDE, GLYPH_STRIDE };
