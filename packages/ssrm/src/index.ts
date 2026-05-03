// =============================================================================
// @onegrid/ssrm
//
// Server-side row model. Cursor-paged block fetcher with sliding-window LRU
// cache, optimistic mutation queue, server reconciliation, Arrow IPC over
// WebSocket/SSE adapter.
//
// Public API surface (planned). Implementations TODO.
// =============================================================================

import type {
  BlockRequest,
  BlockResponse,
  DataSource,
  FetchOptions,
  Mutation,
  MutationResult,
  Patch,
  Schema,
  Unsubscribe,
} from '@onegrid/protocol';

export interface SsrmTransport {
  readonly request: (req: BlockRequest, opts?: FetchOptions) => Promise<BlockResponse>;
  readonly subscribe?: (onPatch: (patch: Patch) => void, opts?: FetchOptions) => Unsubscribe;
  readonly mutate?: (
    mutations: ReadonlyArray<Mutation>,
    opts?: FetchOptions,
  ) => Promise<MutationResult>;
  readonly schema: () => Promise<Schema> | Schema;
}

export interface SsrmCacheOptions {
  readonly blockSize?: number;
  readonly maxBlocks?: number;
  readonly prefetchAhead?: number;
}

export const createSsrmDataSource = (
  _transport: SsrmTransport,
  _options?: SsrmCacheOptions,
): DataSource => {
  throw new Error('@onegrid/ssrm: createSsrmDataSource is not implemented yet.');
};

export interface WebSocketTransportOptions {
  readonly url: string;
  readonly protocols?: string | ReadonlyArray<string>;
  readonly encoding?: 'arrow-ipc' | 'json';
}

export const createWebSocketTransport = (_options: WebSocketTransportOptions): SsrmTransport => {
  throw new Error('@onegrid/ssrm: createWebSocketTransport is not implemented yet.');
};
