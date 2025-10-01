import { describe, it, expect } from 'vitest';
import { registerTools } from '../../../src/tools/index.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';
import { ListToolsRequestSchema, CallToolRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';

class FakeServer {
  handlers = new Map<any, Function>();
  setRequestHandler(schema: any, handler: Function) {
    this.handlers.set(schema, handler);
  }
}

describe('tools/index registerTools', () => {
  it('registers list and call handlers and exposes 17 tools', async () => {
    const server = new FakeServer() as any;
    const cache = new CacheManager();

    registerTools(server, cache);

    // List tools
    const listHandler = server.handlers.get(ListToolsRequestSchema) as Function;
    expect(listHandler).toBeTypeOf('function');
    const list = await listHandler({});
    expect(Array.isArray(list.tools)).toBe(true);
    expect(list.tools.length).toBe(17);
    const names = list.tools.map((t: any) => t.name);
    expect(names).toContain('system');
    expect(names).toContain('tasks');
    expect(names).toContain('manage_task');
    expect(names).toContain('batch_create');
    expect(names).toContain('parse_meeting_notes');

    // Call unknown tool → McpError
    const callHandler = server.handlers.get(CallToolRequestSchema) as Function;
    await expect(callHandler({ params: { name: 'unknown', arguments: {} } })).rejects.toBeInstanceOf(McpError);
  });
});

