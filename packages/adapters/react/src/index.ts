// =============================================================================
// @onegrid/react
//
// React adapter. Idiomatic hooks over the framework-agnostic core. Owns no
// state — delegates to @onegrid/core's signal substrate.
//
// Public API surface (planned). Implementations TODO.
// =============================================================================

import type { ColumnDef, Grid, GridOptions } from '@onegrid/core';
import type { ReactNode, RefObject } from 'react';

export interface UseOneGridOptions extends Omit<GridOptions, 'container'> {
  readonly className?: string;
}

export interface UseOneGridReturn {
  readonly ref: RefObject<HTMLDivElement | null>;
  readonly grid: Grid | null;
}

export const useOneGrid = (_options: UseOneGridOptions): UseOneGridReturn => {
  throw new Error('@onegrid/react: useOneGrid is not implemented yet.');
};

export interface OneGridProps extends UseOneGridOptions {
  readonly children?: ReactNode;
}

export const OneGrid = (_props: OneGridProps): ReactNode => {
  throw new Error('@onegrid/react: <OneGrid /> is not implemented yet.');
};

export type { ColumnDef, Grid, GridOptions };
