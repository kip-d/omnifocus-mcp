# CLAUDE.md - Essential Guide for Claude Code

This file provides critical guidance to Claude Code (claude.ai/code) when working with this OmniFocus MCP server.

## Critical: V2 Architecture
- **Use only V2 tools** (`*ToolV2.ts` files in `src/tools/`)
- V1 tools removed in v2.0.0 for 30% context reduction
- **Official API**: See `src/omnifocus/api/OmniFocus.d.ts` for OmniFocus 4.6.1 type definitions

## Development Rules
- **TypeScript only** - All files must be `.ts` (including tests and scripts)
- **Never create `.js` files**
- **Always run integration tests** before considering features complete
- Build before running: `npm run build`

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
Always send quit command after MCP tests to avoid timeouts:
```typescript
// Send your test request, then immediately send quit
const request = { jsonrpc: '2.0', method: 'tools/call', ... };
const exitRequest = { jsonrpc: '2.0', method: 'quit' };
input: JSON.stringify(request) + '\n' + JSON.stringify(exitRequest) + '\n'
```

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