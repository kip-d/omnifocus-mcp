# Script Generation Standards

This document establishes consistent patterns for JavaScript script generation in the OmniFocus MCP project to prevent
syntax errors and ensure reliable execution.

## ✅ Correct Patterns

### 1. IIFE-Wrapped Template Scripts

For static template scripts, always use IIFE (Immediately Invoked Function Expression) wrapping:

```typescript
export const EXAMPLE_SCRIPT = `
  ${getMinimalHelpers()}

  (() => {
    // Script logic here
    const result = performOperation();
    return JSON.stringify(result);
  })();
`;
```

### 2. Function-Based Script Generation

For dynamic script generation with parameters, use direct function calls (not return statements):

```typescript
export function createExampleScript(param1: string, param2: any): string {
  return `
  ${getMinimalHelpers()}

  function performOperation(p1, p2) {
    // Script logic here
    return JSON.stringify({ success: true });
  }

  // ✅ CORRECT: Direct function call
  performOperation(${JSON.stringify(param1)}, ${JSON.stringify(param2)});
  `;
}
```

## ❌ Anti-Patterns to Avoid

### 1. Return Statements Outside Functions

```typescript
// ❌ WRONG: This causes "Return statements are only valid inside functions" error
export function createBadScript(param: string): string {
  return `
  function doSomething(p) {
    return JSON.stringify({ result: p });
  }

  return doSomething(${JSON.stringify(param)});  // ❌ SYNTAX ERROR
  `;
}
```

### 2. Orphaned Variable Assignments

```typescript
// ❌ WRONG: Variables without proper return/output handling
export function createBadScript2(param: string): string {
  return `
  function doSomething(p) {
    return JSON.stringify({ result: p });
  }

  const result = doSomething(${JSON.stringify(param)});
  result;  // ❌ This doesn't output anything
  `;
}
```

## 🔍 Testing Script Syntax

Always validate generated scripts using Node.js Function constructor:

```typescript
// Test script syntax validity
const script = createYourScript('test-param');
try {
  new Function(script);
  console.log('✅ Script syntax is valid');
} catch (error) {
  console.error('❌ Script syntax error:', error.message);
}
```

## 📋 Script Generation Checklist

Before deploying any script generation function:

- [ ] **No return statements outside functions** - Use direct function calls
- [ ] **Proper IIFE wrapping** for template scripts
- [ ] **Valid JavaScript syntax** - Test with `new Function(script)`
- [ ] **Consistent helper imports** - Use `getMinimalHelpers()` when possible
- [ ] **Safe parameter passing** - Always use `JSON.stringify()` for parameters
- [ ] **Error handling** - Include try/catch blocks in script logic
- [ ] **Unit tests** - Verify both syntax and functionality

## 🚨 Historical Issues Fixed

### Issue #1: Project Update Script (2025-09-15)

**Problem**: `createUpdateProjectScript` had `return updateProject(...)` at top level **Solution**: Changed to direct
function call `updateProject(...)`

### Issue #2: Task Update Script (2025-09-15)

**Problem**: `createUpdateTaskScript` had `const result = ...; result;` pattern **Solution**: Changed to direct function
call `updateTask(...)`

## 💡 Best Practices

1. **Keep it simple**: Direct function calls are more reliable than complex return patterns
2. **Test early**: Validate script syntax immediately after generation
3. **Use helpers**: Leverage existing helper functions instead of inline code
4. **Be consistent**: Follow established patterns across all script generation
5. **Document changes**: Update this document when adding new script generation patterns

## 🔗 Related Files

- `src/omnifocus/scripts/shared/helpers.ts` - Helper function library
- `src/omnifocus/scripts/shared/script-builder.ts` - Script building utilities
- `src/omnifocus/scripts/shared/bridge-template.ts` - Template formatting utilities

---

_Last updated: 2025-09-15 - Added after systematic script generation audit_
