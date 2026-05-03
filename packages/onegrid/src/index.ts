// =============================================================================
// onegrid (umbrella package)
//
// Convenience entry point. Re-exports the most commonly used symbols from
// @onegrid/core and @onegrid/protocol so casual consumers can install a single
// package. Power users import from individual scoped packages directly.
// =============================================================================

export * from '@onegrid/core';
export type * from '@onegrid/protocol';

export const ONEGRID_VERSION = '0.0.1' as const;
