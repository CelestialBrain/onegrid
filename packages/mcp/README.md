# @onegrid/mcp

Model Context Protocol server surface for oneGrid. Exposes the grid's
state through MCP `resources` and side-effecting `tools` so a language
model can read filters / sorts / selections and propose mutations
through a standardized contract.

MCP (Model Context Protocol) is Anthropic's JSON-RPC shape for
LLM ↔ tool integration. We don't take a dependency on the official
SDK — plug `createMcpServer().handle(req)` into whatever transport
you're already running (`@modelcontextprotocol/sdk-typescript`, a
custom WebSocket, an embedded eval harness, etc.).

## Surface

**Resources** (read-only):

| URI                       | What                                          |
| ------------------------- | --------------------------------------------- |
| `grid://columns`          | Column schema (id, displayName, type)         |
| `grid://sort`             | Current sort model                            |
| `grid://filter`           | Current filter model (null = none)            |
| `grid://selection`        | Active selection rectangle                    |
| `grid://viewport`         | Visible row range + total row count           |
| `grid://row/{rowIndex}`   | Single row by index                           |

**Tools** (LLM-callable):

| Name                | Effect                                                      |
| ------------------- | ----------------------------------------------------------- |
| `set_sort`          | Replace the current sort model                              |
| `set_filter`        | Apply a filter (pass null to clear)                         |
| `scroll_to_row`     | Bring a row into view                                       |
| `read_block`        | Read N contiguous rows starting at `start`                  |
| `select_range`      | Set the active rectangular selection                        |
| `propose_mutation`  | Suggest a single-cell edit (host decides whether to apply)  |

## Quickstart

```ts
import { createMcpServer } from '@onegrid/mcp';

const server = createMcpServer({
  bridge: {
    getColumns: () => grid.getColumns().map((c) => ({
      id: c.id, displayName: c.displayName ?? c.id, type: c.type,
    })),
    getSort: () => sortRef.current,
    getFilter: () => filterRef.current,
    getSelection: () => grid.getSelection(),
    getViewport: () => ({ /* ... */ }),
    setSort: (sort) => setSort(sort),
    setFilter: (filter) => setFilter(filter),
    scrollToRow: (i) => grid.scrollToRow(i),
    readBlock: async (start, count) => readBlockFromRowSource(start, count),
    selectRange: (range) => grid.selectRange(range),
    onMutation: async (m) => {
      // host decides — apply, queue for review, or throw to deny
      if (!policy.allows(m)) throw new Error('not allowed by policy');
      await mutator.apply([{ ...m, clientId: crypto.randomUUID() }]);
    },
  },
  serverInfo: { name: 'my-grid-mcp', version: '1.0.0' },
});

// In your MCP transport:
transport.onRequest = async (req) => server.handle(req);
```

## Mutation discipline

`propose_mutation` always routes through `bridge.onMutation`. The grid
**never** auto-applies an LLM-proposed edit. The host's `onMutation`
hook decides whether to:

- Apply optimistically (route into the v0.0.8 optimistic mutator)
- Queue for human confirmation
- Deny (throw — server returns MCP error code -32005 `DENIED`)

This is a deliberate design choice. Auto-applying LLM edits to live
data is dangerous; making the application path explicit means the
host owns the safety policy.

## Error codes

JSON-RPC + MCP application codes:

| Code      | Constant            | Meaning                              |
| --------- | ------------------- | ------------------------------------ |
| `-32601`  | `METHOD_NOT_FOUND`  | Unknown JSON-RPC method              |
| `-32602`  | `INVALID_PARAMS`    | Tool/resource arg failed validation  |
| `-32603`  | `INTERNAL`          | Server-side throw                    |
| `-32004`  | `NOT_FOUND`         | Unknown resource URI or tool name    |
| `-32005`  | `DENIED`            | Host rejected the action             |

Exported as `MCP_ERR.<NAME>` for adopters who want to switch on them.

## License

MIT
