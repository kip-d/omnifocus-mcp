# CLAUDE.md - Essential Guide for Claude Code

This file provides critical guidance to Claude Code (claude.ai/code) when working with this OmniFocus MCP server.

## 📚 CRITICAL: Read LESSONS_LEARNED.md First!
**Before making ANY architectural changes or optimizations, consult `/docs/LESSONS_LEARNED.md`**
This document contains hard-won insights that will save you from repeating costly mistakes.

## Critical: V2 Architecture
- **Use only V2 tools** (`*ToolV2.ts` files in `src/tools/`)
- V1 tools removed in v2.0.0 for 30% context reduction
- **Official API**: See `src/omnifocus/api/OmniFocus.d.ts` for OmniFocus 4.6.1 type definitions

## Development Rules
- **TypeScript only** - All files must be `.ts` (including tests and scripts)
- **Never create `.js` files**
- **Always run integration tests** before considering features complete
- Build before running: `npm run build`

## 🚨 CRITICAL LESSON: MCP stdin Handling

**We spent 6+ months with broken MCP lifecycle compliance!** 

Every MCP server MUST handle stdin closure for specification compliance:
```typescript
// ✅ REQUIRED - Add to every MCP server
process.stdin.on('end', () => process.exit(0));
process.stdin.on('close', () => process.exit(0));
```

Without this, servers hang forever and violate MCP specification. See `docs/LESSONS_LEARNED.md` for full embarrassing details.

## Documentation Management
**NEVER delete documentation outright unless there's a clear reason (e.g., contains incorrect/dangerous information).**

Instead, preserve historical documentation:
1. Create/use `.archive/` directory (ignored by git in main repo)
2. Move obsolete docs there with context about why they're obsolete
3. Push to archive repository: https://github.com/kip-d/omnifocus-mcp-archive
4. This preserves development history and lessons learned for future developers

Active documentation stays in `docs/`, historical context goes to archive repo.

## 🚨 Critical: MCP Bridge Type Coercion
**Claude Desktop converts ALL parameters to strings during transport.**

```typescript
// ❌ WRONG - Will fail with Claude Desktop
limit: z.number().min(1).max(200).default(25)

// ✅ CORRECT - Handles both direct calls and MCP bridge
limit: z.union([
  z.number(),
  z.string().transform(val => parseInt(val, 10))
]).pipe(z.number().min(1).max(200)).default(25)
```

Always test with BOTH: Direct Node.js calls AND Claude Desktop (stringified params)

## Date Formats
- **Preferred**: `YYYY-MM-DD` or `YYYY-MM-DD HH:mm` (local time, e.g., "2025-03-15" or "2025-03-15 14:30")
- **Smart defaults for date-only (YYYY-MM-DD)**:
  - **Due dates**: Default to 5:00 PM local time (e.g., "2025-03-15" becomes 5pm)
  - **Defer dates**: Default to 8:00 AM local time (e.g., "2025-03-15" becomes 8am)
  - **Completion dates**: Default to 12:00 PM (noon) local time
- **Avoid**: ISO-8601 with Z suffix (causes timezone confusion - will set wrong time)
- **Basic natural language works**: 
  - "today"/"tomorrow" → 5pm for due dates, 8am for defer dates
  - "next week" → same smart defaults
  - "next monday" → always 9am
  - "friday"/"end of week" → always 5pm
- **Complex natural language should be converted**: LLM should convert "the 3rd Thursday after next week" to YYYY-MM-DD format

## Task Management
- **Move to inbox**: Set `projectId` to `null`, `""`, or `"null"`
- **Known limits**: Large queries (2000+ tasks) may be slow

## 🚨 Critical: JXA Performance Rules

### NEVER Use .where() or .whose() Methods
**We run in JXA context, NOT OmniJS. These methods don't exist in our environment.**

```javascript
// ❌ NEVER - Takes 25+ seconds or fails entirely
const tasks = doc.flattenedTasks.whose({completed: false})();
const tasks = doc.flattenedTasks.where(task => !task.completed);

// ✅ ALWAYS - Use standard JavaScript
const allTasks = doc.flattenedTasks();
for (let i = 0; i < allTasks.length; i++) {
  const task = allTasks[i];
  try {
    if (!task.completed()) tasks.push(task);
  } catch (e) { /* skip */ }
}
```

### Performance Best Practices
- **Direct try/catch** is 50% faster than safeGet() wrappers
- **Use timestamps** for date comparisons, not Date objects in loops
- **Early exit** on most common conditions (completed, no date)
- Set `skipAnalysis: true` for 30% faster queries when recurring analysis not needed

## 🚨 Critical: Script Size Limits
**JXA scripts sent to OmniFocus have size limits that can cause syntax errors.**

### Keep Scripts Small
- **Use minimal helpers**: Import only essential helper functions
- **Available helper functions**:
  - `getMinimalHelpers()` - Only essential utilities (safeGet, safeGetTags, safeIsCompleted, formatError)
  - `getTagHelpers()` - Minimal helpers for tag operations
  - `getAllHelpers()` - Full helper suite (use sparingly, can exceed limits)

### Implementation Pattern
```typescript
// ❌ WRONG - Can exceed script size limits
import { getAllHelpers } from '../shared/helpers.js';
export const MY_SCRIPT = `
  ${getAllHelpers()}  // Too large!
  // ... script code
