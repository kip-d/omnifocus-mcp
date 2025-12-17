# Comprehensive Field Inventory Analysis

## OmniFocus Task Fields - Complete Enumeration & Recommendations

**Date**: October 20, 2025 **Purpose**: Enumerate all available task fields and determine optimal exposure in MCP

---

## Executive Summary

### All Available Task Fields (From OmniFocus API)

The OmniFocus Task class exposes **39 distinct properties** across 3 inheritance levels:

- **DatedObject** (inherited): `added`, `modified`
- **ActiveObject** (inherited): `active` (from activeStatus)
- **Task** (direct): 36 properties

### Current MCP Exposure

**Currently exposed in QueryTasksToolV2** (16 fields):

- `id`, `name`, `completed`, `flagged`, `blocked`, `available`
- `estimatedMinutes`, `dueDate`, `deferDate`, `plannedDate`, `completionDate`
- `note`, `projectId`, `project`, `tags`, `repetitionRule`

**Missing but available** (23 fields):

- **Date/Audit fields**: `added`, `modified`, `dropDate`, `effectiveCompletedDate`, `effectiveDeferDate`,
  `effectiveDropDate`, `effectiveDueDate`, `effectivePlannedDate`
- **Status fields**: `taskStatus` (computed), `inInbox`, `completedByChildren`, `active`, `effectiveFlagged`
- **Structural fields**: `parent`, `parentTaskId`, `parentTaskName`, `children`, `hasChildren`
- **Relationship fields**: `containingProject`, `tags` (already exposed)
- **Advanced fields**: `repetitionRule` (already exposed), `linkedFileURLs`, `attachments`, `notifications`
- **Metadata**: `effectiveCompletedDate` (computed), `effectiveCompletionDate` (computed alternative)

---

## Detailed Field Inventory

### Category 1: Core Identity (ALREADY EXPOSED ✅)

| Field  | Type          | Bytes    | In Script | In Enum | Priority | Recommendation   |
| ------ | ------------- | -------- | --------- | ------- | -------- | ---------------- |
| `id`   | string (UUID) | 36       | ✅        | ✅      | P0       | Keep (essential) |
| `name` | string        | Variable | ✅        | ✅      | P0       | Keep (essential) |

---

### Category 2: Completion Status (ALREADY EXPOSED ✅)

| Field            | Type       | Bytes | In Script | In Enum | Priority | Recommendation                       |
| ---------------- | ---------- | ----- | --------- | ------- | -------- | ------------------------------------ |
| `completed`      | boolean    | 5     | ✅        | ✅      | P0       | Keep (essential)                     |
| `completionDate` | ISO string | 24    | ✅        | ✅      | P1       | Keep (useful for productivity stats) |

---

### Category 3: Scheduling & Dates (MOSTLY EXPOSED, GAPS ⚠️)

| Field                  | Type       | Bytes | In Script | In Enum | Priority | Recommendation                 |
| ---------------------- | ---------- | ----- | --------- | ------- | -------- | ------------------------------ |
| `dueDate`              | ISO string | 24    | ✅        | ✅      | P0       | Keep (essential)               |
| `deferDate`            | ISO string | 24    | ✅        | ✅      | P1       | Keep (scheduling)              |
| `plannedDate`          | ISO string | 24    | ✅        | ✅      | P2       | Keep (optional but available)  |
| `dropDate`             | ISO string | 24    | ✅        | ❌      | P2       | **ADD** (completion workflow)  |
| `effectiveDueDate`     | ISO string | 24    | ❌        | ❌      | P2       | **CONSIDER** (inherited dates) |
| `effectiveDeferDate`   | ISO string | 24    | ❌        | ❌      | P3       | Skip (complex inheritance)     |
| `effectiveDropDate`    | ISO string | 24    | ❌        | ❌      | P3       | Skip (complex inheritance)     |
| `effectivePlannedDate` | ISO string | 24    | ❌        | ❌      | P3       | Skip (complex inheritance)     |

---

### Category 4: Audit Trail (MISSING ❌) - **HIGH VALUE FOR POWER USERS**

