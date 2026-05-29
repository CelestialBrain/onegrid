// =============================================================================
// @onegrid/angular
//
// Angular adapter. Standalone component + signals integration over the
// framework-agnostic core.
//
// Public API surface (planned). Implementations TODO.
// =============================================================================

import type { Grid } from '@onegrid/core';

export declare class OneGridComponent {
  readonly grid: Grid | null;
}

/** @beta */
export const ANGULAR_ADAPTER_NOT_IMPLEMENTED = (): never => {
  throw new Error('@onegrid/angular: implementation pending.');
};
