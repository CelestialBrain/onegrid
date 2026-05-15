// =============================================================================
// @onegrid/mcp
//
// Model Context Protocol surface for oneGrid. MCP (Anthropic, 2024) is a
// transport-agnostic JSON-RPC shape for exposing read-only "resources"
// and side-effecting "tools" to language models.
//
// This package adapts oneGrid's state to MCP without taking a dependency
// on the official SDK — consumers can plug the message-handler into
// whatever MCP server framework they're already running (the official
// `@modelcontextprotocol/sdk-typescript`, a custom transport, an
// embedded LLM eval harness, etc.).
//
// The shape exposed:
//
//   Resources (read-only):
//     grid://columns
//     grid://sort
//     grid://filter
//     grid://selection
//     grid://viewport
//     grid://row/{rowIndex}
//
//   Tools (LLM-callable):
//     set_sort(sort: SortModel)
//     set_filter(filter: FilterModel)
//     scroll_to_row(rowIndex: number)
//     read_block(start: number, count: number)
//     select_range(rowStart, rowEnd, colStart, colEnd)
//     propose_mutation(rowKey, columnId, value)   ← gated via onMutation
//
// Mutations route through a single onMutation hook the host wires up;
// the host decides whether to optimistically apply (v0.0.8 mutator) or
// require confirmation. The grid never auto-applies LLM-proposed edits.
// =============================================================================

import type { FilterModel, SortModel } from '@onegrid/protocol';

// -----------------------------------------------------------------------------
// MCP JSON-RPC primitives (minimal — we don't pin the official SDK shape)
// -----------------------------------------------------------------------------

export interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: number | string | null;
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcResponseOk {
  readonly jsonrpc: '2.0';
  readonly id: number | string | null;
  readonly result: unknown;
}

export interface JsonRpcResponseError {
  readonly jsonrpc: '2.0';
  readonly id: number | string | null;
  readonly error: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
}

export type JsonRpcResponse = JsonRpcResponseOk | JsonRpcResponseError;

// MCP error codes
const ERR_PARSE = -32700;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;
const ERR_INTERNAL = -32603;
const ERR_NOT_FOUND = -32004; // application-level: unknown resource / tool
const ERR_DENIED = -32005; // host rejected the call

// -----------------------------------------------------------------------------
// Grid bridge — what the host provides to the server
// -----------------------------------------------------------------------------

export interface ColumnInfo {
  readonly id: string;
  readonly displayName: string;
  readonly type: string;
}

export interface SelectionInfo {
  readonly rowStart: number;
  readonly rowEnd: number;
  readonly colStart: number;
  readonly colEnd: number;
}

export interface ViewportInfo {
  readonly visibleRowStart: number;
  readonly visibleRowEnd: number;
  readonly totalRowCount: number;
}

export interface ProposedMutation {
  readonly rowKey: string | number;
  readonly columnId: string;
  readonly value: unknown;
  readonly source: 'llm';
}

export interface McpGridBridge {
  /** Schema-level introspection. */
  readonly getColumns: () => ReadonlyArray<ColumnInfo>;
  readonly getSort: () => SortModel;
  readonly getFilter: () => FilterModel | null;
  readonly getSelection: () => SelectionInfo | null;
  readonly getViewport: () => ViewportInfo;

  /** Tools — the grid applies these. */
  readonly setSort: (sort: SortModel) => Promise<void> | void;
  readonly setFilter: (filter: FilterModel | null) => Promise<void> | void;
  readonly scrollToRow: (rowIndex: number) => Promise<void> | void;
  readonly readBlock: (
    start: number,
    count: number,
  ) => Promise<ReadonlyArray<Readonly<Record<string, unknown>>>>;
  readonly selectRange: (range: SelectionInfo) => Promise<void> | void;

  /**
   * LLM-proposed mutation. The host decides whether to apply,
   * defer to human confirmation, or reject. Throw to signal denial;
   * the server surfaces the throw as an MCP error with code -32005.
   */
  readonly onMutation: (m: ProposedMutation) => Promise<void> | void;
}

// -----------------------------------------------------------------------------
// Server
// -----------------------------------------------------------------------------

export interface McpServerOptions {
  readonly bridge: McpGridBridge;
  /**
   * Server identity returned in the MCP `initialize` handshake.
   * Defaults to a generic oneGrid identity.
   */
  readonly serverInfo?: {
    readonly name?: string;
    readonly version?: string;
  };
}

/**
 * Create an MCP message handler. Pass each incoming JSON-RPC
 * request through `handle(req)`; it returns the matching
 * response. Stateless across calls except for the bridge state
 * the host owns.
 */