| Field      | Type       | Bytes | In Script | In Enum | Priority | Recommendation                                    |
| ---------- | ---------- | ----- | --------- | ------- | -------- | ------------------------------------------------- |
| `added`    | ISO string | 24    | ✅        | ❌      | **P1**   | **ADD** (user request: "tasks created this week") |
| `modified` | ISO string | 24    | ✅        | ❌      | **P1**   | **ADD** (user request: "recently modified tasks") |

**Why these are valuable:**

- Enable queries like: "What tasks did I create this week?"
- Enable queries like: "What's the oldest task in my database?"
- Enable queries like: "What's changed recently?"
- Enable productivity insights: "Task creation vs completion ratio"
- Sortable: Users might want "sort by recently created" or "sort by oldest first"

**Cost**: ~24 bytes each when serialized to ISO string (minimal)

---

### Category 5: Priority & Flagging (ALREADY EXPOSED ✅)

| Field              | Type    | Bytes | In Enum | Recommendation                 |
| ------------------ | ------- | ----- | ------- | ------------------------------ |
| `flagged`          | boolean | 5     | ✅      | Keep (essential)               |
| `effectiveFlagged` | boolean | 5     | ❌      | Skip (rarely needed, computed) |

---

### Category 6: Task Status (PARTIALLY EXPOSED ⚠️)

| Field                 | Type        | Bytes | In Script | In Enum | Priority | Recommendation                      |
| --------------------- | ----------- | ----- | --------- | ------- | -------- | ----------------------------------- |
| `available`           | boolean     | 5     | ✅        | ✅      | P1       | Keep (GTD workflow)                 |
| `blocked`             | boolean     | 5     | ✅        | ✅      | P1       | Keep (GTD workflow)                 |
| `taskStatus`          | enum string | 15    | ✅        | ❌      | P2       | Skip (covered by available/blocked) |
| `inInbox`             | boolean     | 5     | ✅        | ❌      | P2       | **CONSIDER** (GTD workflow)         |
| `completedByChildren` | boolean     | 5     | ❌        | ❌      | P3       | Skip (rarely needed)                |
| `active`              | boolean     | 5     | ❌        | ❌      | P3       | Skip (activeStatus)                 |

**Analysis of taskStatus**:

- Currently script computes `taskStatus` from `taskStatus === Task.Status.Available`
- Already have `available` and `blocked` booleans in enum
- `taskStatus` is a full enum (Available, Blocked, Completed, Dropped, DueSoon, Next, Overdue)
- **Recommendation**: Skip because `available` and `blocked` cover primary use cases
- Alternative: If users want full status, could add `taskStatus` with low priority

**Analysis of inInbox**:

- Useful for: "What's in my inbox?" (though `mode: 'inbox'` does this better)
- Could be useful for combined queries: "inbox tasks that are blocked"
- **Recommendation**: MAYBE - low impact but adds clarity in complex queries

---

### Category 7: Notes & Content (ALREADY EXPOSED ✅)

| Field  | Type   | Bytes    | In Enum | Recommendation             |
| ------ | ------ | -------- | ------- | -------------------------- |
| `note` | string | Variable | ✅      | Keep (searchable, context) |

---

### Category 8: Time Estimation (ALREADY EXPOSED ✅)

| Field              | Type   | Bytes | In Enum | Recommendation            |
| ------------------ | ------ | ----- | ------- | ------------------------- |
| `estimatedMinutes` | number | 5-10  | ✅      | Keep (productivity stats) |

---

### Category 9: Project Organization (ALREADY EXPOSED ✅)

| Field               | Type           | Bytes    | In Enum | Recommendation                |
| ------------------- | -------------- | -------- | ------- | ----------------------------- |
| `projectId`         | string (UUID)  | 36       | ✅      | Keep (essential)              |
| `project`           | string         | Variable | ✅      | Keep (human readable)         |
| `containingProject` | Project object | N/A      | ❌      | Skip (have projectId/project) |

---

### Category 10: Tags (ALREADY EXPOSED ✅)

| Field  | Type         | Bytes    | In Enum | Recommendation                 |
| ------ | ------------ | -------- | ------- | ------------------------------ |
| `tags` | string array | Variable | ✅      | Keep (essential for filtering) |

---

### Category 11: Subtask Structure (NOT EXPOSED)

