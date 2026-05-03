// =============================================================================
// Parallel reduction sum over a Float32Array on the GPU.
//
// Algorithm: classic two-stage reduction. Each workgroup of 256 threads
// reduces 256 inputs into a single partial sum via shared memory; the
// dispatch produces ceil(n/256) partials. We loop the kernel against the
// partial buffer until a single value remains, then read it back.
//
// For n ≤ 1024 the CPU is faster (kernel launch dominates). The crossover
// on a desktop M-class GPU is around 100k floats; at 10M+ floats, the GPU
// is typically 10–30× faster than a JS loop and frees the main thread.
// =============================================================================

import { getDevice } from './device';

const WORKGROUP_SIZE = 256;

const REDUCE_SHADER = /* wgsl */ `
@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;
@group(0) @binding(2) var<uniform> meta: vec4<u32>; // x = inputLen

var<workgroup> shared_data: array<f32, ${String(WORKGROUP_SIZE)}>;

@compute @workgroup_size(${String(WORKGROUP_SIZE)})
fn main(
  @builtin(workgroup_id) wg_id: vec3<u32>,
  @builtin(local_invocation_id) local_id: vec3<u32>,
) {
  let len = meta.x;
  let global_idx = wg_id.x * ${String(WORKGROUP_SIZE)}u + local_id.x;
  shared_data[local_id.x] = select(0.0, input[global_idx], global_idx < len);
  workgroupBarrier();

  var stride = ${String(WORKGROUP_SIZE / 2)}u;
  loop {
    if (stride == 0u) { break; }
    if (local_id.x < stride) {
      shared_data[local_id.x] = shared_data[local_id.x] + shared_data[local_id.x + stride];
    }
    workgroupBarrier();
    stride = stride / 2u;
  }

  if (local_id.x == 0u) {
    output[wg_id.x] = shared_data[0];
  }
}
`;

export async function gpuSumFloat32(data: Float32Array): Promise<number> {
  if (data.length === 0) return 0;
  const device = await getDevice();
  const module = device.createShaderModule({ code: REDUCE_SHADER });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });

  // Ping-pong buffers so each pass reads "current" and writes "next".
  let currentLen = data.length;
  let inputBuf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(inputBuf, 0, data.buffer as ArrayBuffer);

  while (currentLen > 1) {
    const groups = Math.ceil(currentLen / WORKGROUP_SIZE);
    const outputBuf = device.createBuffer({
      size: Math.max(4, groups * 4),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    const metaBuf = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(
      metaBuf,
      0,
      new Uint32Array([currentLen, 0, 0, 0]).buffer as ArrayBuffer,
    );

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inputBuf } },
        { binding: 1, resource: { buffer: outputBuf } },
        { binding: 2, resource: { buffer: metaBuf } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(groups);
    pass.end();
    device.queue.submit([encoder.finish()]);

    inputBuf.destroy();
    inputBuf = outputBuf;
    currentLen = groups;
  }

  // Read the single-float result back to the CPU.
  const readBuf = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const finalEncoder = device.createCommandEncoder();
  finalEncoder.copyBufferToBuffer(inputBuf, 0, readBuf, 0, 4);
  device.queue.submit([finalEncoder.finish()]);
  await readBuf.mapAsync(GPUMapMode.READ);
  const view = new Float32Array(readBuf.getMappedRange().slice(0));
  const result = view[0] ?? 0;
  readBuf.unmap();
  readBuf.destroy();
  inputBuf.destroy();
  return result;
}

/** Pure-JS fallback / reference implementation. Useful for tests + as a
 *  benchmark baseline. */
export function cpuSumFloat32(data: Float32Array): number {
  let s = 0;
  for (let i = 0; i < data.length; i++) s += data[i] ?? 0;
  return s;
}
