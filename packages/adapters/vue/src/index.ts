// =============================================================================
// @onegrid/vue
//
// Vue 3 adapter. Idiomatic composables over the framework-agnostic core.
//
// Public API surface (planned). Implementations TODO.
// =============================================================================

import type { Grid, GridOptions } from '@onegrid/core';
import type { Ref } from 'vue';

/** @beta */
export interface UseOneGridOptions extends Omit<GridOptions, 'container'> {}

/** @beta */
export interface UseOneGridReturn {
  readonly containerRef: Ref<HTMLDivElement | null>;
  readonly grid: Ref<Grid | null>;
}

/** @beta */
export const useOneGrid = (_options: UseOneGridOptions): UseOneGridReturn => {
  throw new Error('@onegrid/vue: useOneGrid is not implemented yet.');
};