| Field               | Type          | Bytes    | In Script | In Enum | Priority | Recommendation                              |
| ------------------- | ------------- | -------- | --------- | ------- | -------- | ------------------------------------------- |
| `parent`            | Task object   | N/A      | ❌        | ❌      | P3       | Skip (structural, causes recursion)         |
| `parentTaskId`      | string (UUID) | 36       | ✅        | ❌      | P2       | **CONSIDER** (enables parent-child queries) |
| `parentTaskName`    | string        | Variable | ✅        | ❌      | P2       | **CONSIDER** (human readable)               |
| `children`          | TaskArray     | N/A      | ❌        | ❌      | P3       | Skip (recursive structure)                  |
| `hasChildren`       | boolean       | 5        | ❌        | ❌      | P3       | Skip (rarely needed)                        |
| `flattenedChildren` | TaskArray     | N/A      | ❌        | ❌      | P3       | Skip (recursive structure)                  |

**Analysis of parent fields**:

- `parentTaskId` useful for: "Get subtasks of task X"
- `parentTaskName` useful for: "Show me what project/task this is under"
- **Recommendation**: MAYBE - could enable richer task context but adds complexity

---

### Category 12: Repetition/Recurrence (ALREADY EXPOSED ✅)

| Field            | Type   | Bytes   | In Enum | Recommendation                       |
| ---------------- | ------ | ------- | ------- | ------------------------------------ |
| `repetitionRule` | object | 100-200 | ✅      | Keep (essential for recurring tasks) |

---

### Category 13: Notifications (NOT EXPOSED)

| Field           | Type                | Bytes | In Script | In Enum | Priority | Recommendation                          |
| --------------- | ------------------- | ----- | --------- | ------- | -------- | --------------------------------------- |
| `notifications` | array<Notification> | N/A   | ❌        | ❌      | P3       | Skip (rarely needed, complex structure) |

---

### Category 14: Attachments & Files (NOT EXPOSED)

| Field            | Type               | Bytes | In Script | In Enum | Priority | Recommendation                |
| ---------------- | ------------------ | ----- | --------- | ------- | -------- | ----------------------------- |
| `attachments`    | array<FileWrapper> | N/A   | ❌        | ❌      | P3       | Skip (binary data, complex)   |
| `linkedFileURLs` | array<URL>         | N/A   | ❌        | ❌      | P3       | Skip (rarely needed, complex) |

---

### Category 15: Timezone Handling (NOT EXPOSED)

| Field                       | Type    | Bytes | In Script | In Enum | Priority | Recommendation       |
| --------------------------- | ------- | ----- | --------- | ------- | -------- | -------------------- |
| `shouldUseFloatingTimeZone` | boolean | 5     | ❌        | ❌      | P3       | Skip (rarely needed) |

---

## Recommended Field Additions

### Tier 1: High-Value Additions (STRONGLY RECOMMENDED ⭐⭐⭐)

**Add these fields to QueryTasksToolV2 fields enum:**

1. **`added`** (ISO string, 24 bytes)
   - **Use case**: "What tasks did I create this week?"
   - **User request**: Explicit (from user message)
   - **Cost**: Minimal (~0.12 bytes per task when requested)
   - **Benefit**: High (unlocks powerful time-based queries)
   - **Status**: Already in script ✅

2. **`modified`** (ISO string, 24 bytes)
   - **Use case**: "What have I changed recently?"
   - **User request**: Explicit (from user message)
   - **Cost**: Minimal (~0.12 bytes per task when requested)
   - **Benefit**: High (complements `added` for change tracking)
   - **Status**: Already in script ✅

### Tier 2: Medium-Value Additions (RECOMMENDED ⭐⭐)

3. **`dropDate`** (ISO string, 24 bytes)
   - **Use case**: "Show me tasks I've deferred"
   - **Cost**: Minimal (~0.12 bytes per task)
   - **Benefit**: Medium (completes task lifecycle visibility)
   - **Status**: Already in script ✅

4. **`parentTaskId`** (string UUID, 36 bytes)
   - **Use case**: "Get all subtasks of task X"
   - **Cost**: Minimal when requested
   - **Benefit**: Medium (enables hierarchy queries)
   - **Status**: Already in script ✅

5. **`parentTaskName`** (string, variable)
   - **Use case**: "Show me parent task context"
   - **Cost**: Variable but reasonable
   - **Benefit**: Medium (human-readable hierarchy)
   - **Status**: Already in script ✅

