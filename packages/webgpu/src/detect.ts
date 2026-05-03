// =============================================================================
// WebGPU detection + adapter info.
// =============================================================================

export interface GpuInfo {
  /** Adapter vendor string (often empty on Chrome desktop for privacy). */
  readonly vendor: string;
  /** Adapter architecture string (e.g. "rdna2"). */
  readonly architecture: string;
  /** Device label or fallback description. */
  readonly description: string;
  /** Whether the f16 extension is enabled on this device. */
  readonly hasF16: boolean;
}

export function webgpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as Navigator & { gpu?: unknown }).gpu;
}

export async function getGpuInfo(): Promise<GpuInfo | null> {
  if (!webgpuAvailable()) return null;
  const gpu = (navigator as Navigator & { gpu: GPU }).gpu;
  const adapter = await gpu.requestAdapter();
  if (!adapter) return null;
  const info = adapter.info as
    | { vendor?: string; architecture?: string; description?: string }
    | undefined;
  return {
    vendor: info?.vendor ?? '',
    architecture: info?.architecture ?? '',
    description: info?.description ?? '(unnamed adapter)',
    hasF16: adapter.features.has('shader-f16'),
  };
}
