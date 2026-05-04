import { afterEach, describe, expect, it, beforeEach } from 'vitest';
import { LiveAnnouncer } from '../live-announcer';

describe('LiveAnnouncer', () => {
  let host: HTMLElement;
  let announcer: LiveAnnouncer;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    announcer = new LiveAnnouncer(host);
  });

  afterEach(() => {
    announcer.destroy();
    host.remove();
  });

  it('mounts two polite + two assertive regions on construction', () => {
    const polite = host.querySelectorAll('[aria-live="polite"]');
    const assertive = host.querySelectorAll('[aria-live="assertive"]');
    expect(polite).toHaveLength(2);
    expect(assertive).toHaveLength(2);
  });

  it('writes to a polite region by default and alternates between the two', () => {
    announcer.announce('first');
    const after1 = Array.from(host.querySelectorAll('[aria-live="polite"]')).map(
      (n) => n.textContent,
    );
    expect(after1).toContain('first');

    announcer.announce('second');
    const after2 = Array.from(host.querySelectorAll('[aria-live="polite"]')).map(
      (n) => n.textContent,
    );
    expect(after2.filter((t) => t === 'second')).toHaveLength(1);
    // The previous region is cleared so consecutive identical messages
    // would still re-announce.
    expect(after2.filter((t) => t === '').length).toBeGreaterThan(0);
  });

  it('coalesces duplicate messages within 100ms', () => {
    announcer.announce('hello');
    announcer.announce('hello');
    const polite = host.querySelectorAll('[aria-live="polite"]');
    const occurrences = Array.from(polite).filter((n) => n.textContent === 'hello');
    expect(occurrences).toHaveLength(1);
  });

  it('routes assertive messages to the assertive region', () => {
    announcer.announce('error', 'assertive');
    const polite = host.querySelectorAll('[aria-live="polite"]');
    const assertive = host.querySelectorAll('[aria-live="assertive"]');
    expect(Array.from(polite).every((n) => n.textContent === '')).toBe(true);
    expect(
      Array.from(assertive).some((n) => n.textContent === 'error'),
    ).toBe(true);
  });

  it('destroy() removes mounted regions from the host', () => {
    expect(host.children.length).toBe(4);
    announcer.destroy();
    expect(host.children.length).toBe(0);
  });
});
