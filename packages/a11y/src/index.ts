// =============================================================================
// @onegrid/a11y
//
// Framework-agnostic accessibility utilities. Three primitives, all DOM-only:
//
//   LiveAnnouncer  — write to a politeness-tiered live region for screen
//                    reader announcements (validation errors, sort changes,
//                    block-load completions). NVDA + VoiceOver under-support
//                    `aria-errormessage`, so live regions are the lingua
//                    franca for status announcements.
//
//   RovingTabindex — manage a single tab stop across a set of elements
//                    where Left/Right (or Up/Down) arrows move focus. The
//                    canonical pattern from the WAI-ARIA APG. Used by the
//                    floating-filter row, column tool panel, and any other
//                    toolbar-shaped surface.
//
//   ariaCellId     — deterministic id generator for grid cells so
//                    `aria-activedescendant` on the grid root has a stable
//                    target. Produced + parsed by both @onegrid/core
//                    (which mounts the cells) and consumers that need to
//                    drive focus programmatically.
// =============================================================================

export { LiveAnnouncer } from './live-announcer';
export type { Politeness } from './live-announcer';

export { RovingTabindex } from './roving-tabindex';
export type { RovingTabindexOptions } from './roving-tabindex';

export { ariaCellId, parseAriaCellId } from './cell-id';
