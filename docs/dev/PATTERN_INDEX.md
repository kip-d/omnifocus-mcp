# Pattern Index - Quick Reference

**Purpose:** Find established patterns before implementing new code.

**Rule:** If you're implementing something that "feels like it should already exist", it probably does. Search first!

---

## 🔍 Quick Pattern Lookup

### Pattern: Bridge Helper (Embedded Functions)

**When to use:**

- JXA cannot access/set a property directly
- Need to use OmniJS `evaluateJavascript()` for reliable access
- Examples: tags, dates (added/modified/dropDate), repetition rules, planned dates

**Files:**

- `src/omnifocus/scripts/shared/minimal-tag-bridge.ts` - Tag assignment
- `src/omnifocus/scripts/shared/date-fields-bridge.ts` - Date field retrieval

**Pattern structure:**

```typescript
// 1. Define bridge function as template string
export const MY_BRIDGE = `
  function bridgeMyOperation(app, params) {
    try {
      // Build OmniJS script
      const omnijsScript = [
        '(() => {',
        '  const result = doSomethingInOmniJS();',
        '  return JSON.stringify(result);',
        '})()'
      ].join('\\n');

      const jsonResult = app.evaluateJavascript(omnijsScript);
      return JSON.parse(jsonResult);
    } catch (e) {
      return {}; // Graceful degradation
    }
  }
`;

// 2. Export getter
export function getMyBridge(): string {
  return MY_BRIDGE;
}
```

**Usage in scripts:**

```typescript
import { getMyBridge } from '../shared/my-bridge.js';

export const MY_SCRIPT = `
  ${getMyBridge()}  // Embed at top of script

  (() => {
    const app = Application('OmniFocus');
    // ... build your data ...

    // Call bridge function from within script
    const result = bridgeMyOperation(app, params);

    // Use result
  })()
`;
```

**Key insight:** Bridge functions are embedded INTO the script string, not called from TypeScript. This keeps everything
in one JXA execution context.

**Search command:**

```bash
grep -r "evaluateJavascript\|bridge" src/omnifocus/scripts/shared/
```

---

### Pattern: Field Access (JXA vs OmniJS)

**Problem:** Some OmniFocus properties work in JXA, others don't.

**Decision tree:**

```
Can JXA access this property directly?
├─ YES → Use direct JXA: task.propertyName()
│   Examples: name, dueDate, deferDate, flagged, completed
│
└─ NO → Use OmniJS bridge
    Examples:
    - Tag assignment (minimal-tag-bridge.ts)
    - added/modified/dropDate fields (date-fields-bridge.ts)
    - Repetition rules
    - Planned date setting
```

**How to test:**

```bash
# Create test script in /tmp/test-property.js
osascript -l JavaScript /tmp/test-property.js
```

**Search command:**

```bash
grep -A 10 "bridgeSet\|bridgeGet" src/omnifocus/scripts/shared/
```

---

### Pattern: Script Composition (Helper Embedding)

**Problem:** Need to include utility functions in JXA scripts.

**Solutions:**

1. **Unified helpers** (for most scripts):

```typescript
import { getUnifiedHelpers } from '../shared/helpers.js';

export const MY_SCRIPT = `
  ${getUnifiedHelpers()}  // All common utilities

  (() => {
    // Use helper functions like validateProject(), formatError(), etc.
  })()
`;
```

2. **Minimal helpers** (for size-critical scripts):

```typescript
import { getMinimalHelpers } from '../shared/helpers.js';
```

3. **Bridge helpers** (for OmniJS operations):

```typescript
import { getMinimalTagBridge } from '../shared/minimal-tag-bridge.js';
import { getDateFieldsBridge } from '../shared/date-fields-bridge.js';

export const MY_SCRIPT = `
  ${getMinimalTagBridge()}
  ${getDateFieldsBridge()}

  (() => {
    // Call bridge functions
  })()
`;
```

**Search command:**

```bash
grep -r "import.*shared" src/omnifocus/scripts/tasks/
```

---

### Pattern: Two-Stage Enrichment (IN-SCRIPT)

**Problem:** Need to fetch additional data for tasks after filtering.

**❌ WRONG APPROACH:**

- Run main query in TypeScript
- Run second query from TypeScript to enrich
- Merge in TypeScript

**✅ CORRECT APPROACH:**

