// =============================================================================
// RovingTabindex
//
// Manage a single tab stop across a set of focusable elements. The active
// element has tabindex=0; all others have tabindex=-1. Arrow keys (and
// Home/End) rove focus by mutating the active index and calling .focus()
// on the new target. Match the WAI-ARIA APG keyboard interaction model.
//
// The `consume` callback is the escape hatch for when the focused element
// has its own internal selection (text input with a cursor mid-string,
// slider) — return false to let the input handle the arrow key, true to
// rove. The default returns true (always rove).
// =============================================================================

export interface RovingTabindexOptions {
  /** Direction of the rove. `horizontal` listens to Left/Right, `vertical`
   *  to Up/Down, `both` to all four. Default: `horizontal`. */
  readonly orientation?: 'horizontal' | 'vertical' | 'both';
  /** Whether arrow keys wrap from end → start. Default: false. */
  readonly wrap?: boolean;
  /** Predicate returning true if the arrow key should rove instead of
   *  being handled internally by the focused element. Default: always rove. */
  readonly consume?: (e: KeyboardEvent, activeIndex: number) => boolean;
  /** Called when the active index changes. Useful for syncing external
   *  selection state. */
  readonly onActiveChange?: (newIndex: number, oldIndex: number) => void;
}

export class RovingTabindex {
  private elements: HTMLElement[] = [];
  private activeIndex = 0;
  private readonly orientation: 'horizontal' | 'vertical' | 'both';
  private readonly wrap: boolean;
  private readonly consume: (e: KeyboardEvent, activeIndex: number) => boolean;
  private readonly onActiveChange:
    | ((newIndex: number, oldIndex: number) => void)
    | undefined;
  private listenerHost: HTMLElement | null = null;

  constructor(options: RovingTabindexOptions = {}) {
    this.orientation = options.orientation ?? 'horizontal';
    this.wrap = options.wrap ?? false;
    this.consume = options.consume ?? (() => true);
    this.onActiveChange = options.onActiveChange;
  }

  /** Attach to a host element that listens for keydown and click events.
   *  The host is typically the toolbar / row container the elements
   *  live in. */
  attach(host: HTMLElement, elements: HTMLElement[]): void {
    this.detach();
    this.listenerHost = host;
    this.setElements(elements);
    host.addEventListener('keydown', this.handleKeyDown);
    host.addEventListener('focusin', this.handleFocusIn);
  }

  detach(): void {
    if (!this.listenerHost) return;
    this.listenerHost.removeEventListener('keydown', this.handleKeyDown);
    this.listenerHost.removeEventListener('focusin', this.handleFocusIn);
    this.listenerHost = null;
  }

  /** Replace the managed element set, preserving the active index where
   *  possible. */
  setElements(elements: HTMLElement[]): void {
    this.elements = elements;
    if (this.activeIndex >= elements.length) {
      this.activeIndex = Math.max(0, elements.length - 1);
    }
    this.applyTabindex();
  }

  /** Programmatically move focus to index `i`. */
  focus(i: number): void {
    if (i < 0 || i >= this.elements.length) return;
    const old = this.activeIndex;
    this.activeIndex = i;
    this.applyTabindex();
    this.elements[i]?.focus();
    if (old !== i) this.onActiveChange?.(i, old);
  }

  /** Currently active element (the one with tabindex=0). */
  active(): HTMLElement | null {
    return this.elements[this.activeIndex] ?? null;
  }

  private applyTabindex(): void {
    for (let i = 0; i < this.elements.length; i++) {
      this.elements[i]!.tabIndex = i === this.activeIndex ? 0 : -1;
    }
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    const horiz = this.orientation === 'horizontal' || this.orientation === 'both';
    const vert = this.orientation === 'vertical' || this.orientation === 'both';

    let delta = 0;
    if (horiz && e.key === 'ArrowRight') delta = 1;
    else if (horiz && e.key === 'ArrowLeft') delta = -1;
    else if (vert && e.key === 'ArrowDown') delta = 1;
    else if (vert && e.key === 'ArrowUp') delta = -1;
    else if (e.key === 'Home') {
      if (!this.consume(e, this.activeIndex)) return;
      this.focus(0);
      e.preventDefault();
      return;
    } else if (e.key === 'End') {
      if (!this.consume(e, this.activeIndex)) return;
      this.focus(this.elements.length - 1);
      e.preventDefault();
      return;
    } else {
      return;
    }

    if (!this.consume(e, this.activeIndex)) return;
    let next = this.activeIndex + delta;
    if (this.wrap) {
      next = (next + this.elements.length) % this.elements.length;
    } else {
      next = Math.max(0, Math.min(this.elements.length - 1, next));
    }
    if (next !== this.activeIndex) {
      this.focus(next);
      e.preventDefault();
    }
  };

  private handleFocusIn = (e: FocusEvent): void => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const idx = this.elements.indexOf(target);
    if (idx >= 0 && idx !== this.activeIndex) {
      const old = this.activeIndex;
      this.activeIndex = idx;
      this.applyTabindex();
      this.onActiveChange?.(idx, old);
    }
  };
}
