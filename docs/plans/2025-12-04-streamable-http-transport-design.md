# Streamable HTTP Transport Design

**Date:** 2025-12-04
**Status:** Approved
**Author:** Claude (with Kip)

---

## Summary

Add optional Streamable HTTP transport to the OmniFocus MCP server, enabling:
- Remote access to OmniFocus from any device on a Tailscale network (e.g., Windows → Mac)
- Foundation for streaming tool responses (Phase 2)
- Multiple concurrent client connections to a single OmniFocus instance

## Motivation

The current stdio transport requires the MCP client to run on the same machine as OmniFocus. With Streamable HTTP:
- A Windows machine running Claude Desktop can connect to OmniFocus running on a Mac via Tailscale
- Beta testers using the server for development task management get better accessibility
- Future streaming support enables progress updates for long-running analytics

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| CLI interface | `--http --port 3000` flag | Simple, discoverable, consistent with Node conventions |
| HTTP framework | Native `http` module | Zero dependencies, supply chain security, SDK works with native types |
| Authentication | Optional bearer token via `MCP_AUTH_TOKEN` | Defense-in-depth for Tailscale users who want it |
| Session management | Stateful sessions | Required by MCP spec, enables Phase 2 streaming |
| Streaming | Deferred to Phase 2 | Get transport working first, architecture supports extension |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  src/index.ts                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  CLI argument parsing (--http, --port)              │   │
│  └─────────────────┬───────────────────────────────────┘   │
│                    │                                        │
│         ┌─────────┴─────────┐                              │
│         ▼                   ▼                              │
│  ┌─────────────┐    ┌──────────────┐                       │
│  │ stdio mode  │    │  HTTP mode   │                       │
│  │ (current)   │    │  (new)       │                       │
│  └─────────────┘    └──────┬───────┘                       │
│                            │                                │
│                    ┌───────▼────────┐                       │
│                    │ SessionManager │                       │
│                    │ (new)          │                       │
│                    └───────┬────────┘                       │
│                            │                                │
│         ┌──────────────────┼──────────────────┐            │
│         ▼                  ▼                  ▼            │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐        │
│  │ Session 1  │    │ Session 2  │    │ Session N  │        │
│  │ Transport  │    │ Transport  │    │ Transport  │        │
│  └────────────┘    └────────────┘    └────────────┘        │
│                            │                                │
│                    ┌───────▼────────┐                       │
│                    │  Shared Cache  │  (process-level)      │
│                    │  & Tools       │                       │
│                    └────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

**Key Principle:** The `CacheManager` and registered tools are shared across all sessions. Only the transport layer differs per session. Each session gets its own `Server` instance (MCP SDK requirement).

## HTTP Endpoints (MCP Spec 2025-06-18)

| Path | Method | Purpose |
|------|--------|---------|
| `/mcp` | POST | JSON-RPC requests/notifications |
| `/mcp` | GET | SSE stream for server→client messages |
| `/mcp` | DELETE | Session termination |
| `/health` | GET | Health check (our addition, returns `{"status":"ok"}`) |

**Headers (handled by SDK transport):**
- `MCP-Protocol-Version: 2025-06-18` - Client must send
- `Mcp-Session-Id` - Server assigns on init, client includes thereafter
- `Accept: application/json, text/event-stream` - Client specifies
- `Authorization: Bearer <token>` - When `MCP_AUTH_TOKEN` is configured

## CLI Interface

```bash
# Current stdio mode (unchanged)
node dist/index.js

# New HTTP mode
node dist/index.js --http [--port 3000] [--host 0.0.0.0]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--http` | (none) | Enable HTTP transport instead of stdio |
| `--port` | `3000` | HTTP server port |
| `--host` | `0.0.0.0` | Bind address (`127.0.0.1` for local-only) |

**Environment Variables:**

| Variable | Purpose |
|----------|---------|
| `MCP_AUTH_TOKEN` | Bearer token for authentication (optional) |
| `MCP_PORT` | Alternative to `--port` flag |
| `MCP_HOST` | Alternative to `--host` flag |

## Session Management

