// =============================================================================
// LiveAnnouncer
//
// A pair of off-screen live regions (polite + assertive) that announce
// messages to screen readers without affecting visual layout. Two regions
// because alternating between two nodes per politeness tier prevents
// NVDA from coalescing rapid announcements into one.
//
// Why a dedicated utility instead of inline aria-live attributes:
//   - Some NVDA/JAWS combinations skip the first announcement on a region
//     that mounts simultaneously with its initial text. Toggling text
//     across two pre-mounted nodes sidesteps this.
//   - VoiceOver requires a measurable delay between consecutive
//     announcements; we coalesce duplicates within a 100ms window.
//   - aria-errormessage is poorly supported in NVDA/VO as of 2026, so
//     validation errors fall back to a polite announcement here.
// =============================================================================

export type Politeness = 'polite' | 'assertive';

export class LiveAnnouncer {
  private readonly host: HTMLElement;
  private readonly politeNodes: [HTMLDivElement, HTMLDivElement];
  private readonly assertiveNodes: [HTMLDivElement, HTMLDivElement];
  private politeFlip = 0;
  private assertiveFlip = 0;
  private lastMessage = '';
  private lastMessageAt = 0;
  private destroyed = false;

  constructor(host: HTMLElement = document.body) {
    this.host = host;
    this.politeNodes = [
      this.createRegion('polite'),
      this.createRegion('polite'),
    ];
    this.assertiveNodes = [
      this.createRegion('assertive'),
      this.createRegion('assertive'),
    ];
  }

  /** Write a message to the appropriate live region. Repeated identical
   *  messages within 100ms are coalesced — screen readers re-announce
   *  the same text otherwise, which feels noisy. */
  announce(message: string, politeness: Politeness = 'polite'): void {
    if (this.destroyed) return;
    const trimmed = message.trim();
    if (!trimmed) return;
    const now = performance.now();
    if (trimmed === this.lastMessage && now - this.lastMessageAt < 100) return;
    this.lastMessage = trimmed;
    this.lastMessageAt = now;

    const nodes = politeness === 'assertive' ? this.assertiveNodes : this.politeNodes;
    const flipKey: 'politeFlip' | 'assertiveFlip' =
      politeness === 'assertive' ? 'assertiveFlip' : 'politeFlip';
    const idx = this[flipKey];
    const node = nodes[idx]!;
    const other = nodes[1 - idx]!;
    other.textContent = '';
    node.textContent = trimmed;
    this[flipKey] = (idx + 1) % 2;
  }

  destroy(): void {
    this.destroyed = true;
    for (const n of [...this.politeNodes, ...this.assertiveNodes]) n.remove();
  }

  private createRegion(politeness: Politeness): HTMLDivElement {
    const el = document.createElement('div');
    el.setAttribute('aria-live', politeness);
    el.setAttribute('aria-atomic', 'true');
    el.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
    el.style.cssText =
      'position:absolute;left:-10000px;top:-10000px;width:1px;height:1px;overflow:hidden;';
    this.host.appendChild(el);
    return el;
  }
}
