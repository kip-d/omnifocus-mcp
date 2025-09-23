# Debugging Workflow - Systematic Fix Process

This document outlines the systematic approach for fixing issues to avoid the **Fix → Lint → Build** error cycle.

## The Anti-Pattern We're Avoiding

❌ **Bad Process:**
1. Fix functional issues with `any` types (quick & dirty)
2. Fix lint warnings by replacing `any` with basic interfaces
3. Fix build errors when interfaces don't match actual usage
4. Repeat cycle, wasting time and introducing technical debt

## The Systematic Approach

### 1. Pre-Fix Analysis (2-3 minutes)

**🚨 CRITICAL: Test MCP Integration First**
```bash
# ALWAYS test the actual MCP tool BEFORE debugging internals
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"TOOL_NAME","arguments":{...}}}' | node dist/index.js

# If MCP test fails, THEN run individual checks
npm run lint        # Current lint warnings
npm run build       # Current build errors
npm test           # Current test status
```

**Why MCP testing first:**
- Tests actual integration, not isolated components
- Fresh process picks up new built code (no caching issues)
- Matches production behavior exactly
- Reveals real vs. imagined problems

**Study existing patterns:**
```bash
# Find similar tools handling same data types
find src/tools -name "*.ts" -exec grep -l "ProductivityStatsData\|WorkflowAnalysisData" {} \;

# Check existing interfaces
cat src/omnifocus/script-response-types.ts

# Look for type guard patterns
grep -r "typeof.*object.*null" src/tools --include="*.ts"

# Find extractKeyFindings patterns
grep -r "extractKeyFindings" src/tools --include="*.ts" -A 5
```

**Understand the data flow:**
- What does the OmniFocus script actually return?
- How do similar tools handle script responses?
- What do consuming methods (like `extractKeyFindings`) expect?

### 2. Implementation with Proper Types

**Start with correct typing immediately:**

```typescript
// ✅ CORRECT - Use unknown and type guards from start
const scriptData: unknown = result && result.data ? result.data : result;

// Type guard based on existing patterns
if (scriptData && typeof scriptData === 'object' && scriptData !== null && 'summary' in scriptData) {
  const typedData = scriptData as ProductivityStatsData; // Use existing interface
  // ... implementation
}
```

**Validate each logical change:**
```bash
npm run build      # After each major change
```

### 3. Final Validation

```bash
npm run lint       # No new warnings
npm run build      # Clean build
npm test          # Tests still pass
```

## Key Principles

1. **Use existing interfaces** - Check `script-response-types.ts` first
2. **Follow established patterns** - Don't invent new approaches
3. **Type guards over `any`** - Handle unions safely from the start
4. **Incremental validation** - Build after each logical change
5. **Understand the data flow** - Know what consumes your changes

## Common Gotchas

### Script Response Handling
- Scripts can return different formats (direct data vs wrapped in `data` property)
- Always handle both `ProductivityStatsData` and direct script responses
- Use type guards to safely access properties

### Interface Mismatches
- `extractKeyFindings` methods have specific expectations
- `projectStats` might be array vs Record - check the method signature
- Cache types must match the data being cached

### Union Type Safety
```typescript
// ❌ WRONG - Assuming structure
const data = scriptData.summary;

// ✅ CORRECT - Type guard first
if ('summary' in scriptData) {
  const data = (scriptData as ScriptResponseType).summary;
}
```

## Example: ProductivityStatsToolV2 Fix

**What went wrong:**
1. Used `any` types for quick fix
2. Created new interfaces without checking existing ones
3. Didn't verify `extractKeyFindings` expectations
4. Resulted in 3-step fix cycle

**What should have happened:**
1. Found existing `ProductivityStatsData` interface
2. Looked at `extractKeyFindings` signature expecting `projectStats: Array<{name: string; completedCount: number}>`
3. Used proper type guards from existing patterns
4. Single, correct implementation

## Time Investment

- **Bad Process**: 15-20 minutes across 3 fix cycles
- **Good Process**: 5-7 minutes total with upfront analysis

The 2-3 minutes of upfront analysis saves 10+ minutes of rework and creates better, more maintainable code.