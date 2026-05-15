import { describe, it, expect, vi } from 'vitest';
import {
  createMcpServer,
  type McpGridBridge,
  type JsonRpcRequest,
  MCP_ERR,
} from '../index.js';

function makeBridge(overrides: Partial<McpGridBridge> = {}): McpGridBridge {
  return {
    getColumns: () => [
      { id: 'id', displayName: 'ID', type: 'int32' },
      { id: 'name', displayName: 'Name', type: 'utf8' },
    ],
    getSort: () => [{ columnId: 'name', direction: 'asc' }],
    getFilter: () => null,
    getSelection: () => null,
    getViewport: () => ({
      visibleRowStart: 0,
      visibleRowEnd: 29,
      totalRowCount: 1000,
    }),
    setSort: vi.fn(),
    setFilter: vi.fn(),
    scrollToRow: vi.fn(),
    readBlock: vi.fn(async (start: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({ id: start + i, name: `row-${start + i}` })),
    ),
    selectRange: vi.fn(),
    onMutation: vi.fn(),
    ...overrides,
  };
}

const req = (method: string, params?: unknown, id: number = 1): JsonRpcRequest => ({
  jsonrpc: '2.0',
  id,
  method,
  params,
});

describe('initialize / capabilities', () => {
  it('returns serverInfo + protocol version', async () => {
    const server = createMcpServer({
      bridge: makeBridge(),
      serverInfo: { name: 'test-grid', version: '1.0.0' },
    });
    const r = await server.handle(req('initialize'));
    expect('result' in r).toBe(true);
    if ('result' in r) {
      const result = r.result as { serverInfo: { name: string }; protocolVersion: string };
      expect(result.serverInfo.name).toBe('test-grid');
      expect(result.protocolVersion).toBe('2024-11-05');
    }
  });

  it('rejects unknown methods with -32601', async () => {
    const server = createMcpServer({ bridge: makeBridge() });
    const r = await server.handle(req('bogus/method'));
    expect('error' in r).toBe(true);
    if ('error' in r) {
      expect(r.error.code).toBe(MCP_ERR.METHOD_NOT_FOUND);
    }
  });
});

describe('Resources', () => {
  it('lists six built-in resources', async () => {
    const server = createMcpServer({ bridge: makeBridge() });
    const r = await server.handle(req('resources/list'));
    if ('result' in r) {
      const { resources } = r.result as { resources: ReadonlyArray<{ uri: string }> };
      expect(resources).toHaveLength(6);
      const uris = resources.map((x) => x.uri);
      expect(uris).toContain('grid://columns');
      expect(uris).toContain('grid://row/{rowIndex}');
    }
  });

  it('reads grid://columns', async () => {
    const server = createMcpServer({ bridge: makeBridge() });
    const r = await server.handle(req('resources/read', { uri: 'grid://columns' }));
    if ('result' in r) {
      const { contents } = r.result as { contents: ReadonlyArray<{ uri: string; text: string }> };
      const payload = JSON.parse(contents[0]!.text);
      expect(payload).toEqual([
        { id: 'id', displayName: 'ID', type: 'int32' },
        { id: 'name', displayName: 'Name', type: 'utf8' },
      ]);
    }
  });

  it('reads grid://row/{N} by parameterized URI', async () => {
    const bridge = makeBridge();
    const server = createMcpServer({ bridge });
    const r = await server.handle(req('resources/read', { uri: 'grid://row/42' }));
    expect(bridge.readBlock).toHaveBeenCalledWith(42, 1);
    if ('result' in r) {
      const { contents } = r.result as { contents: ReadonlyArray<{ text: string }> };
      const payload = JSON.parse(contents[0]!.text);
      expect(payload).toEqual({ id: 42, name: 'row-42' });
    }
  });

  it('rejects unknown URIs with NOT_FOUND', async () => {
    const server = createMcpServer({ bridge: makeBridge() });
    const r = await server.handle(req('resources/read', { uri: 'grid://nope' }));
    if ('error' in r) expect(r.error.code).toBe(MCP_ERR.NOT_FOUND);
  });

  it('rejects missing uri param with INVALID_PARAMS', async () => {
    const server = createMcpServer({ bridge: makeBridge() });
    const r = await server.handle(req('resources/read', {}));
    if ('error' in r) expect(r.error.code).toBe(MCP_ERR.INVALID_PARAMS);
  });
});

describe('Tools', () => {
  it('lists six built-in tools', async () => {
    const server = createMcpServer({ bridge: makeBridge() });
    const r = await server.handle(req('tools/list'));
    if ('result' in r) {
      const { tools } = r.result as { tools: ReadonlyArray<{ name: string }> };
      expect(tools.map((t) => t.name).sort()).toEqual([
        'propose_mutation',
        'read_block',
        'scroll_to_row',
        'select_range',
        'set_filter',
        'set_sort',
      ]);
    }
  });

  it('set_sort routes through bridge.setSort', async () => {
    const bridge = makeBridge();
    const server = createMcpServer({ bridge });
    const r = await server.handle(
      req('tools/call', {
        name: 'set_sort',
        arguments: { sort: [{ columnId: 'id', direction: 'desc' }] },
      }),
    );
    expect(bridge.setSort).toHaveBeenCalledWith([{ columnId: 'id', direction: 'desc' }]);
    expect('result' in r).toBe(true);
  });

  it('scroll_to_row routes to bridge.scrollToRow', async () => {
    const bridge = makeBridge();
    const server = createMcpServer({ bridge });
    await server.handle(
      req('tools/call', { name: 'scroll_to_row', arguments: { rowIndex: 500 } }),
    );
    expect(bridge.scrollToRow).toHaveBeenCalledWith(500);
  });

  it('rejects scroll_to_row with non-integer rowIndex', async () => {
    const server = createMcpServer({ bridge: makeBridge() });
    const r = await server.handle(
      req('tools/call', { name: 'scroll_to_row', arguments: { rowIndex: -5 } }),
    );
    if ('error' in r) expect(r.error.code).toBe(MCP_ERR.INVALID_PARAMS);
  });

  it('propose_mutation surfaces a denial throw as DENIED', async () => {
    const bridge = makeBridge({
      onMutation: () => {
        throw new Error('not allowed by policy');
      },
    });
    const server = createMcpServer({ bridge });
    const r = await server.handle(
      req('tools/call', {
        name: 'propose_mutation',
        arguments: { rowKey: 1, columnId: 'name', value: 'New' },
      }),
    );
    if ('error' in r) {
      expect(r.error.code).toBe(MCP_ERR.DENIED);
      expect(r.error.message).toContain('not allowed by policy');
    }
  });

  it('read_block returns rows via the bridge', async () => {
    const bridge = makeBridge();
    const server = createMcpServer({ bridge });
    const r = await server.handle(
      req('tools/call', { name: 'read_block', arguments: { start: 0, count: 3 } }),
    );
    if ('result' in r) {
      const { content } = r.result as { content: ReadonlyArray<{ text: string }> };
      const payload = JSON.parse(content[0]!.text) as { rows: unknown[] };
      expect(payload.rows).toHaveLength(3);
    }
  });

  it('unknown tool name → NOT_FOUND', async () => {
    const server = createMcpServer({ bridge: makeBridge() });
    const r = await server.handle(
      req('tools/call', { name: 'do_nothing', arguments: {} }),
    );
    if ('error' in r) expect(r.error.code).toBe(MCP_ERR.NOT_FOUND);
  });
});