- Embed bridge helper in script
- Filter tasks in JXA
- Call bridge FROM WITHIN SCRIPT to enrich
- Return complete results in one call

**Example:** `list-tasks.ts` lines 427-465

```typescript
// Inside the JXA script IIFE:
const results = []; // Filtered tasks

// Enrich with date fields if requested
if (needsDateFields && results.length > 0) {
  const taskIds = results.map((t) => t.id);
  const dateFields = bridgeGetDateFields(app, taskIds); // Bridge call

  // Merge into results
  for (const task of results) {
    if (dateFields[task.id]) {
      task.added = dateFields[task.id].added;
      task.modified = dateFields[task.id].modified;
    }
  }
}

return JSON.stringify({ tasks: results });
```

**Why this works:** Single osascript execution, all data collected before returning.

**Search command:**

```bash
grep -A 20 "bridgeGet.*Fields" src/omnifocus/scripts/tasks/
```

---

## 📋 Common Use Cases → Patterns

| Use Case                 | Pattern         | File Reference                                        |
| ------------------------ | --------------- | ----------------------------------------------------- |
| Set tags on task         | Bridge helper   | `minimal-tag-bridge.ts:41` (`bridgeSetTags`)          |
| Get added/modified dates | Bridge helper   | `date-fields-bridge.ts:13` (`bridgeGetDateFields`)    |
| Set planned date         | Bridge helper   | `minimal-tag-bridge.ts:73` (`bridgeSetPlannedDate`)   |
| Apply repetition rule    | Bridge helper   | `create-task.ts:142` (`applyRepetitionRuleViaBridge`) |
| Validate project exists  | Unified helpers | `helpers.ts` (`validateProject`)                      |
| Format errors            | Unified helpers | `helpers.ts` (`formatError`)                          |
| Query with filters       | Script pattern  | `list-tasks.ts` (complete example)                    |
| Create task with tags    | Script pattern  | `create-task.ts` (JXA + bridge)                       |

---

## 🔄 Pattern Evolution

**When to create a NEW pattern:**

1. You've solved a problem that could recur
2. The solution uses JXA/OmniJS techniques
3. No similar pattern exists (you searched!)

**When to EXTEND an existing pattern:**

1. Similar functionality already exists
2. Your change fits the existing structure
3. You're adding a new bridge operation

**When to REFACTOR a pattern:**

1. You found a better approach
2. Performance significantly improves
3. Reduces code duplication

**Document your decision:** Add to this file and `LESSONS_LEARNED.md`

---

## 🚨 Anti-Patterns (DON'T DO THIS)

### ❌ Two-Stage Query from TypeScript

```typescript
// DON'T: Query, then enrich from TypeScript
const tasks = await this.execJson(query1);
const enriched = await this.execJson(query2);
// Merge in TypeScript...
```

**Why wrong:** Two osascript executions, complex merge logic, prone to bugs.

**Use instead:** Embedded bridge pattern (enrich within script).

---

### ❌ Calling Bridge from TypeScript

```typescript
// DON'T: Call evaluateJavascript from TypeScript
const dates = app.evaluateJavascript(script);
```

**Why wrong:** Loses JXA context, requires complex script building.

**Use instead:** Embed bridge helper in script, call from within IIFE.

---

### ❌ Duplicating Bridge Logic

```typescript
// DON'T: Copy bridge code into multiple scripts
export const SCRIPT_A = `
  function bridgeGetTags(app, id) { /* duplicate */ }
`;

export const SCRIPT_B = `
  function bridgeGetTags(app, id) { /* duplicate */ }
`;
```

**Why wrong:** Maintenance nightmare, increases script size.

**Use instead:** Import and embed shared bridge helper.

---

## 📚 Related Documentation

- **ARCHITECTURE.md** - JXA vs OmniJS decision tree
- **PATTERNS.md** - Symptom → solution lookup
- **LESSONS_LEARNED.md** - Detailed war stories
- **CLAUDE.md** - Development guidelines and checklists

---

## 💡 How to Use This Document

1. **Before implementing:** Search this file for your use case
2. **Found a pattern:** Read the referenced file COMPLETELY
3. **No pattern found:** Check if it's an anti-pattern
4. **Still nothing:** Implement, then document your new pattern here

**Remember:** 30 minutes searching patterns > 2 hours reinventing them.
