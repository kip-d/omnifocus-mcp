# OmniFocus MCP Development Documentation

This directory contains documentation for developers working on the OmniFocus MCP server.

## Core Documents

### Architecture & Design
- **[ARCHITECTURE.md](../ARCHITECTURE.md)** - System architecture and design decisions
- **[SCRIPT_LENGTH_SOLUTION.md](SCRIPT_LENGTH_SOLUTION.md)** - Managing JXA script size limits
- **[BRIDGE_USAGE_GUIDE.md](BRIDGE_USAGE_GUIDE.md)** - Using the evaluateJavascript bridge

### Development Guidelines
- **[CODING_STANDARDS.md](CODING_STANDARDS.md)** - Code style and standards
- **[CONTRIBUTING.md](../../CONTRIBUTING.md)** - How to contribute
- **[PERMISSION_CHECK_GUIDE.md](PERMISSION_CHECK_GUIDE.md)** - Handling permissions

### Testing & Performance
- **[TESTING_PROTOCOL_V2.md](../TESTING_PROTOCOL_V2.md)** - Testing strategies
- **[PERFORMANCE.md](../PERFORMANCE.md)** - Performance optimization guidelines
- **[MCP_INSPECTOR_TESTING_GUIDE.md](../MCP_INSPECTOR_TESTING_GUIDE.md)** - Using MCP Inspector

## Key Technical Concepts

### 1. Script Size Management
The ultra-minimal JSON pattern reduces script size by 90%:
```typescript
// Pass complex data as JSON string
const script = buildScript(template, {
  taskId: taskId,
  updatesJson: JSON.stringify(updates)  // Compact JSON
});
```

### 2. JXA Performance Pitfalls
**Never use `whose()` method** - it's catastrophically slow:
```javascript
// ❌ BAD - Takes 25+ seconds
const tasks = doc.flattenedTasks.whose({completed: false})();

// ✅ GOOD - Takes <1 second
const allTasks = doc.flattenedTasks();
const tasks = allTasks.filter(t => !t.completed());
```

### 3. Bridge Consistency
Use the same context for read/write operations:
```javascript
// Write via bridge
app.evaluateJavascript('task.addTag(tag)');
// Read via bridge (consistent)
app.evaluateJavascript('task.tags.map(t => t.name)');
```

### 4. Type Coercion for MCP
Handle string parameters from Claude Desktop:
```typescript
// MCP bridge converts all params to strings
limit: z.union([
  z.number(),
  z.string().transform(val => parseInt(val, 10))
]).pipe(z.number().min(1).max(200))
```

## Development Workflow

### Building
```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm run dev          # Watch mode
```

### Testing
```bash
npm test             # Unit tests
npm run test:integration  # Integration tests
npm run test:all     # All tests
```

### Debugging
```bash
# Test as Claude Desktop would
node tests/integration/test-as-claude-desktop.js

# Use MCP Inspector (opens browser)
npx @modelcontextprotocol/inspector dist/index.js
```

## Project Structure

```
src/
├── cache/           # TTL-based caching system
├── omnifocus/       # OmniAutomation integration
│   ├── scripts/     # JXA script templates
│   └── api/         # TypeScript definitions
├── tools/           # MCP tool implementations
│   ├── tasks/       # Task CRUD operations
│   ├── projects/    # Project management
│   ├── analytics/   # Productivity analysis
│   └── export/      # Data export tools
└── utils/           # Logging and helpers
```

## Common Development Tasks

### Adding a New Tool
1. Create tool class in appropriate directory
2. Implement `execute()` method
3. Add Zod schema for parameters
4. Register in `src/index.ts`
5. Add tests
6. Update documentation

### Debugging Script Errors
1. Check script size (should be <10KB)
2. Verify JSON escaping
3. Test with direct osascript execution
4. Check OmniFocus console for errors
5. Use diagnostic tools in `tests/manual/`

### Performance Optimization
1. Never use `whose()` method
2. Minimize script size
3. Use caching appropriately
4. Batch operations when possible
5. Profile with real data (2000+ tasks)

## Important Files

### Configuration
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `vitest.config.ts` - Test configuration

### Entry Points
- `src/index.ts` - MCP server entry point
- `src/tools/index.ts` - Tool registry

### Critical Scripts
- `src/omnifocus/scripts/tasks/` - Task operation scripts
- `src/omnifocus/OmniAutomation.ts` - Script builder

## Versioning

Follow semantic versioning:
- **Major**: Breaking API changes
- **Minor**: New features, backward compatible
- **Patch**: Bug fixes

Update these files for releases:
1. `package.json` - version field
2. `CHANGELOG.md` - release notes
3. Create git tag: `git tag v2.0.0`

## Resources

### Internal
- [Development Journey](../journey/README.md) - Historical context
- [API TypeScript Definitions](../../src/omnifocus/api/OmniFocus.d.ts)
- [Test Prompts](../../prompts/) - Testing scenarios

### External
- [MCP Specification](https://modelcontextprotocol.io)
- [OmniFocus Automation](https://omni-automation.com)
- [JXA Documentation](https://developer.apple.com/library/mac/releasenotes/InterapplicationCommunication/RN-JavaScriptForAutomation/)