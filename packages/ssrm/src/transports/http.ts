// =============================================================================
// HTTP SSRM transport
//
// Plain `fetch`-based transport. Three endpoints:
//
//   GET  ${baseUrl}/schema                     → Schema
//   POST ${baseUrl}/block      body: BlockRequest → BlockResponse<'json'>
//   POST ${baseUrl}/mutate     body: Mutation[]   → MutationResult
//
// Subscribe is not supported over HTTP — for live updates use the
// WebSocket transport. AbortController integration via `opts.signal`.
//
// Designed for:
//   - localhost development against a mock server
//   - serverless / edge deployments where WebSocket is awkward
//   - any HTTP-fronted backend that already speaks JSON
// =============================================================================

import type {
  BlockRequest,
  BlockResponse,
  FetchOptions,
  Mutation,
  MutationResult,
  Schema,
} from '@onegrid/protocol';
import type { SsrmTransport } from '../types';

export interface HttpTransportOptions {
  /** Base URL, e.g. "http://localhost:3001". No trailing slash. */
  readonly baseUrl: string;
  /** Optional path prefix (default: ""). */
  readonly basePath?: string;
  /** Extra headers (auth tokens, etc.). */
  readonly headers?: Record<string, string>;
  /** Default fetch implementation override (e.g. for SSR). */
  readonly fetchImpl?: typeof fetch;
}

export function createHttpTransport(options: HttpTransportOptions): SsrmTransport {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const base = `${options.baseUrl}${options.basePath ?? ''}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...options.headers,
  };

  async function schema(): Promise<Schema> {
    const res = await fetchImpl(`${base}/schema`, { headers });
    if (!res.ok) throw new Error(`@onegrid/ssrm http: schema ${String(res.status)}`);
    return (await res.json()) as Schema;
  }

  async function request(req: BlockRequest, opts?: FetchOptions): Promise<BlockResponse<'json'>> {
    const res = await fetchImpl(`${base}/block`, {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
      signal: opts?.signal ?? null,
    });
    if (!res.ok) throw new Error(`@onegrid/ssrm http: block ${String(res.status)}`);
    return (await res.json()) as BlockResponse<'json'>;
  }

  async function mutate(
    mutations: ReadonlyArray<Mutation>,
    opts?: FetchOptions,
  ): Promise<MutationResult> {
    const res = await fetchImpl(`${base}/mutate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(mutations),
      signal: opts?.signal ?? null,
    });
    if (!res.ok) throw new Error(`@onegrid/ssrm http: mutate ${String(res.status)}`);
    return (await res.json()) as MutationResult;
  }

  return { request, schema, mutate };
}
