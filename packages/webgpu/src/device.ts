// =============================================================================
// Device + queue lifecycle.
//
// We cache a single GPUDevice per process because requestAdapter +
// requestDevice are expensive (~50–150ms first time on Chrome) and a
// single device is sufficient for compute-only workloads.
// =============================================================================

let cachedDevicePromise: Promise<GPUDevice> | null = null;

export async function getDevice(): Promise<GPUDevice> {
  if (cachedDevicePromise) return cachedDevicePromise;
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) throw new Error('@onegrid/webgpu: navigator.gpu is unavailable.');
  cachedDevicePromise = (async () => {
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('@onegrid/webgpu: no compatible adapter found.');
    const device = await adapter.requestDevice();
    device.lost.then(() => {
      cachedDevicePromise = null;
    }).catch(() => {
      cachedDevicePromise = null;
    });
    return device;
  })();
  return cachedDevicePromise;
}
