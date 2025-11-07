# Conversion Templates for Helper Elimination

**Created:** 2025-11-07
**Purpose:** Step-by-step templates for converting scripts to pure OmniJS v3
**Target:** 28 scripts across 3 tiers
**Expected Impact:** 527KB reduction, 20x average performance gain

---

## Table of Contents

1. [Template Overview](#template-overview)
2. [Tier 1: Analytics Scripts](#tier-1-analytics-script-template) (2 scripts)
3. [Tier 2: CRUD Scripts](#tier-2-crud-script-template) (25 scripts)
4. [Tier 3: Bridge Scripts](#tier-3-bridge-script-template) (2 scripts)
5. [Common Patterns](#common-patterns-across-all-tiers)
6. [Script-to-Tier Mapping](#script-to-tier-mapping)
7. [Quick Reference Checklist](#quick-reference-checklist)

---

## Template Overview

### Performance Gains by Tier

| Tier | Scripts | Current Overhead | Target Overhead | Expected Gain | Proven By |
|------|---------|------------------|-----------------|---------------|-----------|
| **Tier 1** | 2 | 18KB each | 0KB | **13-67x faster** | productivity-stats, task-velocity |
| **Tier 2** | 25 | 18KB each | 0KB | **10-100x faster** | list-tags, list-tasks-omnijs |
| **Tier 3** | 2 | 18KB each | 3KB | **15-20% smaller** | Size reduction only |

### Key Principles

**All conversions follow these principles:**

1. ✅ **Remove getUnifiedHelpers()** - 18KB overhead elimination
2. ✅ **Use direct property access** - No safeGet() wrappers (50% faster)
3. ✅ **Single evaluateJavascript() call** - One bridge operation for all data
4. ✅ **V3 response format** - `{ok, v, data/items, summary}`
5. ✅ **Try/catch per item** - Skip invalid items, don't fail entire operation

---

## Tier 1: Analytics Script Template

**Use for:** Scripts that analyze task/project data and return statistics

**Proven Performance:** 13-67x faster than helper-based versions

**Examples:**
- `analyze-overdue.ts` (Tier 1, ready for conversion)
- `workflow-analysis.ts` (Tier 1, ready for conversion)

### Step-by-Step Conversion

#### Step 1: Analyze current script

Read the helper-based script completely:

```bash
# Example: Analyze overdue script
cat src/omnifocus/scripts/analytics/analyze-overdue.ts
```

**Understand:**
- What data does it analyze? (overdue tasks, blocked tasks, project bottlenecks)
- What calculations does it perform? (days overdue, blockage rates, averages)
- What does it return? (grouped tasks, statistics, insights)
- **What helpers does it use?** (safeGet, safeGetDate, safeIsCompleted, etc.)

#### Step 2: Study proven v3 examples

Read these PROVEN implementations:

```bash
# Best reference for analytics pattern
cat src/omnifocus/scripts/analytics/productivity-stats-v3.ts
cat src/omnifocus/scripts/analytics/task-velocity-v3.ts
```

**Key patterns to extract:**
- How they structure OmniJS script (template with `{{params}}`)
- How they iterate through collections (flattenedTasks, flattenedProjects)
- How they access properties (direct, with per-item try/catch)
- How they build response (v3 format with ok, v, data, summary)

#### Step 3: Create v3 version

**File naming:** Add `-v3.ts` suffix (e.g., `analyze-overdue-v3.ts`)

**Template structure:**

```typescript
/**
 * [SCRIPT_NAME].ts - OmniJS-First [Purpose]
 *
 * Performance improvement: [X]s → <1s ([Y]x faster)
 *
 * Key optimizations:
 * - [List specific optimizations from Phase 1 pattern]
 * - ALL property access in OmniJS context (~0.001ms vs JXA 16.662ms)
 * - Single evaluateJavascript() call for all [operations]
 *
 * Bottlenecks eliminated:
 * - [Specific bottleneck 1]: [before] → [after]
 * - [Specific bottleneck 2]: [before] → [after]
 *
 * Pattern based on: productivity-stats-v3.ts, task-velocity-v3.ts
 */

export const SCRIPT_NAME_V3 = `
  (() => {
    const app = Application('OmniFocus');
    const options = {{options}};

    try {
      const startTime = Date.now();

      // PHASE 1: Calculate boundaries/parameters (in JXA context)
      // Extract any user-provided parameters
      const parameterA = options.parameterA || 'default';
      const parameterB = options.parameterB || false;

      // Calculate any date boundaries or thresholds
      const now = new Date();
      const boundaryDate = new Date();
      // ... boundary calculations ...

      // PHASE 2: Build OmniJS script for data collection
      const dataScript = \`
        (() => {
          // Pass parameters from JXA to OmniJS
          const parameterA = \${JSON.stringify(parameterA)};
          const parameterB = \${parameterB};
          const now = new Date(\${now.getTime()});

          // Initialize counters/collectors
          let totalCount = 0;
          let specificCount = 0;
          const results = [];
          const groupedData = {};

          // OmniJS: Iterate through collection
          flattenedTasks.forEach(task => {
            try {
              // Direct property access - FAST!
              const id = task.id.primaryKey;
              const name = task.name;
              const completed = task.completed || false;
              const dueDate = task.dueDate;

              // Apply filters
              if (completed) return; // Skip completed
              if (!dueDate) return; // Skip tasks without due date

              // Perform analysis
              const isOverdue = dueDate < now;
              if (isOverdue) {
                totalCount++;

                // Calculate metrics
                const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));

                // Build result object
                results.push({
                  id: id,
                  name: name,
                  dueDate: dueDate.toISOString(),
                  daysOverdue: daysOverdue
                });

                // Group by some dimension
                const groupKey = daysOverdue > 30 ? 'critical' : 'normal';
                if (!groupedData[groupKey]) {
                  groupedData[groupKey] = [];
                }
                groupedData[groupKey].push(name);
              }

            } catch (e) {
              // Skip tasks that cause errors - don't fail entire operation
            }
          });

          // Return JSON string from OmniJS
          return JSON.stringify({
            totalCount: totalCount,
            results: results,
            grouped: groupedData
          });
        })()
      \`;

      // PHASE 3: Execute OmniJS script - SINGLE BRIDGE CALL!
      const resultJson = app.evaluateJavascript(dataScript);
      const data = JSON.parse(resultJson);

      // PHASE 4: Post-process and build insights (in JXA context)
      const insights = [];

      if (data.totalCount === 0) {
        insights.push("No items found");
      } else if (data.totalCount > 50) {
        insights.push("High volume: " + data.totalCount + " items");
      }

      // Calculate summary statistics
      const avgValue = data.totalCount > 0 ?
        (data.results.reduce((sum, r) => sum + r.daysOverdue, 0) / data.totalCount).toFixed(1) : 0;

      const endTime = Date.now();

      // PHASE 5: Return v3 format
      return JSON.stringify({
        ok: true,
        v: '3',
        data: {
          summary: {
            total: data.totalCount,
            average: parseFloat(avgValue),
            // ... other summary stats
          },
          results: data.results,
          grouped: data.grouped,
          insights: insights,
          metadata: {
            generated_at: new Date().toISOString(),
            method: 'omnijs_v3_single_bridge',
            optimization: 'omnijs_v3',
            query_time_ms: endTime - startTime
          }
        }
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        v: '3',
        error: {
          message: 'Failed to [operation]: ' + (error && error.toString ? error.toString() : 'Unknown error'),
          details: error && error.message ? error.message : undefined
        }
      });
    }
  })();
`;
```

#### Step 4: Key patterns to follow

**✅ DO:**

1. **Use direct property access:**
   ```javascript
   // ✅ CORRECT - Direct access with per-item try/catch
   flattenedTasks.forEach(task => {
     try {
       const name = task.name;
       const completed = task.completed || false;
       // ... use values
     } catch (e) {
       // Skip this task
     }
   });
   ```

2. **Use v3 response format:**
   ```javascript
   return JSON.stringify({
     ok: true,
     v: '3',
     data: { /* your data */ },
     summary: { /* summary stats */ },
     metadata: { query_time_ms: endTime - startTime }
   });
   ```

3. **Calculate in OmniJS context:**
   ```javascript
   // ✅ CORRECT - All calculations inside OmniJS
   const avgValue = total > 0 ? (sum / total).toFixed(1) : '0.0';
   ```

**❌ DON'T:**

1. **Import helpers:**
   ```javascript
   // ❌ WRONG
   import { getUnifiedHelpers } from '../shared/helpers.js';
   ${getUnifiedHelpers()}
   ```

2. **Use safeGet wrappers:**
   ```javascript
   // ❌ WRONG - 50% slower
   const value = safeGet(() => item.property);

   // ✅ CORRECT - Direct access in try/catch
   try {
     const value = item.property;
   } catch (e) {
     // Skip or default
   }
   ```

3. **Use .where() or .whose():**
   ```javascript
   // ❌ WRONG - Doesn't exist in our environment
   const tasks = doc.flattenedTasks.where(t => !t.completed);

   // ✅ CORRECT - Filter manually
   flattenedTasks.forEach(task => {
     if (task.completed) return; // Skip
     // ... process task
   });
   ```

4. **Return raw arrays:**
   ```javascript
   // ❌ WRONG
   return JSON.stringify(results);

   // ✅ CORRECT - Wrap in v3 format
   return JSON.stringify({
     ok: true,
     v: '3',
     data: { results: results }
   });
   ```

#### Step 5: Test conversion

```bash
# Build
npm run build

# Run integration test
npm test -- --testPathPattern="script-name"

# Verify response structure
node test-single-tool.js tool_name '{"param":"value"}'
```

**Compare:**
- Performance (should be 10-100x faster)
- Response structure (should match v3 format)
- Functionality (should produce same results)

#### Step 6: Update tool import

Update the corresponding tool file:

```typescript
// Before
import { ANALYZE_OVERDUE_SCRIPT } from '../../omnifocus/scripts/analytics/analyze-overdue.js';

// After
import { ANALYZE_OVERDUE_SCRIPT_V3 as ANALYZE_OVERDUE_SCRIPT } from '../../omnifocus/scripts/analytics/analyze-overdue-v3.js';
```

#### Step 7: Commit with descriptive message

```
Convert [script-name] to pure OmniJS v3 ([X]x faster)

Converted from helper-based to pure OmniJS bridge:
- Removed getUnifiedHelpers() (~18KB overhead)
- Direct property access instead of safeGet() (50% faster)
- Single evaluateJavascript() call for all data
- V3 response format with metadata

Performance:
- Before: [X] seconds
- After: [Y] seconds
- Improvement: [Z]x faster

Tests: ✅ All passing
Size: -18KB per script execution

Part of Phase 2B Tier 1 conversions.
```

### Before/After Example: analyze-overdue.ts

**BEFORE (Helper-based, 18KB overhead):**

```typescript
import { getUnifiedHelpers } from '../shared/helpers.js';

export const ANALYZE_OVERDUE_SCRIPT = `
  ${getUnifiedHelpers()}  // ❌ 18KB overhead

  (() => {
    const options = {{options}};

    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      const allTasks = doc.flattenedTasks();

      const overdueTasks = [];

      for (let i = 0; i < allTasks.length; i++) {
        const task = allTasks[i];

        // ❌ safeGet wrapper - 50% slower
        const isCompleted = safeIsCompleted(task);
        if (isCompleted) continue;

        const dueDateStr = safeGetDate(() => task.dueDate());
        if (!dueDateStr) continue;

        const dueDate = new Date(dueDateStr);
        const now = new Date();
        if (dueDate >= now) continue;

        // ❌ Multiple safeGet calls per task
        const taskName = safeGet(() => task.name(), 'Unnamed');
        const taskId = safeGet(() => task.id(), 'unknown');

        overdueTasks.push({
          id: taskId,
          name: taskName,
          dueDate: dueDateStr
        });
      }

      return JSON.stringify({
        ok: true,
        v: '1',  // ❌ Old format
        data: { overdueTasks }
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: { message: error.toString() }
      });
    }
  })();
`;
```

**AFTER (Pure OmniJS v3, 0KB overhead):**

```typescript
// ✅ No helper imports!

export const ANALYZE_OVERDUE_SCRIPT_V3 = `
  (() => {
    const app = Application('OmniFocus');
    const options = {{options}};

    try {
      const startTime = Date.now();
      const now = new Date();

      // ✅ Single OmniJS bridge call
      const dataScript = \`
        (() => {
          const now = new Date(\${now.getTime()});
          const overdueTasks = [];

          // ✅ Direct property access in OmniJS
          flattenedTasks.forEach(task => {
            try {
              if (task.completed) return;

              const dueDate = task.dueDate;
              if (!dueDate || dueDate >= now) return;

              overdueTasks.push({
                id: task.id.primaryKey,
                name: task.name,
                dueDate: dueDate.toISOString(),
                daysOverdue: Math.floor((now - dueDate) / (1000 * 60 * 60 * 24))
              });
            } catch (e) {
              // Skip invalid tasks
            }
          });

          return JSON.stringify({
            overdueTasks: overdueTasks,
            total: overdueTasks.length
          });
        })()
      \`;

      const resultJson = app.evaluateJavascript(dataScript);
      const data = JSON.parse(resultJson);

      const endTime = Date.now();

      // ✅ V3 response format
      return JSON.stringify({
        ok: true,
        v: '3',
        data: {
          summary: {
            totalOverdue: data.total,
            avgDaysOverdue: data.overdueTasks.length > 0 ?
              (data.overdueTasks.reduce((sum, t) => sum + t.daysOverdue, 0) / data.total).toFixed(1) : '0.0'
          },
          overdueTasks: data.overdueTasks,
          metadata: {
            query_time_ms: endTime - startTime,
            optimization: 'omnijs_v3'
          }
        }
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        v: '3',
        error: {
          message: 'Failed to analyze overdue: ' + (error && error.toString ? error.toString() : 'Unknown error'),
          details: error && error.message ? error.message : undefined
        }
      });
    }
  })();
`;
```

**Performance comparison:**
- Before: ~5-10 seconds (JXA property access overhead)
- After: <1 second (OmniJS direct access)
- Improvement: 5-10x faster

---

## Tier 2: CRUD Script Template

**Use for:** Scripts that create, read, update, or list tasks/projects/tags

**Expected Performance:** 10-100x faster than helper-based versions

**Examples:**
- `list-projects.ts` (25 scripts in Tier 2)
- `update-project.ts`
- `manage-folders.ts`
- `list-perspectives.ts`

### Step-by-Step Conversion

#### Step 1: Classify the operation

Determine what type of CRUD operation:

| Type | Pattern | Example |
|------|---------|---------|
| **List** | Query collection, return array | list-projects, list-tags |
| **Get** | Find by ID, return single item | get-project, get-folder |
| **Create** | Make new item, return confirmation | create-project, create-folder |
| **Update** | Modify existing, return updated | update-project, update-folder |
| **Delete** | Remove item, return confirmation | delete-project, delete-folder |

#### Step 2: Study proven v3 examples

Read the appropriate reference:

```bash
# For LIST operations
cat src/omnifocus/scripts/tags/list-tags-v3.ts
cat src/omnifocus/scripts/tasks/list-tasks-omnijs.ts

# For query operations with modes
cat src/omnifocus/scripts/tasks/list-tasks-omnijs.ts  # Has inbox, today, overdue, etc.
```

**Key patterns for CRUD:**
- Parameter validation (projectId, folderId, etc.)
- Existence checks (does project exist?)
- Collection iteration (flattenedProjects, flattenedFolders)
- Result filtering (by status, flags, search terms)
- Result transformation (build response objects)

#### Step 3: Create v3 version

**Template structure for LIST operations:**

```typescript
/**
 * list-[items].ts - OmniJS-First [Item] Query (v3)
 *
 * Performance improvement: All modes use OmniJS bridge
 *
 * Key optimizations:
 * - JXA iteration → OmniJS flattenedItems ([X]s → <0.5s expected)
 * - Pure OmniJS bridge - no helper dependencies (24% smaller)
 * - Direct property access instead of safeGet wrappers
 *
 * Pattern based on: list-tags-v3.ts, list-tasks-omnijs.ts
 */

export const LIST_ITEMS_SCRIPT_V3 = `
  (() => {
    const app = Application('OmniFocus');
    const options = {{options}};

    try {
      const startTime = Date.now();

      // Extract filter parameters
      const statusFilter = options.status || [];
      const searchTerm = options.search ? options.search.toLowerCase() : '';
      const limit = options.limit || 100;
      const includeStats = options.includeStats || false;

      // Build OmniJS script for data collection
      const dataScript = \`
        (() => {
          const statusFilter = \${JSON.stringify(statusFilter)};
          const searchTerm = \${JSON.stringify(searchTerm)};
          const limit = \${limit};
          const includeStats = \${includeStats};

          const results = [];
          let count = 0;

          // OmniJS: Iterate through collection
          flattenedItems.forEach(item => {
            if (count >= limit) return;

            try {
              // Apply filters
              const status = item.status ? String(item.status) : 'unknown';
              if (statusFilter.length > 0 && !statusFilter.includes(status)) {
                return;
              }

              // Apply search filter
              if (searchTerm) {
                const name = (item.name || '').toLowerCase();
                const note = (item.note || '').toLowerCase();
                if (!name.includes(searchTerm) && !note.includes(searchTerm)) {
                  return;
                }
              }

              // Build result object
              const result = {
                id: item.id.primaryKey,
                name: item.name,
                status: status,
                flagged: item.flagged || false
              };

              // Add optional properties
              if (item.note) {
                result.note = item.note;
              }

              if (item.dueDate) {
                result.dueDate = item.dueDate.toISOString();
              }

              // Add stats if requested
              if (includeStats) {
                // Calculate statistics in OmniJS
                const tasks = item.flattenedTasks || [];
                let activeCount = 0;
                let completedCount = 0;

                tasks.forEach(task => {
                  if (task.completed) {
                    completedCount++;
                  } else {
                    activeCount++;
                  }
                });

                result.stats = {
                  total: tasks.length,
                  active: activeCount,
                  completed: completedCount,
                  completionRate: tasks.length > 0 ?
                    Math.round((completedCount / tasks.length) * 100) : 0
                };
              }

              results.push(result);
              count++;

            } catch (e) {
              // Skip items that cause errors
            }
          });

          return JSON.stringify({
            items: results,
            total: count
          });
        })()
      \`;

      // Execute OmniJS script - SINGLE BRIDGE CALL!
      const resultJson = app.evaluateJavascript(dataScript);
      const data = JSON.parse(resultJson);

      // Sort results (if needed)
      if (options.sortBy === 'name') {
        data.items.sort((a, b) => a.name.localeCompare(b.name));
      }

      const endTime = Date.now();

      // Build summary
      const summary = {
        total: data.total,
        insights: ["Found " + data.total + " items"],
        query_time_ms: endTime - startTime,
        optimization: 'omnijs_v3'
      };

      return JSON.stringify({
        ok: true,
        v: '3',
        items: data.items,
        summary: summary
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        v: '3',
        error: {
          message: 'Failed to list items: ' + (error && error.toString ? error.toString() : 'Unknown error'),
          details: error && error.message ? error.message : undefined
        }
      });
    }
  })();
`;
```

**Template structure for UPDATE operations:**

```typescript
export const UPDATE_ITEM_SCRIPT_V3 = `
  (() => {
    const app = Application('OmniFocus');
    const itemId = {{itemId}};
    const updates = {{updates}};

    try {
      const startTime = Date.now();

      // Build OmniJS script for update operation
      const updateScript = \`
        (() => {
          const targetId = \${JSON.stringify(itemId)};
          const updates = \${JSON.stringify(updates)};

          // Find item by ID
          let foundItem = null;
          flattenedItems.forEach(item => {
            if (item.id.primaryKey === targetId) {
              foundItem = item;
            }
          });

          if (!foundItem) {
            return JSON.stringify({
              success: false,
              error: 'Item not found with ID: ' + targetId
            });
          }

          // Apply updates
          if (updates.name !== undefined) {
            foundItem.name = updates.name;
          }

          if (updates.note !== undefined) {
            foundItem.note = updates.note;
          }

          if (updates.flagged !== undefined) {
            foundItem.flagged = updates.flagged;
          }

          if (updates.dueDate !== undefined) {
            foundItem.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
          }

          // Return updated item
          return JSON.stringify({
            success: true,
            item: {
              id: foundItem.id.primaryKey,
              name: foundItem.name,
              note: foundItem.note || '',
              flagged: foundItem.flagged || false,
              dueDate: foundItem.dueDate ? foundItem.dueDate.toISOString() : null
            }
          });
        })()
      \`;

      // Execute update
      const resultJson = app.evaluateJavascript(updateScript);
      const result = JSON.parse(resultJson);

      if (!result.success) {
        return JSON.stringify({
          ok: false,
          v: '3',
          error: {
            message: result.error
          }
        });
      }

      const endTime = Date.now();

      return JSON.stringify({
        ok: true,
        v: '3',
        data: {
          item: result.item,
          metadata: {
            updated_at: new Date().toISOString(),
            query_time_ms: endTime - startTime,
            optimization: 'omnijs_v3'
          }
        }
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        v: '3',
        error: {
          message: 'Failed to update item: ' + (error && error.toString ? error.toString() : 'Unknown error'),
          details: error && error.message ? error.message : undefined
        }
      });
    }
  })();
`;
```

#### Step 4: Handle special cases

**Case 1: Status enums**

```javascript
// ✅ CORRECT - Use enum comparison in OmniJS
const isActive = project.status === Project.Status.Active;
const status = project.status === Project.Status.Active ? 'active' :
              project.status === Project.Status.OnHold ? 'on-hold' :
              project.status === Project.Status.Done ? 'done' : 'dropped';
```

**Case 2: Nested properties**

```javascript
// ✅ CORRECT - Check parent existence
const parent = item.parent;
if (parent) {
  result.parentId = parent.id.primaryKey;
  result.parentName = parent.name;
}
```

**Case 3: Collections (tags, subtasks)**

```javascript
// ✅ CORRECT - Iterate safely
const tags = item.tags || [];
result.tags = tags.map(tag => tag.name);

const subtasks = item.tasks || [];
result.subtaskCount = subtasks.length;
```

#### Step 5: Test thoroughly

```bash
# Build
npm run build

# Test specific operations
npm test -- --testPathPattern="list-projects"

# Manual testing with various filters
node test-single-tool.js projects '{"status":["active"],"limit":5}'
node test-single-tool.js projects '{"search":"work","includeStats":true}'
```

**Verify:**
- All filter combinations work
- Statistics calculated correctly
- Response structure matches v3 format
- Performance improved significantly

#### Step 6: Update tool and commit

Same as Tier 1 (Step 6-7).

### Before/After Example: list-projects.ts

**BEFORE (Helper-based, 310 lines with helpers):**

```typescript
import { getUnifiedHelpers } from '../shared/helpers.js';

export const LIST_PROJECTS_SCRIPT = `
  ${getUnifiedHelpers()}  // ❌ 18KB overhead

  (() => {
    const filter = {{filter}};
    const limit = {{limit}};
    const includeStats = {{includeStats}};

    const projects = [];

    try {
      const app = Application('OmniFocus');
      const doc = app.defaultDocument();
      const allProjects = doc.flattenedProjects();

      for (let i = 0; i < allProjects.length; i++) {
        const project = allProjects[i];

        // ❌ Helper wrapper - slower
        const projectStatus = safeGetStatus(project);
        if (filter.status && !filter.status.includes(projectStatus)) {
          continue;
        }

        // ❌ Multiple safeGet calls per project
        const projectObj = {
          id: safeGet(() => project.id(), 'unknown'),
          name: safeGet(() => project.name(), 'Unnamed'),
          status: projectStatus,
          flagged: isFlagged(project)
        };

        projects.push(projectObj);
      }

      return JSON.stringify({
        projects: projects,
        metadata: { total: projects.length }
      });

    } catch (error) {
      return formatError(error, 'list_projects');
    }
  })();
`;
```

**AFTER (Pure OmniJS v3, 150 lines without helpers):**

```typescript
// ✅ No helper imports!

export const LIST_PROJECTS_SCRIPT_V3 = `
  (() => {
    const app = Application('OmniFocus');
    const options = {{options}};

    try {
      const startTime = Date.now();

      const statusFilter = options.status || [];
      const limit = options.limit || 100;

      // ✅ Single OmniJS bridge call
      const dataScript = \`
        (() => {
          const statusFilter = \${JSON.stringify(statusFilter)};
          const limit = \${limit};

          const results = [];
          let count = 0;

          // ✅ Direct property access in OmniJS
          flattenedProjects.forEach(project => {
            if (count >= limit) return;

            try {
              // Direct status check
              const status = project.status === Project.Status.Active ? 'active' :
                            project.status === Project.Status.OnHold ? 'on-hold' :
                            project.status === Project.Status.Done ? 'done' : 'dropped';

              if (statusFilter.length > 0 && !statusFilter.includes(status)) {
                return;
              }

              results.push({
                id: project.id.primaryKey,
                name: project.name,
                status: status,
                flagged: project.flagged || false
              });

              count++;
            } catch (e) {
              // Skip invalid projects
            }
          });

          return JSON.stringify({
            items: results,
            total: count
          });
        })()
      \`;

      const resultJson = app.evaluateJavascript(dataScript);
      const data = JSON.parse(resultJson);

      const endTime = Date.now();

      // ✅ V3 response format
      return JSON.stringify({
        ok: true,
        v: '3',
        items: data.items,
        summary: {
          total: data.total,
          insights: ["Found " + data.total + " projects"],
          query_time_ms: endTime - startTime,
          optimization: 'omnijs_v3'
        }
      });

    } catch (error) {
      return JSON.stringify({
        ok: false,
        v: '3',
        error: {
          message: 'Failed to list projects: ' + (error && error.toString ? error.toString() : 'Unknown error'),
          details: error && error.message ? error.message : undefined
        }
      });
    }
  })();
`;
```

**Performance comparison:**
- Before: ~3-6 seconds (JXA iteration + safeGet wrappers)
- After: <0.5 seconds (OmniJS direct access)
- Improvement: 6-12x faster
- Size: 310 lines → 150 lines (51% reduction)

---

## Tier 3: Bridge Script Template

**Use for:** Scripts that MUST use bridge operations (tags, repeat rules, planned dates)

**Expected Impact:** 15-20% smaller bundles, functionality preserved

**Examples:**
- `create-task.ts` (already updated in QW2, needs helper removal)
- `update-task.ts` (already updated in QW2, needs helper removal)

### Step-by-Step Conversion

#### Step 1: Verify bridge requirements

Confirm the script needs bridge operations:

**Bridge operations (REQUIRED for these features):**
1. ✅ `bridgeSetTags()` - Tag assignment (JXA doesn't persist)
2. ✅ `applyRepetitionRuleViaBridge()` - Repeat rules (complex objects)
3. ✅ `bridgeSetPlannedDate()` - Planned date (JXA doesn't persist)

**If NO bridge operations needed → Use Tier 2 template instead!**

#### Step 2: Audit getUnifiedHelpers() usage

List which functions are actually used:

```bash
# Extract function calls from script
grep -o "[a-zA-Z_][a-zA-Z0-9_]*(" src/omnifocus/scripts/tasks/create-task.ts | sort -u
```

**Cross-reference with getUnifiedHelpers() functions.**

**Typical usage in create-task/update-task:**
- `bridgeSetTags()` - ✅ ESSENTIAL (keep)
- `applyRepetitionRuleViaBridge()` - ✅ ESSENTIAL (keep)
- `bridgeSetPlannedDate()` - ✅ ESSENTIAL (keep)
- `prepareRepetitionRuleData()` - ✅ ESSENTIAL (keep)
- `convertToRRULE()` - ✅ ESSENTIAL (keep)
- `convertToOmniMethod()` - ✅ ESSENTIAL (keep)
- `applyDeferAnother()` - ✅ ESSENTIAL (keep)
- `validateProject()` - ⚠️ USEFUL (inline if simple)
- `formatError()` - ⚠️ USEFUL (inline if simple)
- `safeGet()` - ❌ OVERHEAD (remove, use try/catch)
- `safeGetDate()` - ❌ OVERHEAD (remove, use try/catch)
- All other helpers - ❌ OVERHEAD (not used)

#### Step 3: Create essential bridge helpers file

**File:** `src/omnifocus/scripts/shared/essential-bridge-helpers.ts`

```typescript
/**
 * Essential Bridge Helpers - MINIMAL bundle for bridge-dependent operations
 *
 * Size: ~3KB (vs 18KB for getUnifiedHelpers)
 * Purpose: Only functions REQUIRED for bridge operations
 * Used by: create-task.ts, update-task.ts
 *
 * This bundle contains ONLY:
 * 1. Tag assignment bridge (JXA limitation)
 * 2. Repeat rule bridge (complex objects)
 * 3. Planned date bridge (JXA limitation)
 * 4. Helper functions these depend on
 *
 * DO NOT ADD: safeGet, safeGetDate, or other convenience wrappers
 */

// ===== TAG BRIDGE =====

function __formatTagScript(tagNames: string[]): string {
  // ... implementation from minimal-tag-bridge.ts
}

function bridgeSetTags(app: any, taskId: string, tagNames: string[]): any {
  // ... implementation from minimal-tag-bridge.ts
}

// ===== REPEAT RULE BRIDGE =====

function convertToRRULE(rule: any): string | null {
  // ... implementation from repeat-helpers.ts (better version)
}

function convertToOmniMethod(method: string): string {
  // ... implementation from repeat-helpers.ts
}

function prepareRepetitionRuleData(repeatRule: any): any {
  // ... implementation from repeat-helpers.ts
}

function applyRepetitionRuleViaBridge(taskId: string, ruleData: any): boolean {
  // ... implementation from repeat-helpers.ts
}

function applyDeferAnother(task: any, repeatRule: any): void {
  // ... implementation from repeat-helpers.ts
}

// ===== PLANNED DATE BRIDGE =====

function bridgeSetPlannedDate(app: any, taskId: string, plannedDate: string): any {
  // ... implementation from existing code
}

// ===== EXPORT SINGLE BUNDLE =====

export function getEssentialBridgeHelpers(): string {
  return `
    ${__formatTagScript.toString()}
    ${bridgeSetTags.toString()}
    ${convertToRRULE.toString()}
    ${convertToOmniMethod.toString()}
    ${prepareRepetitionRuleData.toString()}
    ${applyRepetitionRuleViaBridge.toString()}
    ${applyDeferAnother.toString()}
    ${bridgeSetPlannedDate.toString()}
  `;
}
```

#### Step 4: Update bridge-dependent scripts

**Update create-task.ts:**

```typescript
// Before
import { getUnifiedHelpers } from '../shared/helpers.js';
import { getMinimalTagBridge } from '../shared/minimal-tag-bridge.js';
import { REPEAT_HELPERS } from '../shared/repeat-helpers.js';

export const CREATE_TASK_SCRIPT = `
  ${getUnifiedHelpers()}  // ❌ 18KB
  ${getMinimalTagBridge()}  // ❌ Duplicate
  ${REPEAT_HELPERS}  // ❌ Duplicate
  // ... script logic
`;
```

```typescript
// After
import { getEssentialBridgeHelpers } from '../shared/essential-bridge-helpers.js';

export const CREATE_TASK_SCRIPT = `
  ${getEssentialBridgeHelpers()}  // ✅ 3KB (all-in-one)

  // ✅ Inline simple helpers instead of importing
  function validateProject(projectId, doc) {
    if (!projectId || projectId === 'null' || projectId === '') {
      return { valid: true, project: null };
    }

    const projects = doc.flattenedProjects();
    for (let i = 0; i < projects.length; i++) {
      if (projects[i].id() === projectId) {
        return { valid: true, project: projects[i] };
      }
    }

    return { valid: false, error: 'Project not found: ' + projectId };
  }

  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const taskData = {{taskData}};

    try {
      // Validate project (inlined)
      if (taskData.projectId) {
        const validation = validateProject(taskData.projectId, doc);
        if (!validation.valid) {
          return JSON.stringify({ error: true, message: validation.error });
        }
      }

      // Create task (JXA)
      const task = app.Task({
        name: taskData.name,
        note: taskData.note || '',
        flagged: taskData.flagged || false
      });

      // ... add to container ...

      const taskId = task.id();

      // Apply tags via bridge (REQUIRED)
      if (taskData.tags && taskData.tags.length > 0) {
        const tagResult = bridgeSetTags(app, taskId, taskData.tags);
        // ... handle result ...
      }

      // Apply repeat rule via bridge (REQUIRED)
      if (taskData.repeatRule) {
        const ruleData = prepareRepetitionRuleData(taskData.repeatRule);
        applyRepetitionRuleViaBridge(taskId, ruleData);
      }

      // Apply planned date via bridge (REQUIRED)
      if (taskData.plannedDate) {
        bridgeSetPlannedDate(app, taskId, taskData.plannedDate);
      }

      // Return result (no formatError wrapper)
      return JSON.stringify({
        taskId: taskId,
        name: task.name(),
        created: true
      });

    } catch (error) {
      // Inline error formatting
      return JSON.stringify({
        error: true,
        message: 'Failed to create task: ' + (error && error.toString ? error.toString() : 'Unknown error'),
        details: error && error.message ? error.message : undefined
      });
    }
  })();
`;
```

**Savings:**
- Before: 18KB + duplicates = ~20KB
- After: 3KB essential bundle = 3KB
- **Reduction: 17KB (85% smaller)**

#### Step 5: Test bridge operations thoroughly

Bridge operations are critical for task creation/updates:

```bash
# Build
npm run build

# Test all bridge operations
npm test -- --testPathPattern="create-task"
npm test -- --testPathPattern="update-task"

# Manual testing
node test-single-tool.js manage_task '{
  "operation":"create",
  "name":"Test Task",
  "tags":["work","urgent"],
  "repeatRule":{"frequency":"daily"},
  "plannedDate":"2025-11-08"
}'
```

**Verify:**
1. ✅ Tags appear in OmniFocus immediately
2. ✅ Repeat rule set correctly
3. ✅ Planned date persists
4. ✅ All combinations work (tags + repeat, tags + planned, etc.)

#### Step 6: Measure bundle size

```bash
# Before
ls -lh dist/omnifocus/scripts/tasks/create-task.js
# ~50KB

# After
ls -lh dist/omnifocus/scripts/tasks/create-task.js
# ~35KB (15KB reduction = 30% smaller)
```

#### Step 7: Commit

```
Migrate [script-name] to essential bridge bundle (85% smaller)

Replaced getUnifiedHelpers() with essential bridge bundle:
- Before: 18KB + duplicates (~20KB overhead)
- After: 3KB essential bundle (all-in-one)
- Reduction: 17KB (85% smaller)

Changes:
- Consolidated tag/repeat/planned-date bridges
- Inlined simple helpers (validateProject, error formatting)
- Removed safeGet wrappers (use try/catch)
- Removed unused helper functions

Functionality: ✅ ALL bridge operations work
Tests: ✅ All passing
Size: -17KB per script execution

Part of Phase 2B Tier 3 conversions.
```

---

## Common Patterns Across All Tiers

### Pattern 1: V3 Response Format

**ALWAYS use this structure:**

```javascript
// Success response
return JSON.stringify({
  ok: true,
  v: '3',
  data: {
    // Your data here
  },
  // OR for lists
  items: [
    // Your items here
  ],
  summary: {
    total: count,
    insights: ["Human-readable insight"],
    query_time_ms: endTime - startTime
  },
  metadata: {
    generated_at: new Date().toISOString(),
    optimization: 'omnijs_v3',
    method: 'single_bridge'
  }
});

// Error response
return JSON.stringify({
  ok: false,
  v: '3',
  error: {
    message: 'Brief error message',
    details: 'Detailed error information'
  }
});
```

### Pattern 2: Direct Property Access

**Replace safeGet with try/catch:**

```javascript
// ❌ BEFORE (50% slower)
const name = safeGet(() => item.name(), 'default');
const completed = safeIsCompleted(item);

// ✅ AFTER (direct, fast)
try {
  const name = item.name || 'default';
  const completed = item.completed || false;
} catch (e) {
  // Skip or use default
}
```

**Best practice - per-item try/catch:**

```javascript
flattenedItems.forEach(item => {
  try {
    // Access ALL properties for this item
    const id = item.id.primaryKey;
    const name = item.name;
    const status = item.status;

    // Process item...

  } catch (e) {
    // Skip this item entirely if ANY property fails
  }
});
```

### Pattern 3: OmniJS Iteration

**ALWAYS iterate in OmniJS context:**

```javascript
// ✅ CORRECT - Iterate in OmniJS
const dataScript = `
  (() => {
    const results = [];

    flattenedTasks.forEach(task => {
      try {
        results.push({
          id: task.id.primaryKey,
          name: task.name
        });
      } catch (e) {
        // Skip
      }
    });

    return JSON.stringify({ items: results });
  })()
`;

const resultJson = app.evaluateJavascript(dataScript);
const data = JSON.parse(resultJson);
```

**DON'T iterate in JXA:**

```javascript
// ❌ WRONG - Slow JXA iteration
const allTasks = doc.flattenedTasks();
for (let i = 0; i < allTasks.length; i++) {
  const task = allTasks[i];
  const name = safeGet(() => task.name());  // 16ms per call!
}
```

### Pattern 4: Error Handling

**Wrap entire script in try/catch:**

```javascript
export const SCRIPT_NAME = `
  (() => {
    const app = Application('OmniFocus');
    const options = {{options}};

    try {
      // ... all logic here ...

      return JSON.stringify({
        ok: true,
        v: '3',
        data: result
      });

    } catch (error) {
      // Catch ANY errors from entire script
      return JSON.stringify({
        ok: false,
        v: '3',
        error: {
          message: 'Failed to [operation]: ' + (error && error.toString ? error.toString() : 'Unknown error'),
          details: error && error.message ? error.message : undefined
        }
      });
    }
  })();
`;
```

### Pattern 5: Date Handling

**Always return ISO strings from OmniJS:**

```javascript
// ✅ CORRECT - ISO string in OmniJS
const dueDate = task.dueDate;
result.dueDate = dueDate ? dueDate.toISOString() : null;
```

**Don't use safeGetDate:**

```javascript
// ❌ WRONG - Helper wrapper
const dueDate = safeGetDate(() => task.dueDate());
```

### Pattern 6: Enum Comparisons

**Use enum constants in OmniJS:**

```javascript
// ✅ CORRECT - Direct enum comparison
const isActive = project.status === Project.Status.Active;
const isBlocked = task.taskStatus === Task.Status.Blocked;
const isAvailable = task.taskStatus === Task.Status.Available;
```

**Convert to strings for return:**

```javascript
const status = project.status === Project.Status.Active ? 'active' :
              project.status === Project.Status.OnHold ? 'on-hold' :
              project.status === Project.Status.Done ? 'done' : 'dropped';
```

### Pattern 7: Nested Properties

**Check existence before access:**

```javascript
// ✅ CORRECT - Check parent exists
const parent = item.parent;
if (parent) {
  result.parentId = parent.id.primaryKey;
  result.parentName = parent.name;
}

// ✅ CORRECT - Check project exists
const project = task.containingProject;
if (project) {
  result.project = project.name;
  result.projectId = project.id.primaryKey;
} else {
  result.project = null;
  result.projectId = null;
}
```

---

## Script-to-Tier Mapping

### Tier 1: Analytics Scripts (2 scripts, ~6-8 hours)

| Script | Path | Effort | Priority | Expected Gain |
|--------|------|--------|----------|---------------|
| analyze-overdue | `analytics/analyze-overdue.ts` | 3 hours | HIGH | 13-67x faster |
| workflow-analysis | `analytics/workflow-analysis.ts` | 4 hours | HIGH | 13-67x faster |

**Pattern:** Follow productivity-stats-v3.ts template
**Size reduction:** 36KB (2 × 18KB)

### Tier 2: CRUD/Query Scripts (25 scripts, ~75-125 hours)

#### Folders (5 scripts, ~15-25 hours)

| Script | Path | Effort | Pattern |
|--------|------|--------|---------|
| list-folders | `folders/list-folders.ts` | 3-5 hours | LIST |
| get-folder | `folders/get-folder.ts` | 2-4 hours | GET |
| create-folder | `folders/create-folder.ts` | 3-5 hours | CREATE |
| update-folder | `folders/update-folder.ts` | 3-5 hours | UPDATE |
| delete-folder | `folders/delete-folder.ts` | 2-4 hours | DELETE |

#### Projects (5 scripts, ~15-25 hours)

| Script | Path | Effort | Pattern |
|--------|------|--------|---------|
| list-projects | `projects/list-projects.ts` | 4-6 hours | LIST |
| get-project | `projects/get-project.ts` | 2-4 hours | GET |
| create-project | `projects/create-project.ts` | 4-6 hours | CREATE |
| update-project | `projects/update-project.ts` | 4-6 hours | UPDATE |
| complete-project | `projects/complete-project.ts` | 2-4 hours | UPDATE |

#### Reviews (3 scripts, ~9-15 hours)

| Script | Path | Effort | Pattern |
|--------|------|--------|---------|
| list-reviews | `reviews/list-reviews.ts` | 3-5 hours | LIST |
| mark-reviewed | `reviews/mark-reviewed.ts` | 3-5 hours | UPDATE |
| update-review-interval | `reviews/update-review-interval.ts` | 3-5 hours | UPDATE |

#### Tasks - Simple (4 scripts, ~12-20 hours)

| Script | Path | Effort | Pattern |
|--------|------|--------|---------|
| move-task | `tasks/move-task.ts` | 3-5 hours | UPDATE |
| complete-task | `tasks/complete-task.ts` | 2-4 hours | UPDATE |
| delete-task | `tasks/delete-task.ts` | 2-4 hours | DELETE |
| get-task | `tasks/get-task.ts` | 3-5 hours | GET |

#### Recurring (2 scripts, ~6-10 hours)

| Script | Path | Effort | Pattern |
|--------|------|--------|---------|
| list-recurring | `recurring/list-recurring.ts` | 3-5 hours | LIST |
| analyze-recurring | `recurring/analyze-recurring.ts` | 3-5 hours | ANALYTICS |

#### Export (2 scripts, ~6-10 hours)

| Script | Path | Effort | Pattern |
|--------|------|--------|---------|
| export-tasks | `export/export-tasks.ts` | 3-5 hours | LIST |
| export-projects | `export/export-projects.ts` | 3-5 hours | LIST |

#### Tags (1 script, ~3-5 hours)

| Script | Path | Effort | Pattern |
|--------|------|--------|---------|
| manage-tags | `tags/manage-tags.ts` | 3-5 hours | CRUD |

#### Other (3 scripts, ~9-15 hours)

| Script | Path | Effort | Pattern |
|--------|------|--------|---------|
| list-perspectives | `perspectives/list-perspectives.ts` | 3-5 hours | LIST |
| agenda-tasks | `agenda/agenda-tasks.ts` | 3-5 hours | LIST |
| search-all | `search/search-all.ts` | 3-5 hours | LIST |

**Pattern:** Follow list-tags-v3.ts or list-tasks-omnijs.ts
**Size reduction:** 450KB (25 × 18KB)

### Tier 3: Bridge Scripts (2 scripts, ~10-12 hours)

| Script | Path | Effort | Priority | Expected Gain |
|--------|------|--------|----------|---------------|
| create-task | `tasks/create-task.ts` | 5-6 hours | MEDIUM | 85% smaller bundle |
| update-task | `tasks/update-task.ts` | 5-6 hours | MEDIUM | 85% smaller bundle |

**Pattern:** Use essential bridge helpers bundle
**Size reduction:** 34KB (2 × 17KB)

**Total size reduction:** 36KB + 450KB + 34KB = **520KB**

---

## Quick Reference Checklist

### Before Converting (ALL scripts)

- [ ] Read current script completely
- [ ] Identify which tier it belongs to
- [ ] List helper functions currently used
- [ ] Check if bridge operations needed
- [ ] Note any special requirements (enums, nested props, stats)
- [ ] Review appropriate v3 reference script

### During Conversion (ALL scripts)

- [ ] Remove `import { getUnifiedHelpers }` line
- [ ] Remove `${getUnifiedHelpers()}` from script
- [ ] Use direct property access (no safeGet)
- [ ] Build OmniJS script with template parameters
- [ ] Use single `evaluateJavascript()` call
- [ ] Return v3 response format `{ok, v, data/items, summary}`
- [ ] Add per-item try/catch in forEach loops
- [ ] Calculate metrics in OmniJS context
- [ ] Add timing metadata (query_time_ms)

### After Conversion (ALL scripts)

- [ ] File compiles (`npm run build`)
- [ ] Integration tests pass
- [ ] Manual testing with various parameters
- [ ] Response structure matches v3 format
- [ ] Performance improved significantly
- [ ] Tool import updated to use v3 version
- [ ] Git commit with descriptive message
- [ ] Document performance gain in commit

### Tier-Specific Checks

**Tier 1 (Analytics):**
- [ ] All counters initialized before loop
- [ ] Statistics calculated in OmniJS
- [ ] Insights generated from data
- [ ] Summary includes averages/totals

**Tier 2 (CRUD):**
- [ ] Filters applied in OmniJS context
- [ ] Search terms handled correctly
- [ ] Limit respected
- [ ] Sort order correct
- [ ] Optional properties handled (note, dates, etc.)

**Tier 3 (Bridge):**
- [ ] Essential bridge bundle imported
- [ ] Simple helpers inlined
- [ ] All bridge operations tested
- [ ] Tags persist correctly
- [ ] Repeat rules work
- [ ] Planned dates set

---

## Success Criteria

### Performance Metrics

**Tier 1 (Analytics):**
- ✅ Target: 13-67x faster
- ✅ Measure: Time before/after conversion
- ✅ Proven by Phase 1 results

**Tier 2 (CRUD):**
- ✅ Target: 10-100x faster
- ✅ Measure: Query time in metadata
- ✅ Compare to helper-based version

**Tier 3 (Bridge):**
- ✅ Target: 15-20% smaller
- ✅ Measure: `ls -lh dist/.../.js` before/after
- ✅ Functionality preserved

### Size Reduction

**All Tiers:**
- ✅ Helper overhead eliminated (18KB → 0-3KB)
- ✅ Response size unchanged (data is same)
- ✅ Total reduction: ~520KB across 28 scripts

### Code Quality

**All Tiers:**
- ✅ Zero helper dependencies (except Tier 3 essential bundle)
- ✅ No safeGet wrappers (direct access)
- ✅ Single bridge call per operation
- ✅ Consistent v3 response format
- ✅ All tests passing

---

## Common Pitfalls to Avoid

### Pitfall 1: Forgetting v3 Response Format

**❌ WRONG:**
```javascript
return JSON.stringify(results);
```

**✅ CORRECT:**
```javascript
return JSON.stringify({
  ok: true,
  v: '3',
  items: results,
  summary: { total: results.length }
});
```

### Pitfall 2: Using safeGet in v3 Scripts

**❌ WRONG:**
```javascript
const name = safeGet(() => task.name());
```

**✅ CORRECT:**
```javascript
try {
  const name = task.name;
} catch (e) {
  // Skip
}
```

### Pitfall 3: Iterating in JXA Context

**❌ WRONG:**
```javascript
const allTasks = doc.flattenedTasks();
for (let i = 0; i < allTasks.length; i++) {
  const task = allTasks[i];
  // ... JXA property access (slow!)
}
```

**✅ CORRECT:**
```javascript
const dataScript = `
  (() => {
    flattenedTasks.forEach(task => {
      // ... OmniJS property access (fast!)
    });
  })()
`;
const result = app.evaluateJavascript(dataScript);
```

### Pitfall 4: Multiple Bridge Calls

**❌ WRONG:**
```javascript
// Multiple bridge calls per item
items.forEach(item => {
  const script = `/* get properties for ${item.id} */`;
  const props = app.evaluateJavascript(script);
});
```

**✅ CORRECT:**
```javascript
// Single bridge call for all items
const script = `
  (() => {
    const results = [];
    flattenedItems.forEach(item => {
      results.push({ /* all properties */ });
    });
    return JSON.stringify(results);
  })()
`;
const result = app.evaluateJavascript(script);
```

### Pitfall 5: Mixing Tier 3 with Tier 2

**If script needs bridge operations (tags, repeat, planned):**
- ✅ Use Tier 3 template (essential bridge bundle)
- ❌ Don't try to convert to pure OmniJS

**If script doesn't need bridge operations:**
- ✅ Use Tier 1/2 template (pure OmniJS)
- ❌ Don't keep unnecessary bridge helpers

---

## Recommended Conversion Order

### Week 1: Foundation + Quick Wins + Start Tier 1

1. ✅ Create essential bridge bundle (3 hours)
2. ✅ Convert analyze-overdue.ts (3 hours) - Tier 1
3. ✅ Convert workflow-analysis.ts (4 hours) - Tier 1

**Deliverable:** 2 analytics scripts converted, 36KB saved

### Week 2: Start Tier 2 (Easiest First)

1. Convert folder scripts (5 scripts, 15-25 hours)
   - list-folders
   - get-folder
   - create-folder
   - update-folder
   - delete-folder

**Deliverable:** 5 scripts converted, 90KB saved

### Week 3: Continue Tier 2 (Tasks + Tags)

1. Convert simple task scripts (4 scripts, 12-20 hours)
   - move-task
   - complete-task
   - delete-task
   - get-task

2. Convert tag management (1 script, 3-5 hours)
   - manage-tags

**Deliverable:** 5 scripts converted, 90KB saved

### Week 4: Continue Tier 2 (Projects + Reviews)

1. Convert project scripts (5 scripts, 15-25 hours)
2. Convert review scripts (3 scripts, 9-15 hours)

**Deliverable:** 8 scripts converted, 144KB saved

### Week 5: Complete Tier 2 + Tier 3

1. Convert remaining Tier 2 (7 scripts, 21-35 hours)
   - recurring, export, perspectives, agenda, search

2. Migrate Tier 3 to essential bundle (2 scripts, 10-12 hours)
   - create-task
   - update-task

**Deliverable:** 9 scripts converted/migrated, 196KB saved

### Week 6: Testing & Documentation

1. Comprehensive integration testing (8 hours)
2. Update documentation (8 hours)
3. Performance benchmarking (4 hours)
4. Final verification (4 hours)

**Deliverable:** Production-ready, fully documented

---

**End of Conversion Templates**

*Use these templates as step-by-step guides for all 28 script conversions. Each template is based on proven Phase 1 results and includes before/after examples, common pitfalls, and success criteria.*
