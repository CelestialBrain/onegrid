import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RovingTabindex } from '../roving-tabindex';

function makeButtons(host: HTMLElement, n: number): HTMLButtonElement[] {
  const out: HTMLButtonElement[] = [];
  for (let i = 0; i < n; i++) {
    const b = document.createElement('button');
    b.textContent = String(i);
    host.appendChild(b);
    out.push(b);
  }
  return out;
}

describe('RovingTabindex', () => {
  let host: HTMLElement;
  let buttons: HTMLButtonElement[];
  let rt: RovingTabindex;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    buttons = makeButtons(host, 4);
    rt = new RovingTabindex({ orientation: 'horizontal' });
    rt.attach(host, buttons);
  });

  afterEach(() => {
    rt.detach();
    host.remove();
  });

  it('starts with tabindex=0 on the first element only', () => {
    expect(buttons[0]!.tabIndex).toBe(0);
    expect(buttons[1]!.tabIndex).toBe(-1);
    expect(buttons[2]!.tabIndex).toBe(-1);
    expect(buttons[3]!.tabIndex).toBe(-1);
  });

  it('ArrowRight moves focus + tabindex forward, no wrap by default', () => {
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(buttons[0]!.tabIndex).toBe(-1);
    expect(buttons[1]!.tabIndex).toBe(0);
  });

  it('ArrowLeft does not wrap from index 0 by default', () => {
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(buttons[0]!.tabIndex).toBe(0);
  });

  it('Home jumps to the first element', () => {
    rt.focus(3);
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(buttons[0]!.tabIndex).toBe(0);
  });

  it('End jumps to the last element', () => {
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(buttons[3]!.tabIndex).toBe(0);
  });

  it('vertical orientation listens to Up/Down only', () => {
    rt.detach();
    rt = new RovingTabindex({ orientation: 'vertical' });
    rt.attach(host, buttons);
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(buttons[0]!.tabIndex).toBe(0); // unchanged
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(buttons[1]!.tabIndex).toBe(0);
  });

  it('wrap:true cycles past the boundary', () => {
    rt.detach();
    rt = new RovingTabindex({ wrap: true });
    rt.attach(host, buttons);
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(buttons[3]!.tabIndex).toBe(0);
  });

  it('consume:false lets the focused element handle the arrow key', () => {
    rt.detach();
    rt = new RovingTabindex({ consume: () => false });
    rt.attach(host, buttons);
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(buttons[0]!.tabIndex).toBe(0); // didn't rove
  });

  it('onActiveChange fires with new and old indices', () => {
    const events: Array<[number, number]> = [];
    rt.detach();
    rt = new RovingTabindex({ onActiveChange: (n, o) => events.push([n, o]) });
    rt.attach(host, buttons);
    rt.focus(2);
    expect(events).toEqual([[2, 0]]);
  });
});
