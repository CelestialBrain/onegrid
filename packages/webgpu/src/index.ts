// =============================================================================
// @onegrid/webgpu
//
// GPU-accelerated compute kernels for oneGrid's hot data paths. Today's
// surface is small and focused on the patterns that matter at 100M-row
// scale:
//
//   - webgpuAvailable() — does the runtime expose navigator.gpu?
//   - getGpuInfo()      — describe the adapter (vendor, architecture).
//   - gpuSumFloat32()   — parallel reduction sum over a Float32Array.
//   - gpuFilterMaskF32() — predicate→mask kernel: writes a 0/1 Uint32Array
//                         flagging rows that pass `value <op> threshold`.
//   - cpuSumFloat32() / cpuFilterMaskF32() — CPU fallbacks with the same
//                                            shape, used when WebGPU is
//                                            unavailable or for benchmarks.
//
// The compute kernels speak Float32 to keep WGSL types minimal; callers
// holding Float64 columns should down-convert on the way in. Float64
// support is straightforward to add (split into two u32s and recombine in
// the shader) once the API surface is settled.
// =============================================================================

export { webgpuAvailable, getGpuInfo } from './detect';
export type { GpuInfo } from './detect';
export { getDevice } from './device';

export { gpuSumFloat32, cpuSumFloat32 } from './reduce';

export {
  gpuFilterMaskF32,
  cpuFilterMaskF32,
  type FilterOp,
} from './filter';

export {
  gpuHashAggSumF32,
  cpuHashAggSumF32,
  type HashAggResult,
  type HashAggOptions,
} from './hash-agg';