export function createMcpServer(opts: McpServerOptions): {
  readonly handle: (req: JsonRpcRequest) => Promise<JsonRpcResponse>;
  readonly listTools: () => ReadonlyArray<{
    readonly name: string;
    readonly description: string;
    readonly inputSchema: object;
  }>;
  readonly listResources: () => ReadonlyArray<{
    readonly uri: string;
    readonly description: string;
  }>;
} {
  const bridge = opts.bridge;
  const serverInfo = {
    name: opts.serverInfo?.name ?? 'onegrid-mcp',
    version: opts.serverInfo?.version ?? '0.0.11',
  };

  const tools = buildToolDescriptors();
  const resources = buildResourceDescriptors();

  async function handle(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      switch (req.method) {
        case 'initialize':
          return ok(req.id, {
            protocolVersion: '2024-11-05',
            serverInfo,
            capabilities: { tools: {}, resources: {} },
          });
        case 'tools/list':
          return ok(req.id, { tools });
        case 'resources/list':
          return ok(req.id, { resources });
        case 'resources/read':
          return await handleResourcesRead(req, bridge);
        case 'tools/call':
          return await handleToolsCall(req, bridge);
        default:
          return err(req.id, ERR_METHOD_NOT_FOUND, `unknown method '${req.method}'`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return err(req.id, ERR_INTERNAL, msg);
    }
  }

  return {
    handle,
    listTools: () => tools,
    listResources: () => resources,
  };
}

// -----------------------------------------------------------------------------
// Resource handlers
// -----------------------------------------------------------------------------

async function handleResourcesRead(
  req: JsonRpcRequest,
  bridge: McpGridBridge,
): Promise<JsonRpcResponse> {
  const params = req.params as { uri?: string } | undefined;
  const uri = params?.uri;
  if (!uri || typeof uri !== 'string') {
    return err(req.id, ERR_INVALID_PARAMS, "missing 'uri'");
  }
  if (uri === 'grid://columns') {
    return resourceOk(req.id, uri, bridge.getColumns());
  }
  if (uri === 'grid://sort') {
    return resourceOk(req.id, uri, bridge.getSort());
  }
  if (uri === 'grid://filter') {
    return resourceOk(req.id, uri, bridge.getFilter());
  }
  if (uri === 'grid://selection') {
    return resourceOk(req.id, uri, bridge.getSelection());
  }
  if (uri === 'grid://viewport') {
    return resourceOk(req.id, uri, bridge.getViewport());
  }
  const rowMatch = /^grid:\/\/row\/(\d+)$/.exec(uri);
  if (rowMatch) {
    const idx = Number(rowMatch[1]);
    const block = await bridge.readBlock(idx, 1);
    return resourceOk(req.id, uri, block[0] ?? null);
  }
  return err(req.id, ERR_NOT_FOUND, `unknown resource '${uri}'`);
}

function resourceOk(
  id: JsonRpcRequest['id'],
  uri: string,
  value: unknown,
): JsonRpcResponseOk {
  return ok(id, {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(value),
      },
    ],
  });
}

// -----------------------------------------------------------------------------
// Tool handlers
// -----------------------------------------------------------------------------

async function handleToolsCall(
  req: JsonRpcRequest,
  bridge: McpGridBridge,
): Promise<JsonRpcResponse> {
  const params = req.params as
    | { name?: string; arguments?: Record<string, unknown> }
    | undefined;
  const name = params?.name;
  const args = params?.arguments ?? {};
  if (!name) return err(req.id, ERR_INVALID_PARAMS, "missing tool 'name'");
  try {
    switch (name) {
      case 'set_sort': {
        const sort = args['sort'];
        if (!Array.isArray(sort)) {
          return err(req.id, ERR_INVALID_PARAMS, "'sort' must be a SortModel array");
        }
        await bridge.setSort(sort as SortModel);
        return toolOk(req.id, { applied: true });
      }
      case 'set_filter': {
        const filter = args['filter'] as FilterModel | null | undefined;
        await bridge.setFilter(filter ?? null);
        return toolOk(req.id, { applied: true });
      }
      case 'scroll_to_row': {
        const r = Number(args['rowIndex']);
        if (!Number.isInteger(r) || r < 0) {
          return err(req.id, ERR_INVALID_PARAMS, "'rowIndex' must be a non-negative integer");
        }
        await bridge.scrollToRow(r);
        return toolOk(req.id, { scrolledTo: r });
      }
      case 'read_block': {
        const start = Number(args['start'] ?? 0);
        const count = Number(args['count'] ?? 100);
        const rows = await bridge.readBlock(start, count);
        return toolOk(req.id, { rows });
      }
      case 'select_range': {
        const range: SelectionInfo = {
          rowStart: Number(args['rowStart']),
          rowEnd: Number(args['rowEnd']),
          colStart: Number(args['colStart']),
          colEnd: Number(args['colEnd']),
        };
        await bridge.selectRange(range);
        return toolOk(req.id, { selected: range });
      }
      case 'propose_mutation': {
        const rowKey = args['rowKey'] as string | number;
        const columnId = String(args['columnId'] ?? '');
        const value = args['value'];
        if (rowKey === undefined || !columnId) {
          return err(req.id, ERR_INVALID_PARAMS, "missing rowKey/columnId");
        }
        await bridge.onMutation({ rowKey, columnId, value, source: 'llm' });
        return toolOk(req.id, { proposed: true });
      }
      default:
        return err(req.id, ERR_NOT_FOUND, `unknown tool '${name}'`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(req.id, ERR_DENIED, msg);
  }
}

function toolOk(id: JsonRpcRequest['id'], value: unknown): JsonRpcResponseOk {
  return ok(id, {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value),
      },
    ],
  });
}

