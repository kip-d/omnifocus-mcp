import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { BaseTool } from '../../../../src/tools/base';
import { CacheManager } from '../../../../src/cache/CacheManager';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { ReadSchema } from '../../../../src/tools/unified/schemas/read-schema';

vi.mock('../../../../src/omnifocus/OmniAutomation');
vi.mock('../../../../src/cache/CacheManager');

// A tool whose name carries a wrapper hint (omnifocus_read) so the normalize-then-strict
// front door is exercised end-to-end. executeValidated echoes the validated args so we can
// assert what the strict schema produced.
class ReadEchoTool extends BaseTool<typeof ReadSchema> {
  name = 'omnifocus_read';
  description = 'echo read tool';
  meta = undefined;
  schema = ReadSchema;
  override get inputSchema(): Record<string, unknown> {
    return { type: 'object', properties: { query: { type: 'object' } }, required: ['query'] };
  }
  protected async executeValidated(args: z.infer<typeof ReadSchema>): Promise<unknown> {
    return { echoed: args };
  }
}

describe('BaseTool.execute — normalize-then-strict (OMN-122)', () => {
  let tool: ReadEchoTool;
  beforeEach(() => {
    vi.clearAllMocks();
    tool = new ReadEchoTool(new CacheManager());
  });

  it('canonical input passes through and is NOT normalized', async () => {
    const result = (await tool.execute({ query: { type: 'tasks' } })) as { echoed: unknown };
    expect(result.echoed).toEqual({ query: { type: 'tasks' } });
  });

  it('lifts a root-level wrapper-less envelope and executes successfully', async () => {
    // Model emitted {type:'tasks'} at root instead of {query:{type:'tasks'}}.
    const result = (await tool.execute({ type: 'tasks', mode: 'flagged' })) as { echoed: { query: unknown } };
    expect(result.echoed.query).toMatchObject({ type: 'tasks', mode: 'flagged' });
  });

  it('logs the applied normalization (auditable) when it repairs input', async () => {
    const infoSpy = vi.spyOn(tool['logger'], 'info');
    await tool.execute({ type: 'tasks' });
    const logged = infoSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toMatch(/normaliz/i);
    expect(logged).toMatch(/wrapper-lift/);
  });

  it('un-normalizable input throws the SAME McpError as strict validation', async () => {
    // No discriminant, no wrapper → nothing to repair → original strict error.
    await expect(tool.execute({ limit: 10 })).rejects.toBeInstanceOf(McpError);
  });
});
