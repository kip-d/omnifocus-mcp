import { describe, it, expect } from 'vitest';
import { registerTools } from '../../../src/tools/index.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { ListToolsRequestSchema, CallToolRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';

type RequestHandler = (request: unknown) => Promise<any>;

class FakeServer {
  handlers = new Map<any, RequestHandler>();
  setRequestHandler(schema: any, handler: RequestHandler) {
    this.handlers.set(schema, handler);
  }
}

describe('tools/index registerTools', () => {
  it('registers list and call handlers and exposes 4 tools (3 unified + system)', async () => {
    const server = new FakeServer() as any;
    const cache = new CacheManager();

    registerTools(server, cache);

    // List tools
    const listHandler = server.handlers.get(ListToolsRequestSchema) as RequestHandler;
    expect(listHandler).toBeTypeOf('function');
    const list = await listHandler({});
    expect(Array.isArray(list.tools)).toBe(true);
    expect(list.tools.length).toBe(4);
    const names = list.tools.map((t: any) => t.name);

    // Check unified builder API tools
    expect(names).toContain('omnifocus_read');
    expect(names).toContain('omnifocus_write');
    expect(names).toContain('omnifocus_analyze');
    expect(names).toContain('system');

    // Ensure only these 4 tools exist
    expect(names).toEqual(['omnifocus_read', 'omnifocus_write', 'omnifocus_analyze', 'system']);

    // Call unknown tool → McpError
    const callHandler = server.handlers.get(CallToolRequestSchema) as RequestHandler;
    await expect(callHandler({ params: { name: 'unknown', arguments: {} } })).rejects.toBeInstanceOf(McpError);
  });

  it('holds tool calls behind the startup gate until it opens (OMN-228)', async () => {
    const server = new FakeServer() as any;
    const cache = new CacheManager();
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });

    registerTools(server, cache, undefined, gate);

    // list_tools must NOT wait for the gate (handshake/tool-discovery stays instant)
    const listHandler = server.handlers.get(ListToolsRequestSchema) as RequestHandler;
    const list = await listHandler({});
    expect(list.tools.length).toBe(4);

    // A tool call issued while the gate is held must not settle...
    const callHandler = server.handlers.get(CallToolRequestSchema) as RequestHandler;
    let settled = false;
    const callPromise = callHandler({ params: { name: 'system', arguments: { operation: 'version' } } }).finally(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);

    // ...and must execute once the gate opens.
    openGate();
    const result = await callPromise;
    expect(settled).toBe(true);
    expect(result.content[0].type).toBe('text');
  });

  it('executes tool calls immediately when no gate is provided (OMN-228)', async () => {
    const server = new FakeServer() as any;
    const cache = new CacheManager();

    registerTools(server, cache);

    const callHandler = server.handlers.get(CallToolRequestSchema) as RequestHandler;
    const result = await callHandler({ params: { name: 'system', arguments: { operation: 'version' } } });
    expect(result.content[0].type).toBe('text');
  });
});