```typescript
interface Session {
  id: string;
  transport: StreamableHTTPServerTransport;
  server: Server;
  createdAt: Date;
  lastActivity: Date;
}
```

**Session Lifecycle:**
- Created when no `Mcp-Session-Id` header or unknown ID
- Each session gets its own `Server` instance
- All sessions share the same `CacheManager`
- Idle timeout: 30 minutes (configurable)
- Explicit DELETE request closes session immediately
- Server shutdown closes all sessions gracefully

**Concurrent Requests:**
OmniFocus/osascript operations are inherently serialized. Multiple sessions may queue behind each other for OmniFocus access. This is acceptable - Tailscale latency (~10-50ms) is small compared to osascript execution (~100-500ms).

## Authentication

When `MCP_AUTH_TOKEN` environment variable is set:
- All requests must include `Authorization: Bearer <token>` header
- Requests without valid token receive HTTP 401

When `MCP_AUTH_TOKEN` is not set:
- All requests are allowed (rely on network-level security like Tailscale)

## Lifecycle & Shutdown

**stdio mode (current):**
- Exit when stdin closes
- Wait for pending operations
- Call `server.close()` to flush responses

**HTTP mode (new):**
- Stay running until SIGTERM/SIGINT
- On shutdown signal:
  1. Stop accepting new connections
  2. Wait for in-flight requests to complete
  3. Close all sessions gracefully
  4. Exit

## Phase 2: Streaming Extension Points

The HTTP transport is designed to support streaming tool responses without refactoring.

**Phase 1 (this design):**
- Tools return complete results via `execute() → Promise<Result>`
- `StreamableHTTPServerTransport` handles protocol

**Phase 2 (future):**
- Add optional `executeStreaming()` method to specific tools
- Analytics tools yield progress chunks before final result
- SSE stream delivers chunks to client

```typescript
// Phase 2 addition - no changes to transport layer needed
class WorkflowAnalysisTool extends BaseTool {
  async *executeStreaming(args): AsyncGenerator<ProgressChunk | Result> {
    yield { type: 'progress', message: 'Analyzing tasks...' };
    yield { type: 'progress', message: 'Processing projects...' };
    yield { type: 'result', data: finalResult };
  }
}
```

## File Structure

**New/Modified Files:**

```
src/
├── index.ts              # Modified: CLI parsing, mode selection
├── http-server.ts        # New: HTTP server, auth, routing
├── session-manager.ts    # New: Session lifecycle management
└── utils/
    └── cli.ts            # New: CLI argument parsing

tests/
└── integration/
    └── http-transport.test.ts  # New: HTTP mode integration tests

docs/
└── HTTP-TRANSPORT.md     # New: User documentation
```

**Dependencies:** None added (using native `http` module)

## Testing Plan

1. Basic connectivity (Claude Desktop → HTTP server)
2. Auth token validation (reject bad tokens)
3. Session persistence (same session ID across requests)
4. Concurrent clients (two sessions simultaneously)
5. Graceful shutdown (SIGTERM with pending request)
6. Session timeout/cleanup (idle session reaped)
7. OmniFocus unavailable (clear error, no hang)

## User Configuration

**Mac (running the server):**

```bash
# Generate a token
export MCP_AUTH_TOKEN=$(openssl rand -hex 32)
echo $MCP_AUTH_TOKEN  # Save this for Claude Desktop config

# Start server
node dist/index.js --http --port 3000
```

**Claude Desktop (Windows via Tailscale):**

```json
{
  "mcpServers": {
    "omnifocus": {
      "url": "http://macbook.tailnet:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-secret-token"
      }
    }
  }
}
```

## Implementation Order

1. `src/utils/cli.ts` - CLI argument parsing
2. `src/session-manager.ts` - Session tracking
3. `src/http-server.ts` - HTTP server with auth
4. `src/index.ts` - Mode selection integration
5. `tests/integration/http-transport.test.ts` - Verification
6. `docs/HTTP-TRANSPORT.md` - User documentation

## References

- [MCP Specification - Transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [Why MCP Moved to Streamable HTTP](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/)
- [Claude Help: Remote MCP Servers](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)
