// =============================================================================
// Predicate-to-mask compute kernel.
//
// gpuFilterMaskF32(data, op, threshold) → Uint32Array of 0/1, one per row.
// Trivially parallel: each thread reads one input element and writes one
// mask element. Used to build BitmapSelections at scale (10M+ rows) for
// SSRM filter pushdown without blocking the main thread on a JS loop.
// =============================================================================

import { getDevice } from './device';

export type FilterOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

const OP_CODES: Record<FilterOp, number> = {
  gt: 0,
  gte: 1,
  lt: 2,
  lte: 3,
  eq: 4,
  neq: 5,
};

const WORKGROUP_SIZE = 256;

const FILTER_SHADER = /* wgsl */ `
struct Params {
  threshold: f32,
  op: u32,
  len: u32,
  _pad: u32,
};

@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;
// 'meta' is a reserved keyword in WGSL — use 'params' instead.
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(${String(WORKGROUP_SIZE)})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.len) { return; }
  let v = input[gid.x];
  let t = params.threshold;
  var pass: bool = false;
  switch params.op {
    case 0u: { pass = v > t; }
    case 1u: { pass = v >= t; }
    case 2u: { pass = v < t; }
    case 3u: { pass = v <= t; }
    case 4u: { pass = v == t; }
    case 5u: { pass = v != t; }
    default: { pass = false; }
  }
  output[gid.x] = select(0u, 1u, pass);
}
`;

export async function gpuFilterMaskF32(
  data: Float32Array,
  op: FilterOp,
  threshold: number,
): Promise<Uint32Array> {
  if (data.length === 0) return new Uint32Array();
  const device = await getDevice();
  const module = device.createShaderModule({ code: FILTER_SHADER });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });

  const inputBuf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(inputBuf, 0, data.buffer as ArrayBuffer);

  const outputBuf = device.createBuffer({
    size: data.length * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const metaBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const metaArr = new ArrayBuffer(16);
  new Float32Array(metaArr, 0, 1)[0] = threshold;
  new Uint32Array(metaArr, 4, 3).set([OP_CODES[op], data.length, 0]);
  device.queue.writeBuffer(metaBuf, 0, metaArr);

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
  pass.dispatchWorkgroups(Math.ceil(data.length / WORKGROUP_SIZE));
  pass.end();

  const readBuf = device.createBuffer({
    size: data.length * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  encoder.copyBufferToBuffer(outputBuf, 0, readBuf, 0, data.length * 4);
  device.queue.submit([encoder.finish()]);

  await readBuf.mapAsync(GPUMapMode.READ);
  const result = new Uint32Array(readBuf.getMappedRange().slice(0));
  readBuf.unmap();
  readBuf.destroy();
  inputBuf.destroy();
  outputBuf.destroy();
  return result;
}

export function cpuFilterMaskF32(
  data: Float32Array,
  op: FilterOp,
  threshold: number,
): Uint32Array {
  const out = new Uint32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const v = data[i] ?? 0;
    let pass = false;
    switch (op) {
      case 'gt':
        pass = v > threshold;
        break;
      case 'gte':
        pass = v >= threshold;
        break;
      case 'lt':
        pass = v < threshold;
        break;
      case 'lte':
        pass = v <= threshold;
        break;
      case 'eq':
        pass = v === threshold;
        break;
      case 'neq':
        pass = v !== threshold;
        break;
    }
    out[i] = pass ? 1 : 0;
  }
  return out;
}
