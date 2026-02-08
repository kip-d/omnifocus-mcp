# Contributing to OmniFocus MCP Server

Thank you for your interest in contributing to the OmniFocus MCP Server! This guide follows Model Context Protocol best
practices to ensure consistent, high-quality contributions.

## 🎯 Core Principles

1. **Official API Only**: Use only OmniAutomation scripts via JXA - no database hacking
2. **Type Safety First**: All code must be TypeScript with proper types
3. **Test Everything**: Comprehensive tests are required for all changes
4. **Performance Matters**: Consider caching and optimization in all features
5. **Security by Design**: Think about security implications of every change

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- OmniFocus 4.7+ Pro (required for full automation API support)
- macOS (required for OmniAutomation)
- TypeScript knowledge

### Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/kip-d/omnifocus-mcp.git
cd omnifocus-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Start development mode
npm run dev
```

## 📝 Development Workflow

### 1. Check Existing Issues

Before starting work:

- Check [open issues](https://github.com/kip-d/omnifocus-mcp/issues)
- Look for issues labeled `good first issue` or `help wanted`
- Comment on the issue to claim it

### 2. Create a Feature Branch

```bash
# For features
git checkout -b feature/your-feature-name

# For bug fixes
git checkout -b fix/issue-description

# For documentation
git checkout -b docs/what-you-are-documenting
```

### 3. Follow Unified API Standards

The v3.0.0 API uses 4 unified tools (`omnifocus_read`, `omnifocus_write`, `omnifocus_analyze`, `system`). To add new
functionality, extend the schemas and compilers:

```
src/tools/unified/
├── schemas/     # Zod schemas for tool inputs
├── compilers/   # Transform validated input → JXA scripts
└── tools/       # Tool handlers (read, write, analyze, system)
```

1. Add schema types in `src/tools/unified/schemas/`
2. Add compilation logic in `src/tools/unified/compilers/`
3. Add or update JXA scripts in `src/omnifocus/scripts/`
4. Register in the appropriate tool handler

See [DEVELOPER_GUIDE.md](docs/dev/DEVELOPER_GUIDE.md) for full details.

### 4. Write Comprehensive Tests

#### Unit Tests

```typescript
// tests/unit/tools/your-new-tool.test.ts
describe('YourNewTool', () => {
  it('should handle valid input correctly', async () => {
    // Test implementation
  });

  it('should handle errors gracefully', async () => {
    // Test error cases
  });
});
```

#### Integration Tests

```typescript
// tests/integration/test-your-feature.ts
// Test with actual MCP protocol communication
```

#### MCP Inspector Tests

Create test configurations in `.mcp-inspector/`:

```json
{
  "name": "Your Feature Test",
  "tests": [
    {
      "tool": "your_new_tool",
      "params": {
        /* test params */
      },
      "expectedResponse": {
        /* expected */
      }
    }
  ]
}
```

### 5. Document Your Changes

#### Tool Documentation

Follow the MCP documentation standard:

```typescript
/**
 * Brief description of what the tool does
 *
 * @description
 * Detailed explanation of the tool's purpose and behavior
 *
 * @example Basic usage
 * {
 *   "tool": "your_tool",
 *   "arguments": { "param": "value" }
 * }
 *
 * @param {string} param - Description of parameter
 * @returns {Object} Description of return value
 * @throws {Error} When specific error conditions occur
 */
```

#### Update README

- Add new tools to the Available Tools section
- Include usage examples
- Document any limitations

## 🧪 Testing Requirements

### Before Submitting PR

Run all test suites:

```bash
# Unit tests
npm test

# Integration tests (tests MCP protocol communication)
npm run test:integration

# Linting
npm run lint

# Type checking
npm run typecheck

# Full test suite (runs unit and integration tests)
npm run test:all
```

#### Local OmniFocus smoke check

When working on JXA/OmniAutomation scripts locally, build the project and run a real request against OmniFocus to catch
escaping issues that unit mocks miss:

```bash
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"omnifocus_write","arguments":{"mutation":{"operation":"create","target":"task","data":{"name":"Smoke Test Task"}}}}}' | node dist/index.js
```

The command creates a temporary inbox task—delete it afterwards. Always perform this check before pushing changes that
touch `src/omnifocus/scripts/`.

### Performance Testing

For performance-sensitive features:

```bash
# Run performance benchmarks
npm run test:inspector:performance