6. **`inInbox`** (boolean, 5 bytes)
   - **Use case**: "Filter by inbox status"
   - **Cost**: Minimal (~0.03 bytes per task)
   - **Benefit**: Low-Medium (mode='inbox' available, but useful for complex queries)
   - **Status**: Already in script ✅

### Tier 3: Lower-Value Additions (OPTIONAL ⭐)

7. **`effectiveDueDate`** (ISO string, 24 bytes)
   - **Use case**: "Due date considering project defaults"
   - **Cost**: Minimal but computational overhead in OmniJS
   - **Benefit**: Low (power users only)
   - **Status**: NOT in script yet (would require OmniJS changes)

8. **`taskStatus`** (enum string, ~15 bytes)
   - **Use case**: Full task status information
   - **Cost**: Minimal (~0.08 bytes per task)
   - **Benefit**: Low (available/blocked cover this)
   - **Status**: Already in script but not exposed

---

## Cost Analysis

### Context Window Impact

**Scenario**: 50 tasks, fields = [all current + Tier 1 additions]

**Current 16 fields** (baseline):

- Per task: ~500 bytes (variable due to strings)
- 50 tasks: ~25KB
- Tokens: ~6 tokens (at ~4 chars per token)

**With Tier 1 additions** (16 + `added`, `modified`):

- Added per task: ~48 bytes (two ISO strings)
- 50 tasks: ~2.4KB additional
- Tokens: ~0.6 tokens additional
- **% increase**: ~10% (negligible)

**With Tier 1 + Tier 2** (16 + 5 new):

- Added per task: ~140 bytes (conservative estimate)
- 50 tasks: ~7KB additional
- Tokens: ~1.75 tokens additional
- **% increase**: ~30% (acceptable)

**With ALL recommended** (16 + 8 new):

- Added per task: ~185 bytes
- 50 tasks: ~9.25KB additional
- Tokens: ~2.3 tokens additional
- **% increase**: ~37% (still acceptable for comprehensive queries)

### OmniJS Bridge Cost

**Field projection happens CLIENT-SIDE:**

- Only fields in request affect JSON serialization size
- OmniJS bridge query is CONSTANT (retrieves all fields anyway)
- NO overhead for exposing fields you don't request

**Example**:

```javascript
// SAME OmniJS cost regardless of fields parameter
fields: []; // All retrieved from OmniFocus
fields: ['id', 'name']; // Only these projected to client
fields: ['id', 'name', 'added', 'modified']; // Only these projected
```

---

## Final Recommendations

### PHASE 1: Immediate Implementation (Today) ✅

Add to QueryTasksToolV2 fields enum:

- `added` ⭐⭐⭐ (high user value)
- `modified` ⭐⭐⭐ (high user value)
- `dropDate` ⭐⭐ (completes lifecycle)

**Implementation cost**: ~5 lines in schema, 0 runtime overhead **User benefit**: HIGH (unlocks new query types)

### PHASE 2: Follow-up (Next Sprint) 🔄

Add to QueryTasksToolV2:

- `parentTaskId` & `parentTaskName` (enable hierarchy queries)
- `inInbox` (GTD clarity)
- Update sort enum to include `modified` (recency sorting)

**Implementation cost**: ~10 lines in schema, 0 runtime overhead **User benefit**: MEDIUM (enhances filtering and
hierarchy)

### PHASE 3: Future (v2.1+) 🚀

Evaluate for later versions:

- `effectiveDueDate` (would require OmniJS computation)
- `taskStatus` (covers edge cases)
- `completedByChildren` (project management)

**Why later**: Computational overhead or very niche use cases

### Fields to NEVER expose:

- `attachments`, `notifications`, `linkedFileURLs` (binary/complex data)
- `children`, `flattenedChildren` (recursive structures)
- `parent` (causes cycles)
- `containingProject` (have projectId/project already)
- Date "effective" variants except `effectiveDueDate` (rarely needed)

---

## Implementation Checklist

### For PHASE 1:

