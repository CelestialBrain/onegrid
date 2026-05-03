// =============================================================================
// WebSocket SSRM transport
//
// A minimal but correct WebSocket-backed transport. Wire format is JSON;
// Arrow IPC support is planned and will negotiate via a handshake.
// Each request is correlated by a client-generated `requestId`; responses
// match by id. Subscriptions use a single open channel and receive
// `patch` messages until unsubscribed.
//
// Reconnection: exponential backoff on close (200ms, 400ms, ..., capped at
// 30s). In-flight requests are rejected on disconnect; the consumer should
// retry once the connection re-establishes (the SsrmDataSource's cache
// makes this cheap on reconnect).
//
// Wire protocol — client → server:
//   { kind: 'request' | 'mutate' | 'subscribe' | 'unsubscribe' | 'schema',
//     requestId, payload? }
//
// Wire protocol — server → client:
//   { kind: 'response' | 'mutate-response' | 'patch' | 'schema' | 'error',
//     requestId?, payload?, code?, message? }
//
// =============================================================================

import type {
  BlockRequest,
  BlockResponse,
  FetchOptions,
  Mutation,
  MutationResult,
  Patch,
  Schema,
  Unsubscribe,
} from '@onegrid/protocol';
import type { SsrmTransport } from '../types';

export interface WebSocketTransportOptions {
  readonly url: string | URL;
  readonly protocols?: string | ReadonlyArray<string>;
  /** Default: 'json'. 'arrow-ipc' is reserved for v0.1+. */
  readonly encoding?: 'json' | 'arrow-ipc';
  /** Initial backoff in ms. Default 200. */
  readonly backoffStartMs?: number;
  /** Maximum backoff in ms. Default 30000. */
  readonly backoffMaxMs?: number;
  /** WebSocket implementation override (e.g., for tests). Defaults to globalThis.WebSocket. */
  readonly webSocketImpl?: typeof WebSocket;
}

interface OutboundEnvelope {
  readonly kind: 'request' | 'mutate' | 'subscribe' | 'unsubscribe' | 'schema';
  readonly requestId: string;
  readonly payload?: unknown;
}

