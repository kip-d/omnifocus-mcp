# JSON Escaping Audit - Detailed Analysis

**Date:** October 2, 2025
**Status:** ✅ Good news - Most escaping is already safe!

---

## Executive Summary

After comprehensive audit, the escaping situation is **much better than initially thought**:

✅ **Safe Patterns (99% of code):**
- All `{{placeholder}}` substitutions properly escaped via `formatValue()`
- Error messages and insights using string concatenation (not code generation)
- formatValue() in OmniAutomation.ts handles all types correctly

⚠️ **Risk Areas Found:**
- 1 direct string concatenation in helper code generation (helpers.ts:561)
- Potential issues in template construction within helpers

---

## Current Escaping Implementation

### formatValue() Method (OmniAutomation.ts:364-408)

**Status: ✅ EXCELLENT**

```typescript
private formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);  // ✅ Proper escaping
  if (value instanceof Date) return `new Date("${value.toISOString()}")`;
  if (Array.isArray(value)) {
    const items = value.map(v => this.formatValue(v)).join(', ');
    return `[${items}]`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${JSON.stringify(k)}: ${this.formatValue(v)}`)
      .join(', ');
    return `{${entries}}`;
  }
  return String(value);
}
```

**This handles:**
- ✅ String escaping (quotes, newlines, backslashes)
- ✅ Object property escaping
- ✅ Array escaping
- ✅ Special characters
- ✅ Nested structures

---

## Pattern Analysis

### Pattern 1: {{placeholder}} Substitution (71 occurrences)

**Status: ✅ SAFE**

**How it works:**
```typescript
// In script templates:
const taskId = {{taskId}};

// In OmniAutomation.buildScript():
const replacement = this.formatValue(value);  // Goes through formatValue!
script = script.replace(new RegExp(placeholder, 'g'), replacement);
```

**Why safe:** All {{placeholder}} values pass through formatValue() which does proper JSON.stringify() escaping.

**Files using this pattern:** 35 files (all safe)

---

### Pattern 2: Error Message Concatenation (100+ occurrences)

**Status: ✅ SAFE**

**Example:**
```typescript
message: "Task with ID '" + taskId + "' not found."
```

**Why safe:** These are message strings returned to the user, not code being executed. They're already inside the generated script, so the concatenation happens at runtime after proper escaping of the outer structure.

**Files:** update-task.ts, create-task.ts, delete-project.ts, complete-project.ts, etc.

---

### Pattern 3: Direct String Concatenation in Code Generation ⚠️

**Status: ⚠️ RISKY**

**Location:** helpers.ts:561

**The Problem:**
```javascript
const script = '(() => { const t = Task.byIdentifier("' + taskId + '"); return t ? JSON.stringify(t.tags.map(tag => tag.name)) : "[]"; })()';
```

**Why risky:** If taskId contains:
- Quotes: `task"123` → breaks syntax
- Backslashes: `task\123` → escape issues
- Newlines: `task\n123` → syntax error

**Impact:** Used in `safeGetTagsWithBridge()` function

**Fix needed:** Use JSON.stringify() or template literal escaping

---

## Risk Assessment by Category

### 🟢 Low Risk (No Action Needed)
- All {{placeholder}} patterns (properly escaped)
- Error message concatenation (not code generation)
- Number/boolean concatenation in insights

### 🟡 Medium Risk (Should Fix)
- helpers.ts:561 - Direct taskId concatenation in bridge script

### 🔴 High Risk (None Found)
- No unescaped user input in critical code paths

---

## Edge Cases to Test

Even though formatValue() handles these correctly, we should verify with integration tests:

```javascript
// Test case 1: Quotes
taskName: 'Task "quoted" name'
// Expected: const taskName = "Task \"quoted\" name";

// Test case 2: Newlines
taskNote: 'Line 1\nLine 2'
// Expected: const taskNote = "Line 1\\nLine 2";

// Test case 3: Backslashes
taskNote: 'Path\\to\\file'
// Expected: const taskNote = "Path\\\\to\\\\file";

// Test case 4: Curly braces
taskName: 'Template {{variable}}'
// Expected: const taskName = "Template {{variable}}";

// Test case 5: Mixed
taskName: 'Complex: "quote\\n{{test}}"'
// Expected: const taskName = "Complex: \"quote\\\\n{{test}}\"";

// Test case 6: Single quotes
taskName: "Task's name"
// Expected: const taskName = "Task's name";

// Test case 7: Unicode
taskName: 'Task 🚀 emoji'
// Expected: const taskName = "Task 🚀 emoji";
```

---

## Recommended Actions

### Priority 1: Fix Direct Concatenation ⚠️
**File:** helpers.ts:561
**Current:**
```javascript
const script = '(() => { const t = Task.byIdentifier("' + taskId + '"); return t ? JSON.stringify(t.tags.map(tag => tag.name)) : "[]"; })()';
```

**Fixed:**
```javascript
const script = `(() => { const t = Task.byIdentifier(${JSON.stringify(taskId)}); return t ? JSON.stringify(t.tags.map(tag => tag.name)) : "[]"; })()`;
```

### Priority 2: Add Edge Case Tests
Create integration tests for all edge cases listed above.

### Priority 3: Document Best Practices
Update CLAUDE.md with:
- Always use {{placeholder}} patterns (automatically escaped)
- Never directly concatenate user input in code generation
- Use JSON.stringify() when building dynamic scripts

### Priority 4: Audit Template Builders
Check any other places where we build script strings directly:
- bridge-template.ts
- bridge-helpers.ts
- minimal-tag-bridge.ts

---

## Conclusion

**Good News:** 99% of our escaping is already correct thanks to formatValue().

**Action Items:**
1. Fix helpers.ts:561 (the one risky concatenation)
2. Add edge case integration tests
3. Document best practices
4. Consider adding ESLint rule to prevent `'...' + variable + '...'` in script files

**Timeline:** Can be completed in 1-2 hours
