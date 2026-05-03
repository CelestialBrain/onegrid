// =============================================================================
// @onegrid/svelte
//
// Svelte 5 adapter. Idiomatic factory using runes over the framework-agnostic
// core.
//
// Public API surface (planned). Implementations TODO.
// =============================================================================

import type { Grid, GridOptions } from '@onegrid/core';

export interface CreateOneGridOptions extends Omit<GridOptions, 'container'> {}

export const createOneGrid = (_options: CreateOneGridOptions): Grid => {
  throw new Error('@onegrid/svelte: createOneGrid is not implemented yet.');
};
