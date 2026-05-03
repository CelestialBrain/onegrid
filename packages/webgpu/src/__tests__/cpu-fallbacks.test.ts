// jsdom has no WebGPU runtime, so the GPU paths can't run here. These
// tests exercise the CPU fallbacks (which the GPU kernels match exactly)
// so the public API contract has lock-in coverage.

import { describe, expect, it } from 'vitest';
import { cpuSumFloat32, cpuFilterMaskF32, webgpuAvailable } from '../index';

describe('webgpuAvailable', () => {
  it('returns false in jsdom (no navigator.gpu)', () => {
    expect(webgpuAvailable()).toBe(false);
  });
});

describe('cpuSumFloat32', () => {
  it('sums an empty array as 0', () => {
    expect(cpuSumFloat32(new Float32Array())).toBe(0);
  });
  it('sums a typical block', () => {
    expect(cpuSumFloat32(new Float32Array([1, 2, 3, 4, 5]))).toBe(15);
  });
  it('handles 1M floats without numerical disaster', () => {
    const data = new Float32Array(1_000_000);
    for (let i = 0; i < data.length; i++) data[i] = 1;
    expect(cpuSumFloat32(data)).toBeCloseTo(1_000_000, 0);
  });
});

describe('cpuFilterMaskF32', () => {
  const data = new Float32Array([1, 2, 3, 4, 5]);

  it('gt', () => {
    expect(Array.from(cpuFilterMaskF32(data, 'gt', 3))).toEqual([0, 0, 0, 1, 1]);
  });
  it('gte', () => {
    expect(Array.from(cpuFilterMaskF32(data, 'gte', 3))).toEqual([0, 0, 1, 1, 1]);
  });
  it('lt', () => {
    expect(Array.from(cpuFilterMaskF32(data, 'lt', 3))).toEqual([1, 1, 0, 0, 0]);
  });
  it('eq', () => {
    expect(Array.from(cpuFilterMaskF32(data, 'eq', 3))).toEqual([0, 0, 1, 0, 0]);
  });
  it('neq', () => {
    expect(Array.from(cpuFilterMaskF32(data, 'neq', 3))).toEqual([1, 1, 0, 1, 1]);
  });
});