- [ ] Add `added` to fields enum in QueryTasksToolV2 (line 82-99)
- [ ] Add `modified` to fields enum in QueryTasksToolV2
- [ ] Add `dropDate` to fields enum in QueryTasksToolV2
- [ ] Add `modified` to sort enum (line 106)
- [ ] Update field description in tool schema
- [ ] Test with integration tests: "query tasks with added/modified fields"
- [ ] Test sorting: "sort by modified desc"
- [ ] Verify backward compatibility (default behavior unchanged)
- [ ] Create changelog entry for v2.0.1

### Verification Steps:

```bash
# Verify fields are accessible
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"tasks","arguments":{"mode":"all","limit":"3","fields":["id","name","added","modified"]}}}' | node dist/index.js

# Check response contains new fields
# Expected: tasks[0].added and tasks[0].modified populated
```

---

## Summary Table

| Field              | Category      | Exposed | In Script | Cost        | User Value | Recommendation |
| ------------------ | ------------- | ------- | --------- | ----------- | ---------- | -------------- |
| `id`               | Identity      | ✅      | ✅        | -           | Essential  | Keep           |
| `name`             | Identity      | ✅      | ✅        | -           | Essential  | Keep           |
| `completed`        | Status        | ✅      | ✅        | -           | Essential  | Keep           |
| `flagged`          | Status        | ✅      | ✅        | -           | Essential  | Keep           |
| `blocked`          | Status        | ✅      | ✅        | -           | Essential  | Keep           |
| `available`        | Status        | ✅      | ✅        | -           | Essential  | Keep           |
| `dueDate`          | Scheduling    | ✅      | ✅        | -           | Essential  | Keep           |
| `deferDate`        | Scheduling    | ✅      | ✅        | -           | Essential  | Keep           |
| `plannedDate`      | Scheduling    | ✅      | ✅        | -           | High       | Keep           |
| `completionDate`   | Scheduling    | ✅      | ✅        | -           | High       | Keep           |
| `note`             | Content       | ✅      | ✅        | -           | High       | Keep           |
| `projectId`        | Organization  | ✅      | ✅        | -           | Essential  | Keep           |
| `project`          | Organization  | ✅      | ✅        | -           | Essential  | Keep           |
| `tags`             | Organization  | ✅      | ✅        | -           | Essential  | Keep           |
| `estimatedMinutes` | Planning      | ✅      | ✅        | -           | High       | Keep           |
| `repetitionRule`   | Advanced      | ✅      | ✅        | -           | High       | Keep           |
| **`added`**        | **Audit**     | ❌      | ✅        | **Minimal** | **High**   | **➕ ADD**     |
| **`modified`**     | **Audit**     | ❌      | ✅        | **Minimal** | **High**   | **➕ ADD**     |
| **`dropDate`**     | **Lifecycle** | ❌      | ✅        | **Minimal** | **Medium** | **➕ ADD**     |
| `parentTaskId`     | Hierarchy     | ❌      | ✅        | Low         | Medium     | Later          |
| `parentTaskName`   | Hierarchy     | ❌      | ✅        | Low         | Medium     | Later          |
| `inInbox`          | Status        | ❌      | ✅        | Minimal     | Low        | Later          |
| `effectiveDueDate` | Scheduling    | ❌      | ❌        | Medium      | Low        | v2.1+          |
| `taskStatus`       | Status        | ❌      | ✅        | Minimal     | Low        | Skip           |
| _Others_           | _Various_     | ❌      | Varies    | Varies      | Very Low   | Skip           |

---

## Conclusion

**All available task fields have been enumerated and categorized.**

**Recommended action**: Add Tier 1 fields (`added`, `modified`, `dropDate`) in next update.

- **Benefit**: Unlocks powerful new query capabilities for power users
- **Cost**: Minimal (zero runtime overhead, <1% context increase)
- **Implementation**: ~5 lines of code
- **Breaking changes**: None (backward compatible)

---

## Reference

### API Documentation

- OmniFocus 4.8.3 TypeScript definitions: `src/omnifocus/api/OmniFocus.d.ts`
- Task class: Lines 1548-1615
- DatedObject (inherited): Lines 356-359

### Implementation Files

- Schema: `src/tools/tasks/QueryTasksToolV2.ts` (lines 82-99)
- Script: `src/omnifocus/scripts/tasks/list-tasks-v3-omnijs.ts`

### Related Documentation

- `/docs/dev/PATTERNS.md` - General patterns
- `/docs/dev/ARCHITECTURE.md` - Architecture decisions