interface InboundEnvelope {
  readonly kind: 'response' | 'mutate-response' | 'patch' | 'schema' | 'error';
  readonly requestId?: string;
  readonly payload?: unknown;
  readonly code?: string;
  readonly message?: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export function createWebSocketTransport(options: WebSocketTransportOptions): SsrmTransport {
  const Impl = options.webSocketImpl ?? (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  if (!Impl) {
    throw new Error(
      '@onegrid/ssrm: no WebSocket implementation available. Pass `webSocketImpl` for non-browser environments.',
    );
  }

  const url = options.url.toString();
  const protocols = options.protocols;
  const backoffStart = options.backoffStartMs ?? 200;
  const backoffMax = options.backoffMaxMs ?? 30000;

  let socket: WebSocket | null = null;
  let connecting: Promise<WebSocket> | null = null;
  let backoff = backoffStart;
  let closed = false;
  let nextId = 0;

  const pending = new Map<string, PendingRequest>();
  const subscribers = new Set<(patch: Patch) => void>();

  function send(envelope: OutboundEnvelope): void {
    if (!socket || socket.readyState !== Impl!.OPEN) {
      throw new Error('@onegrid/ssrm WebSocket: socket not open.');
    }
    socket.send(JSON.stringify(envelope));
  }

  function nextRequestId(): string {
    nextId += 1;
    return `r${nextId}`;
  }

  function handleMessage(data: string): void {
    let envelope: InboundEnvelope;
    try {
      envelope = JSON.parse(data) as InboundEnvelope;
    } catch (err) {
      // Drop unparseable frames.
      console.error('@onegrid/ssrm WebSocket: invalid JSON frame', err);
      return;
    }

    if (envelope.kind === 'patch') {
      const patch = envelope.payload as Patch;
      for (const fn of subscribers) {
        try {
          fn(patch);
        } catch (err) {
          console.error('@onegrid/ssrm WebSocket: subscriber threw', err);
        }
      }
      return;
    }

    const id = envelope.requestId;
    if (!id) return;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);

    if (envelope.kind === 'error') {
      const err: Error & { code?: string } = new Error(
        envelope.message ?? 'SSRM transport error',
      );
      if (envelope.code) err.code = envelope.code;
      entry.reject(err);
      return;
    }

    entry.resolve(envelope.payload);
  }

  function ensureConnected(): Promise<WebSocket> {
    if (closed) return Promise.reject(new Error('@onegrid/ssrm WebSocket: closed.'));
    if (socket && socket.readyState === Impl!.OPEN) return Promise.resolve(socket);
    if (connecting) return connecting;

    connecting = new Promise<WebSocket>((resolve, reject) => {
      const ws = protocols ? new Impl!(url, protocols as string[]) : new Impl!(url);

      ws.addEventListener('open', () => {
        backoff = backoffStart;
        socket = ws;
        connecting = null;
        resolve(ws);
      });

      ws.addEventListener('message', (e: MessageEvent) => {
        if (typeof e.data === 'string') {
          handleMessage(e.data);
        }
      });

      ws.addEventListener('close', () => {
        socket = null;
        connecting = null;

        // Reject anything still in flight; consumers should retry.
        for (const entry of pending.values()) {
          entry.reject(new Error('@onegrid/ssrm WebSocket: closed before response.'));
        }
        pending.clear();

        if (closed) return;

        const delay = Math.min(backoff, backoffMax);
        backoff = Math.min(backoff * 2, backoffMax);
        setTimeout(() => {
          if (!closed) ensureConnected().catch(() => undefined);
        }, delay);
      });

      ws.addEventListener('error', (err) => {
        connecting = null;
        reject(err instanceof Event ? new Error('WebSocket error') : err);
      });
    });

    return connecting;
  }

  async function call<T>(
    kind: OutboundEnvelope['kind'],
    payload: unknown,
    opts?: FetchOptions,
  ): Promise<T> {
    await ensureConnected();
    const requestId = nextRequestId();

    const promise = new Promise<T>((resolve, reject) => {
      pending.set(requestId, {
        resolve: (value) => {
          resolve(value as T);
        },
        reject,
      });
    });

    if (opts?.signal) {
      if (opts.signal.aborted) {
        pending.delete(requestId);
        throw new DOMException('aborted', 'AbortError');
      }
      opts.signal.addEventListener('abort', () => {
        const entry = pending.get(requestId);
        if (entry) {
          pending.delete(requestId);
          entry.reject(new DOMException('aborted', 'AbortError'));
        }
      });
    }

    send({ kind, requestId, payload });

    return promise;
  }

  const request = (req: BlockRequest, opts?: FetchOptions): Promise<BlockResponse> =>
    call<BlockResponse>('request', req, opts);

  const schema = (): Promise<Schema> => call<Schema>('schema', undefined);

  const subscribe = (onPatch: (patch: Patch) => void): Unsubscribe => {
    subscribers.add(onPatch);
    if (subscribers.size === 1) {
      void ensureConnected().then(() => {
        try {
          send({ kind: 'subscribe', requestId: nextRequestId() });
        } catch {
          // Will retry on reconnect.
        }
      });
    }
    return () => {
      subscribers.delete(onPatch);
      if (subscribers.size === 0 && socket && socket.readyState === Impl!.OPEN) {
        try {
          send({ kind: 'unsubscribe', requestId: nextRequestId() });
        } catch {
          // best-effort
        }
      }
    };
  };

  const mutate = (
    mutations: ReadonlyArray<Mutation>,
    opts?: FetchOptions,
  ): Promise<MutationResult> => call<MutationResult>('mutate', mutations, opts);

  const close = (): void => {
    closed = true;
    if (socket) {
      try {
        socket.close();
      } catch {
        // ignore
      }
      socket = null;
    }
    pending.clear();
    subscribers.clear();
  };

  // Eager connect for snappy first request.
  void ensureConnected().catch(() => undefined);

  if (options.encoding && options.encoding !== 'json') {
    // Reserved for future negotiation.
    console.warn(
      `@onegrid/ssrm WebSocket: encoding=${options.encoding} not yet implemented; falling back to JSON.`,
    );
  }

  return { request, schema, subscribe, mutate, close };
}
