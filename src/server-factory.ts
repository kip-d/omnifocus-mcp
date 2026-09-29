// eslint-disable-next-line sonarjs/deprecation -- Server required until MCP SDK supports inputSchema on McpServer
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { getVersionInfo } from './utils/version.js';

/**
 * The one MCP `Server` construction, shared by stdio mode and every HTTP
 * session (OMN-347: the metadata literal was copied into both). Tools and
 * prompts are registered by the caller.
 */
// eslint-disable-next-line sonarjs/deprecation
export function createMcpServer(): Server {
  const versionInfo = getVersionInfo();
  // eslint-disable-next-line sonarjs/deprecation
  return new Server(
    {
      name: 'omnifocus-mcp-cached',
      version: versionInfo.version,
      description:
        'MCP server for OmniFocus task management with GTD-optimized workflows, analytics, and batch operations',
      websiteUrl: 'https://github.com/kip-d/omnifocus-mcp',
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
      },
    },
  );
}
