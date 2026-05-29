// =============================================================================
// @onegrid/wc
//
// Optional Web Component adapter. Wraps the core in a <one-grid> custom
// element for users who want a framework-free drop-in. NOT the canonical
// public API — power users should reach for the framework adapter or core
// directly.
//
// Public API surface (planned). Implementations TODO.
// =============================================================================

/** @beta */
export const ONE_GRID_TAG_NAME = 'one-grid' as const;

/** @beta */
export const defineOneGridElement = (_tag: string = ONE_GRID_TAG_NAME): void => {
  throw new Error('@onegrid/wc: defineOneGridElement is not implemented yet.');
};