`;

// ✅ CORRECT - Use minimal helpers
import { getMinimalHelpers } from '../shared/helpers.js';
export const MY_SCRIPT = `
  ${getMinimalHelpers()}  // Only essentials
  // ... script code
`;
```

### When Scripts Fail with Syntax Errors
- Check script size first - "Unexpected token" errors often indicate size limits
- Create specialized minimal helper functions for your specific needs
- Test with both direct execution AND Claude Desktop (which may have stricter limits)

## Quick Reference

### Commands
```bash
npm run build        # Compile TypeScript (required before running)
npm run dev          # Watch mode
npm test             # Unit tests
npm run test:integration  # Integration tests

# Testing
node tests/integration/test-as-claude-desktop.js  # Simulate Claude Desktop
npx @modelcontextprotocol/inspector dist/index.js  # Interactive testing
```

### Testing Pattern
**MCP-compliant server termination for testing:**
```bash
# ✅ BEST - Proper MCP shutdown by closing stdin
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js

# ✅ Quick tool count with proper shutdown  
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js | jq -r '.result.tools | length'

# ✅ Test any MCP method with graceful termination
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"system","arguments":{"operation":"version"}}}' | node dist/index.js

# ⚠️ FALLBACK - Use timeout only if server doesn't exit gracefully
timeout 10s node dist/index.js <<< '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**MCP Specification Compliance**: 
- **stdio transport**: Client closes stdin → Server exits gracefully ✅ IMPLEMENTED
- **No protocol shutdown**: MCP uses transport-level termination, not JSON-RPC methods
- **Graceful cascade**: stdin close → server exit → SIGTERM → SIGKILL (if needed)
- **Our Implementation**: Added stdin 'end'/'close' handlers → process.exit(0) for clean termination

## 📖 MCP Specification Reference

**Official MCP Specification**: https://modelcontextprotocol.io/specification/2025-06-18/

### Key Specification Sections
- **[Lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle)** - Server startup, initialization, and shutdown
- **[Transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)** - stdio, HTTP/SSE transport mechanisms
- **[Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)** - Tool definition, parameter schemas, execution
- **[Prompts](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts)** - Prompt registration and argument handling

### Critical Implementation Details
- **Version**: Current protocol version is "2025-06-18"  
- **Transport**: We use stdio transport (stdin/stdout communication)
- **Shutdown**: No protocol-level shutdown - servers exit when stdin closes
- **Error Handling**: Use McpError with proper error codes from specification
- **Type Safety**: Parameter schemas must handle Claude Desktop's string conversion

### SDK Version Management
- **Current**: @modelcontextprotocol/sdk@1.17.4 (matches latest available)
- **Update Check**: `npm view @modelcontextprotocol/sdk version`
- **GitHub Repo**: https://github.com/modelcontextprotocol/typescript-sdk

### Common MCP Patterns & Requirements
- **Tool Schemas**: Use Zod schemas, handle string coercion for Claude Desktop
- **Response Format**: `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`
- **Error Codes**: INVALID_REQUEST (-32600), METHOD_NOT_FOUND (-32601), INVALID_PARAMS (-32602), INTERNAL_ERROR (-32603)
- **Capabilities**: Declare tool and prompt capabilities during initialization
- **Transport**: stdio uses stdin/stdout, HTTP uses Server-Sent Events

### When In Doubt
Always reference the official specification rather than making assumptions about MCP behavior.

### Project Structure
- `src/omnifocus/`: OmniAutomation integration via JXA
- `src/tools/`: MCP tools (tasks, projects, analytics, export)
- `src/cache/`: TTL-based caching (30s tasks, 5m projects, 1h analytics)

### Key Design
- **OmniAutomation only** - No direct DB access, all via osascript
- **Caching** - Auto-invalidated on writes
- **Errors** - McpError for protocol compliance

## Debugging Tips
- **Server won't start?** Run `npm run build` - usually missing dist/
- **Script timeouts?** Check OmniFocus not blocked by dialogs
- **ID issues?** See src/omnifocus/scripts/tasks.ts for extraction patterns

## 🚨 CRITICAL: MCP Testing Pattern Recognition

**NEVER confuse graceful server exit with failure!**

### ✅ SUCCESS Pattern:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call",...}' | node dist/index.js
[INFO] [tools] Executing tool: tasks [...]
# JSON response appears here (if any)
[INFO] [server] stdin closed, exiting gracefully per MCP specification
```
**This is SUCCESSFUL execution!** The server exits gracefully as required by MCP spec.

### ❌ FAILURE Pattern:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call",...}' | node dist/index.js
[INFO] [tools] Executing tool: tasks [...]
{"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"SCRIPT_ERROR",...}}
[INFO] [server] stdin closed, exiting gracefully per MCP specification
```
**This shows actual failure** - JSON error response before graceful exit.

### Key Indicators:
- **Success**: Tool execution log + graceful exit (JSON response may not be visible in bash output)
- **Failure**: Tool execution log + JSON error response + graceful exit
- **The graceful exit itself is NEVER an error** - it's required MCP compliance!

## Known Limitations & Workarounds

### JXA whose() Limitations
- No "not null" support
- String operators: Use underscore prefix (`_contains`, `_beginsWith`)
- Date operators: Use symbols (`>`, `<`, `>=`, `<=`)
- Complex queries timeout with 2000+ tasks

### Quality Criteria
Solutions must:
- Solve the exact problem (no more, no less)
- Require minimal code modification
- Maintain existing patterns
- Be immediately implementable