// -----------------------------------------------------------------------------
// Tool / resource descriptors (returned by tools/list, resources/list)
// -----------------------------------------------------------------------------

function buildToolDescriptors() {
  return [
    {
      name: 'set_sort',
      description: 'Apply a sort model to the grid. Replaces the current sort.',
      inputSchema: {
        type: 'object',
        properties: {
          sort: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                columnId: { type: 'string' },
                direction: { enum: ['asc', 'desc'] },
              },
              required: ['columnId', 'direction'],
            },
          },
        },
        required: ['sort'],
      },
    },
    {
      name: 'set_filter',
      description:
        'Apply a filter to the grid. Pass null to clear. Uses oneGrid protocol FilterModel.',
      inputSchema: {
        type: 'object',
        properties: { filter: {} },
      },
    },
    {
      name: 'scroll_to_row',
      description: 'Scroll the viewport so the row at the given index is visible.',
      inputSchema: {
        type: 'object',
        properties: { rowIndex: { type: 'integer', minimum: 0 } },
        required: ['rowIndex'],
      },
    },
    {
      name: 'read_block',
      description: 'Read a contiguous block of rows starting at `start`.',
      inputSchema: {
        type: 'object',
        properties: {
          start: { type: 'integer', minimum: 0 },
          count: { type: 'integer', minimum: 1 },
        },
        required: ['start', 'count'],
      },
    },
    {
      name: 'select_range',
      description: 'Set the active selection to the given rectangular range.',
      inputSchema: {
        type: 'object',
        properties: {
          rowStart: { type: 'integer' },
          rowEnd: { type: 'integer' },
          colStart: { type: 'integer' },
          colEnd: { type: 'integer' },
        },
        required: ['rowStart', 'rowEnd', 'colStart', 'colEnd'],
      },
    },
    {
      name: 'propose_mutation',
      description:
        'Propose an edit to a single cell. The host decides whether to apply, queue for human review, or reject. Never auto-applied.',
      inputSchema: {
        type: 'object',
        properties: {
          rowKey: {},
          columnId: { type: 'string' },
          value: {},
        },
        required: ['rowKey', 'columnId', 'value'],
      },
    },
  ];
}

function buildResourceDescriptors() {
  return [
    { uri: 'grid://columns', description: 'Column schema (id, displayName, type)' },
    { uri: 'grid://sort', description: 'Current sort model' },
    { uri: 'grid://filter', description: 'Current filter model (null if none)' },
    { uri: 'grid://selection', description: 'Active selection rectangle' },
    { uri: 'grid://viewport', description: 'Visible row range + total row count' },
    {
      uri: 'grid://row/{rowIndex}',
      description: 'Single row by index (parameterized resource)',
    },
  ];
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function ok(id: JsonRpcRequest['id'], result: unknown): JsonRpcResponseOk {
  return { jsonrpc: '2.0', id, result };
}

function err(
  id: JsonRpcRequest['id'],
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponseError {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}

// Re-export the JSON-RPC error code constants for adopters who want to
// match against them (e.g. for retry vs surface-to-user decisions).
export const MCP_ERR = {
  PARSE: ERR_PARSE,
  METHOD_NOT_FOUND: ERR_METHOD_NOT_FOUND,
  INVALID_PARAMS: ERR_INVALID_PARAMS,
  INTERNAL: ERR_INTERNAL,
  NOT_FOUND: ERR_NOT_FOUND,
  DENIED: ERR_DENIED,
} as const;
