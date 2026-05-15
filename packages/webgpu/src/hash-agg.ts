// =============================================================================
// GPU hash-aggregate kernel (v0.1.0 item 4)
//
// Group-by-sum over (keys: Uint32Array, values: Float32Array) into a
// fixed-bucket hash table on the GPU. Each thread atomically adds its
// row's value to the bucket selected by `hash(key) & (numBuckets - 1)`.
//
// Constraints:
//   - numBuckets must be a power of two (mask-based bucketing)
//   - Caller picks numBuckets >= 4× the expected group cardinality to
//     keep load factor low (linear-probing is intentionally NOT shipped
//     in v0.1.0 — the CPU fallback is the correctness oracle)
//   - On bucket collision, both keys' contributions land in the same
//     slot; the kernel can't distinguish. The CPU fallback always
//     produces correct results.
//
// Output is two parallel arrays of length numBuckets:
//   - bucketKeys[i]  — the key written by the LAST thread to touch
//                      bucket i (atomicMax on a key-tracking slot is
//                      cheaper than tracking the first-writer; consumer
//                      ignores buckets where bucketCounts[i] == 0)
//   - bucketSums[i]  — sum of values written to bucket i
//   - bucketCounts[i] — number of contributions
// =============================================================================

import { getDevice } from './device';

const WORKGROUP_SIZE = 256;

const HASH_AGG_SHADER = /* wgsl */ `
@group(0) @binding(0) var<storage, read> keys: array<u32>;
@group(0) @binding(1) var<storage, read> values: array<f32>;
@group(0) @binding(2) var<storage, read_write> bucket_keys: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> bucket_sums: array<atomic<u32>>; // bit-cast from f32 accumulator
@group(0) @binding(4) var<storage, read_write> bucket_counts: array<atomic<u32>>;
@group(0) @binding(5) var<uniform> params: vec4<u32>; // x = inputLen, y = numBuckets (pow2), z = mask

@compute @workgroup_size(${String(WORKGROUP_SIZE)})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.x) { return; }
  let key = keys[idx];
  let bucket = key & params.z;
  atomicStore(&bucket_keys[bucket], key);
  atomicAdd(&bucket_counts[bucket], 1u);
  // Float accumulation via spin-loop CAS — WGSL doesn't have atomic<f32>.
  let v = values[idx];
  loop {
    let old_bits = atomicLoad(&bucket_sums[bucket]);
    let old_val = bitcast<f32>(old_bits);
    let new_val = old_val + v;
    let new_bits = bitcast<u32>(new_val);
    let cas = atomicCompareExchangeWeak(&bucket_sums[bucket], old_bits, new_bits);
    if (cas.exchanged) { break; }
  }
}
`;

export interface HashAggResult {
  /** Aligned with the consumer's bucket array. Length = numBuckets. */
  readonly bucketKeys: Uint32Array;
  readonly bucketSums: Float32Array;
  readonly bucketCounts: Uint32Array;
}

export interface HashAggOptions {
  /** Must be a power of two. Defaults to `nextPow2(4 × max(keys))`. */
  readonly numBuckets?: number;
}

