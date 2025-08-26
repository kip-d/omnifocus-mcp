# CLAUDE.md

Guidance for Claude Code when working with the OmniFocus MCP server.

## Critical Development Rules

1. **TypeScript Only** - This is a TypeScript project. Never create .js files
2. **Always Run Integration Tests** - NEVER skip integration tests before considering a feature "done" or release
3. **Build First** - Always run `npm run build` before testing
4. **Test with Claude Desktop** - Always test with both direct Node.js calls AND Claude Desktop

## MCP Bridge Type Coercion (CRITICAL)

Claude Desktop converts ALL parameters to strings. You MUST handle this in Zod schemas:

```typescript
// ❌ WRONG
limit: z.number().min(1).max(200)

// ✅ CORRECT
limit: z.union([
  z.number(),
  z.string().transform(val => parseInt(val, 10))
]).pipe(z.number().min(1).max(200))
```

## JXA Performance Rules (NEVER VIOLATE)

### Never use whose() or where()
```javascript
// ❌ NEVER - Takes 25+ seconds
const tasks = doc.flattenedTasks.whose({completed: false})();

// ✅ ALWAYS - Takes <1 second
const allTasks = doc.flattenedTasks();
for (let i = 0; i < allTasks.length; i++) {
  if (!allTasks[i].completed()) tasks.push(allTasks[i]);
}
```

**Why**: JXA's whose() is catastrophically slow. We run in JXA context via osascript, NOT OmniJS.

## Date Formats
- Use: `YYYY-MM-DD HH:mm` (e.g., "2025-03-31 17:00")
- Avoid: ISO 8601 with Z suffix
- Relative dates work: "tomorrow at 5pm"

## Architecture

- **API**: Official OmniFocus API via `src/omnifocus/api/OmniFocus.d.ts`
- **Scripts**: Generated from TypeScript templates in `src/omnifocus/scripts/`
- **Tools**: V2 tools only (`*ToolV2.ts`), V1 removed
- **Cache**: TTL-based with automatic invalidation on writes

## Quick Reference

```bash
# Essential commands
npm run build          # Required before testing
npm run dev           # Watch mode
npm test              # Unit tests
npm run test:integration  # Integration tests

# Test as Claude Desktop would
node tests/integration/test-as-claude-desktop.js
```

## Known Issues
- Large queries (2000+ tasks) may be slow
- Project repeat rules temporarily disabled
- Tags cannot be assigned during task creation (create then update)

## Debugging
- Server won't start? Check `dist/` exists, run `npm run build`
- Script timeouts? OmniFocus may be blocked by dialogs
- Type errors? Likely MCP bridge string coercion issue

For detailed documentation see `docs/`