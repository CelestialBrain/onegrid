// =============================================================================
// @onegrid/migrate
//
// AST-based codemod that translates other grids' column definitions to
// oneGrid ColumnDef. The first source supported is the AG-Grid-style
// `ColDef` shape (single most common in the wild); TanStack Table's
// `ColumnDef` follows.
//
// CLEAN-ROOM PROVENANCE
// ---------------------
// Every prop mapping below is sourced from publicly-described
// configuration shapes — what `field`, `headerName`, `cellRenderer`
// etc. mean is documented on third-party project websites and in
// trade press. No third-party source code, type definitions, or
// non-public docs are consulted. New mappings must include a
// // SOURCE: <public-url> comment so the provenance is self-evident.
//
// Run via the CLI:
//   pnpm exec onegrid-migrate transform src/columns.tsx --source ag-grid
//   pnpm exec onegrid-migrate transform src/columns.tsx --source tanstack
//
// Or programmatically:
//   import { transform } from '@onegrid/migrate';
//   const { output, todos } = transform(input, { source: 'ag-grid' });
// =============================================================================

import { transform as runTransform } from './transforms/ag-grid';
import { transform as runTanStack } from './transforms/tanstack';

/** @public */
export type SourceLibrary = 'ag-grid' | 'tanstack';

/** @public */
export interface TransformOptions {
  readonly source: SourceLibrary;
}

/** @public */
export interface TransformResult {
  /** Rewritten source. Identical to input when nothing matched. */
  readonly output: string;
  /** Translations the transformer flagged as ambiguous. Each entry
   *  becomes a leading comment in the output for the developer to
   *  review. */
  readonly todos: ReadonlyArray<{
    readonly line: number;
    readonly message: string;
  }>;
}

/** @public */
export function transform(input: string, options: TransformOptions): TransformResult {
  switch (options.source) {
    case 'ag-grid':
      return runTransform(input);
    case 'tanstack':
      return runTanStack(input);
    default: {
      const exhaustive: never = options.source;
      throw new Error(`Unknown source library: ${String(exhaustive)}`);
    }
  }
}