# Profile specific tool
npm run profile -- --tool "your_tool" --iterations 100
```

## 🔒 Security Guidelines

### When Adding New Features

1. **Input Validation**: Validate all inputs before processing
2. **Access Control**: Respect security configuration (read-only mode, project filters)
3. **Audit Logging**: Log sensitive operations when audit mode is enabled
4. **Rate Limiting**: Consider rate limits for expensive operations
5. **Error Messages**: Never expose sensitive information in errors

### Security Checklist

- [ ] Validated all user inputs
- [ ] Checked for injection vulnerabilities
- [ ] Respected access control settings
- [ ] Added appropriate audit logging
- [ ] Reviewed error messages for information leaks

## 🚨 Error Handling Standards

Use structured errors following MCP patterns:

```typescript
throw new McpError(ErrorCode.INVALID_PARAMS, 'Clear error message', {
  field: 'paramName',
  value: providedValue,
  suggestion: 'How to fix this error',
  documentation: '/docs/relevant-guide.md',
});
```

## 📊 Performance Guidelines

### Caching Strategy

- Tasks: 5 minute TTL
- Projects: 5 minute TTL
- Tags: 10 minute TTL
- Folders: 10 minute TTL
- Analytics: 1 hour TTL

### Query Optimization

- Use `skipAnalysis: true` for faster queries when appropriate
- Implement pagination for large result sets
- Cache expensive computations
- Invalidate caches intelligently

## 🔄 Pull Request Process

### PR Checklist

- [ ] Code follows TypeScript style guidelines
- [ ] Tests pass locally (`npm run test:all`)
- [ ] Documentation updated (if needed)
- [ ] CHANGELOG.md updated
- [ ] No console.log statements
- [ ] Error handling implemented
- [ ] Security considerations addressed

### PR Title Format

Follow conventional commits:

- `feat: add new amazing feature`
- `fix: resolve issue with task updates`
- `docs: update installation guide`
- `perf: optimize task query performance`
- `test: add tests for date range queries`

### PR Description Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Performance improvement
- [ ] Documentation update

## Testing

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Screenshots (if applicable)

Add screenshots for UI changes
```

## 🤝 Code Review Guidelines

### For Contributors

- Respond to feedback constructively
- Make requested changes promptly
- Ask questions if requirements are unclear
- Be patient - thorough reviews ensure quality

### For Reviewers

- Test the changes locally
- Check for security implications
- Verify test coverage
- Ensure documentation is updated
- Be constructive and specific in feedback

## 📚 Resources

### MCP Documentation

- [MCP Specification](https://github.com/modelcontextprotocol/docs)
- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector)

### OmniFocus Documentation

- [OmniAutomation](https://omni-automation.com/) - Official automation documentation
- [OmniFocus Specifications](https://www.omnigroup.com/omnifocus/specs/) - File formats and sync specifications
- [Local API Reference](src/omnifocus/api/OmniFocus.d.ts) - TypeScript definitions extracted from OmniFocus 4.7+

**Why OmniFocus Pro?** The Pro version includes:

- Full automation API access required for all MCP operations
- Advanced perspective creation and customization
- Focus mode and custom review cycles
- AppleScript and JavaScript for Automation support

**Platform Note**: This MCP server requires macOS as it uses OmniAutomation via JXA (JavaScript for Automation), which
is only available on macOS. Mobile devices cannot run MCP servers.

### Project Documentation

- [Architecture](docs/dev/ARCHITECTURE.md) - Technical implementation details
- [Patterns](docs/dev/PATTERNS.md) - Symptom → solution lookup
- [Lessons Learned](docs/dev/LESSONS_LEARNED.md) - Hard-won development insights

## ❓ Getting Help

- **Bugs & Questions**: Open an [Issue](https://github.com/kip-d/omnifocus-mcp/issues)
- **Security**: Report vulnerabilities via
  [Security Advisories](https://github.com/kip-d/omnifocus-mcp/security/advisories/new)

## 🙏 Recognition

Contributors will be recognized in:

- README.md Contributors section
- Release notes
- GitHub contributor graph

Thank you for contributing to make OmniFocus MCP Server better!
