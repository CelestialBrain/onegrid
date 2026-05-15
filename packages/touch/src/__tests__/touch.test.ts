import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  bindGestures,
  touchCss,
  attachVirtualKeyboard,
  inputmodeForColumn,
  DEFAULT_LONG_PRESS_ACTION,
} from '../index.js';
import type { GestureEvent } from '../index.js';

function makeTarget(rect = { left: 0, top: 0, right: 1000, bottom: 800 }): Element {
  const el = document.createElement('div');
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      ...rect,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      x: rect.left,
      y: rect.top,
      toJSON() {
        return rect;
      },
    }),
  });
  return el;
}

// jsdom doesn't ship PointerEvent — synthesize a minimal stand-in.
function pointer(
  type: string,
  pointerId: number,
  x: number,
  y: number,
  timeStamp: number,
): Event {
  const evt = new Event(type, { bubbles: true });
  Object.defineProperty(evt, 'pointerId', { value: pointerId });
  Object.defineProperty(evt, 'clientX', { value: x });
  Object.defineProperty(evt, 'clientY', { value: y });
  Object.defineProperty(evt, 'pointerType', { value: 'touch' });
  Object.defineProperty(evt, 'timeStamp', { value: timeStamp });
  return evt;
}

describe('bindGestures', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires tap on quick down/up without movement', () => {
    const target = makeTarget();
    const events: GestureEvent[] = [];
    const cleanup = bindGestures(target, (e) => events.push(e));
    target.dispatchEvent(pointer('pointerdown', 1, 100, 100, 0));
    target.dispatchEvent(pointer('pointerup', 1, 100, 100, 50));
    expect(events.map((e) => e.kind)).toEqual(['tap']);
    cleanup();
  });

  it('fires doubleTap when two taps land within window', () => {
    const target = makeTarget();
    const events: GestureEvent[] = [];
    const cleanup = bindGestures(target, (e) => events.push(e));
    const t1 = pointer('pointerdown', 1, 100, 100, 0);
    target.dispatchEvent(t1);
    target.dispatchEvent(pointer('pointerup', 1, 100, 100, 50));
    // second tap within doubleTapMs window
    const t2 = pointer('pointerdown', 2, 102, 99, 200);
    target.dispatchEvent(t2);
    target.dispatchEvent(pointer('pointerup', 2, 102, 99, 230));
    expect(events.map((e) => e.kind)).toEqual(['tap', 'doubleTap']);
    cleanup();
  });

  it('fires longPress after 500ms without movement', () => {
    const target = makeTarget();
    const events: GestureEvent[] = [];
    const cleanup = bindGestures(target, (e) => events.push(e));
    target.dispatchEvent(pointer('pointerdown', 1, 100, 100, 0));
    vi.advanceTimersByTime(500);
    expect(events.map((e) => e.kind)).toContain('longPress');
    cleanup();
  });

  it('cancels longPress when pointer moves beyond tapSlop', () => {
    const target = makeTarget();
    const events: GestureEvent[] = [];
    const cleanup = bindGestures(target, (e) => events.push(e));
    target.dispatchEvent(pointer('pointerdown', 1, 100, 100, 0));
    target.dispatchEvent(pointer('pointermove', 1, 120, 120, 50));
    vi.advanceTimersByTime(500);
    expect(events.map((e) => e.kind)).not.toContain('longPress');
    cleanup();
  });

  it('detects dragFromEdge when pointer starts within edge band', () => {
    const target = makeTarget();
    const events: GestureEvent[] = [];
    const cleanup = bindGestures(target, (e) => events.push(e));
    // Start 5px from left edge — within default 20px band.
    target.dispatchEvent(pointer('pointerdown', 1, 5, 400, 0));
    target.dispatchEvent(pointer('pointermove', 1, 80, 400, 30));
    const dragEdges = events.filter((e) => e.kind === 'dragFromEdge');
    expect(dragEdges).toHaveLength(1);
    expect(dragEdges[0]!.edge).toBe('left');
    cleanup();
  });

  it('cleans up on pointercancel', () => {
    const target = makeTarget();
    const events: GestureEvent[] = [];
    const cleanup = bindGestures(target, (e) => events.push(e));
    target.dispatchEvent(pointer('pointerdown', 1, 100, 100, 0));
    target.dispatchEvent(pointer('pointercancel', 1, 100, 100, 100));
    vi.advanceTimersByTime(500);
    expect(events).toHaveLength(0);
    cleanup();
  });
});

describe('touchCss', () => {
  it('emits manipulation/none/pan-x pan-y/overscroll-contain', () => {
    const css = touchCss();
    expect(css).toContain('touch-action: manipulation');
    expect(css).toContain('touch-action: none');
    expect(css).toContain('touch-action: pan-x pan-y');
    expect(css).toContain('overscroll-behavior: contain');
  });
  it('emits a (pointer: coarse) block bumping row + chevron to touch-hit-zone', () => {
    const css = touchCss();
    expect(css).toContain('@media (pointer: coarse)');
    expect(css).toContain('--og-size-row-height');
    expect(css).toContain('--og-size-touch-hit-zone');
  });
  it('scopes selectors', () => {
    const css = touchCss('[data-custom-root]');
    expect(css).toContain('[data-custom-root]');
  });
});

describe('attachVirtualKeyboard', () => {
  it('returns a no-op cleanup when neither virtualKeyboard nor visualViewport is available', () => {
    const originalNav = globalThis.navigator;
    vi.stubGlobal('navigator', { ...originalNav, virtualKeyboard: undefined });
    vi.stubGlobal('window', { visualViewport: undefined });
    const cleanup = attachVirtualKeyboard(() => {});
    expect(typeof cleanup).toBe('function');
    cleanup();
    vi.unstubAllGlobals();
  });
});

describe('inputmodeForColumn', () => {
  it('maps integer-family to numeric', () => {
    expect(inputmodeForColumn('int32')).toBe('numeric');
    expect(inputmodeForColumn('int64')).toBe('numeric');
    expect(inputmodeForColumn('uint16')).toBe('numeric');
  });
  it('maps float/decimal to decimal', () => {
    expect(inputmodeForColumn('float64')).toBe('decimal');
    expect(inputmodeForColumn('decimal')).toBe('decimal');
  });
  it('maps utf8/json to text', () => {
    expect(inputmodeForColumn('utf8')).toBe('text');
    expect(inputmodeForColumn('json')).toBe('text');
  });
  it('maps unknown to text', () => {
    expect(inputmodeForColumn('unknown')).toBe('text');
  });
});

describe('DEFAULT_LONG_PRESS_ACTION', () => {
  it('is context-menu (platform convention)', () => {
    expect(DEFAULT_LONG_PRESS_ACTION).toBe('context-menu');
  });
});
