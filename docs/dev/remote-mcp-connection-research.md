# Connecting Claude Desktop to Remote MCP Servers via HTTP/SSE

## Summary

Claude Desktop's native MCP implementation only supports **stdio transport**—it expects to spawn a local subprocess. To connect to a remote MCP server over HTTP/SSE (e.g., an OmniFocus MCP server running on macOS), a bridge/proxy is required on the client side.

## Problem Statement

We want to run an MCP server on a macOS machine (required for OmniFocus automation) and connect to it from Claude Desktop running on Windows. The server exposes an HTTP/SSE endpoint, but Claude Desktop's `config.json` schema requires a `command` field to spawn a local process.

Attempting to configure an HTTP endpoint directly in `config.json` results in a Zod validation error:

```
ZodError: [
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "undefined",
    "path": ["mcpServers", "omnifocus", "command"],
    "message": "Required"
  }
]
```

## Solutions

### Option 1: mcp-remote (Recommended)

Anthropic provides `mcp-remote`, a lightweight bridge that lets stdio-only MCP clients connect to remote HTTP/SSE servers.

**Installation:** Available via npx (no global install required)

**Configuration (Windows `claude_desktop_config.json`):**

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://<mac-ip>:3000/mcp"
      ]
    }
  }
}
```

> **Note:** Our server uses `/mcp` (Streamable HTTP), not `/sse` (legacy SSE transport).

**Data Flow:**

```
Claude Desktop → stdio → mcp-remote → HTTP/SSE → Mac (OmniFocus MCP Server)
```

**Notes:**
- Designed for OAuth-based auth but works with authless servers
- Described as "an experimental stop-gap until popular MCP clients natively support remote, authorized servers"

### Option 2: supergateway

An alternative stdio-to-SSE bridge.

**Installation:**

```bash
npm install -g supergateway
```

**Configuration:**

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "npx",
      "args": [
        "supergateway",
        "--streamablehttp",
        "http://<mac-ip>:3000/mcp"
      ]
    }
  }
}
```

> **Note:** Use `--streamablehttp` for our server, not `--sse`.

### Option 3: Native Connectors UI

Claude Desktop now supports remote MCP servers through **Settings > Connectors** for Pro/Max/Team/Enterprise plans.

**Important:** Claude Desktop will *not* connect to remote servers configured directly in `claude_desktop_config.json` when using this method. The Connectors UI is the intended path for remote servers.

**Supported transports:**
- SSE-based (may be deprecated in coming months)
- Streamable HTTP-based

**Auth support:**
- Authless servers
- OAuth-based servers (3/26 and 6/18 auth specs)
- Dynamic Client Registration (DCR)

**Limitation:** This approach seems oriented toward public/OAuth-authenticated services rather than internal servers on a local network.

## Recommendation

For internal/development use of the OmniFocus MCP server:

1. Use **mcp-remote via config.json** for simplicity
2. Ensure the Mac's firewall allows connections on the server port
3. Use a static IP or hostname for the Mac that's resolvable from Windows

## Server-Side Requirements

The OmniFocus MCP server must:

1. Run in HTTP/SSE mode (not stdio)
2. Listen on a port accessible from the Windows machine
3. Expose an `/sse` endpoint (or whatever path mcp-remote expects)

## References

- [Building Custom Connectors via Remote MCP Servers](https://support.anthropic.com/en/articles/11503834-building-custom-integrations-via-remote-mcp-servers)
- [Getting Started with Custom Connectors Using Remote MCP](https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)

## Answers to Open Questions

1. **What endpoint path does our OmniFocus MCP server use?**
   - `/mcp` - We use `StreamableHTTPServerTransport` from the MCP SDK
   - Additional endpoints: `/health` (health check), `/sessions` (session stats)

2. **Should we implement any authentication layer for the HTTP endpoint?**
   - Yes, implemented via `MCP_AUTH_TOKEN` environment variable
   - Uses Bearer token authentication
   - See `docs/user/HTTP-TRANSPORT.md` for configuration

3. **Is Streamable HTTP preferable to SSE given Anthropic's deprecation signals?**
   - Yes, we use Streamable HTTP (`StreamableHTTPServerTransport`)
   - SSE may be deprecated in coming months per Anthropic
   - Our implementation is future-proof

---

*Researched: 2024-12-23*
*Updated: 2024-12-23 - Answered open questions, fixed endpoint paths*
