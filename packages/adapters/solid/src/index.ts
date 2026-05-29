// =============================================================================
// @onegrid/solid
//
// Solid.js adapter. Idiomatic primitives over the framework-agnostic core.
// Solid's signals align directly with oneGrid's reactive substrate.
//
// Public API surface (planned). Implementations TODO.
// =============================================================================

import type { Grid, GridOptions } from '@onegrid/core';

/** @beta */
export interface CreateOneGridOptions extends Omit<GridOptions, 'container'> {}

/** @beta */
export interface CreateOneGridReturn {
  readonly ref: (el: HTMLDivElement) => void;
  readonly grid: () => Grid | null;
}

/** @beta */
export const createOneGrid = (_options: CreateOneGridOptions): CreateOneGridReturn => {
  throw new Error('@onegrid/solid: createOneGrid is not implemented yet.');
};