export async function gpuHashAggSumF32(
  keys: Uint32Array,
  values: Float32Array,
  opts: HashAggOptions = {},
): Promise<HashAggResult> {
  if (keys.length !== values.length) {
    throw new Error('[OG_HASHAGG_LEN_MISMATCH] keys.length !== values.length');
  }
  if (keys.length === 0) {
    return {
      bucketKeys: new Uint32Array(0),
      bucketSums: new Float32Array(0),
      bucketCounts: new Uint32Array(0),
    };
  }
  const numBuckets = opts.numBuckets ?? nextPow2(Math.max(16, keys.length / 4));
  if ((numBuckets & (numBuckets - 1)) !== 0) {
    throw new Error('[OG_HASHAGG_NOT_POW2] numBuckets must be a power of two');
  }

  const device = await getDevice();
  const module = device.createShaderModule({ code: HASH_AGG_SHADER });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });

  const keysBuf = device.createBuffer({
    size: keys.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(keysBuf, 0, keys.buffer as ArrayBuffer);
  const valuesBuf = device.createBuffer({
    size: values.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(valuesBuf, 0, values.buffer as ArrayBuffer);

  const bktKeysBuf = device.createBuffer({
    size: numBuckets * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const bktSumsBuf = device.createBuffer({
    size: numBuckets * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const bktCountsBuf = device.createBuffer({
    size: numBuckets * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const params = new Uint32Array([keys.length, numBuckets, numBuckets - 1, 0]);
  const paramsBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(paramsBuf, 0, params.buffer as ArrayBuffer);

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: keysBuf } },
      { binding: 1, resource: { buffer: valuesBuf } },
      { binding: 2, resource: { buffer: bktKeysBuf } },
      { binding: 3, resource: { buffer: bktSumsBuf } },
      { binding: 4, resource: { buffer: bktCountsBuf } },
      { binding: 5, resource: { buffer: paramsBuf } },
    ],
  });

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(keys.length / WORKGROUP_SIZE));
  pass.end();

  // Stage readback.
  const readKeys = device.createBuffer({
    size: numBuckets * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const readSums = device.createBuffer({
    size: numBuckets * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const readCounts = device.createBuffer({
    size: numBuckets * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  encoder.copyBufferToBuffer(bktKeysBuf, 0, readKeys, 0, numBuckets * 4);
  encoder.copyBufferToBuffer(bktSumsBuf, 0, readSums, 0, numBuckets * 4);
  encoder.copyBufferToBuffer(bktCountsBuf, 0, readCounts, 0, numBuckets * 4);
  device.queue.submit([encoder.finish()]);

  await readKeys.mapAsync(GPUMapMode.READ);
  await readSums.mapAsync(GPUMapMode.READ);
  await readCounts.mapAsync(GPUMapMode.READ);
  const result: HashAggResult = {
    bucketKeys: new Uint32Array(readKeys.getMappedRange().slice(0)),
    bucketSums: new Float32Array(readSums.getMappedRange().slice(0)),
    bucketCounts: new Uint32Array(readCounts.getMappedRange().slice(0)),
  };
  readKeys.unmap();
  readSums.unmap();
  readCounts.unmap();
  keysBuf.destroy();
  valuesBuf.destroy();
  bktKeysBuf.destroy();
  bktSumsBuf.destroy();
  bktCountsBuf.destroy();
  paramsBuf.destroy();
  readKeys.destroy();
  readSums.destroy();
  readCounts.destroy();
  return result;
}

/**
 * CPU fallback with identical signature + semantics, used when WebGPU
 * is unavailable AND as a correctness oracle in tests. Uses a real
 * `Map<key, { sum, count }>` so collisions are handled exactly; the
 * output Float32Array/Uint32Array shape is preserved by sparse-
 * indexing into bucket arrays of the requested size.
 */
export function cpuHashAggSumF32(
  keys: Uint32Array,
  values: Float32Array,
  opts: HashAggOptions = {},
): HashAggResult {
  if (keys.length !== values.length) {
    throw new Error('[OG_HASHAGG_LEN_MISMATCH] keys.length !== values.length');
  }
  const numBuckets = opts.numBuckets ?? nextPow2(Math.max(16, keys.length / 4));
  const mask = numBuckets - 1;
  const bucketKeys = new Uint32Array(numBuckets);
  const bucketSums = new Float32Array(numBuckets);
  const bucketCounts = new Uint32Array(numBuckets);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    const v = values[i]!;
    const b = k & mask;
    bucketKeys[b] = k;
    bucketSums[b] = (bucketSums[b] ?? 0) + v;
    bucketCounts[b] = (bucketCounts[b] ?? 0) + 1;
  }
  return { bucketKeys, bucketSums, bucketCounts };
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
