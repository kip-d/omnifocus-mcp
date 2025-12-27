# Debugging Workflow

Avoid the Fix → Lint → Build error cycle.

## Anti-Pattern

1. Fix with `any` types
2. Fix lint by adding interfaces
3. Fix build when interfaces mismatch
4. Repeat, waste time

## Systematic Approach

### 1. Pre-Fix Analysis (2-3 min)

**Test MCP integration first:**

```bash
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"TOOL_NAME","arguments":{...}}}' | node dist/index.js

# Only if MCP fails:
npm run lint && npm run build && npm test
```

**Why MCP first:** Tests actual integration, matches production, reveals real problems.

**Find existing patterns:**

```bash
find src/tools -name "*.ts" -exec grep -l "ProductivityStatsData" {} \;
grep -r "typeof.*object.*null" src/tools --include="*.ts"
```

**Understand data flow:** What does the script return? What do consumers expect?

### 2. Implementation

```typescript
// Use unknown + type guards from start
const scriptData: unknown = result?.data ?? result;

if (scriptData && typeof scriptData === 'object' && 'summary' in scriptData) {
  const typedData = scriptData as ProductivityStatsData;
}
```

Build after each major change: `npm run build`

### 3. Final Validation

```bash
npm run lint && npm run build && npm test
```

## Principles

| Principle | Action |
|-----------|--------|
| Use existing interfaces | Check `script-response-types.ts` first |
| Follow patterns | Don't invent new approaches |
| Type guards over `any` | Handle unions safely |
| Incremental validation | Build after each change |

## Common Gotchas

| Issue | Fix |
|-------|-----|
| Script returns wrapped/unwrapped | Handle both formats with type guards |
| Interface mismatch | Check method signature expectations |
| Union type access | Guard first: `if ('prop' in obj)` |

## Time Investment

| Approach | Time |
|----------|------|
| Bad (3 fix cycles) | 15-20 min |
| Good (upfront analysis) | 5-7 min |

2-3 minutes of analysis saves 10+ minutes of rework.
