# Script Dependency & Usage Analysis

## Core Helper Usage Map

```
helpers.ts (CORE - All scripts depend)
├── safeGet()           [27 scripts]
├── safeGetDate()       [15 scripts]
├── safeGetProject()    [8 scripts]
├── safeGetTags()       [4 scripts]
├── isValidDate()       [12 scripts]
└── Various formatters [20+ scripts]

minimal-tag-bridge.ts (Tag Operations)
├── bridgeSetTags()     [create-task.ts, update-task.ts]
├── bridgeGetTags()     [list-tasks.ts]
└── Affects: 2 task scripts, 1 list script

repeat-helpers.ts (Repetition Management)
├── prepareRepetitionRuleData()     [create-task.ts, update-task.ts, create-project.ts, update-project.ts]
├── applyRepetitionRuleViaBridge()  [4 scripts]
├── applyDeferAnother()             [3 scripts]
└── Affects: 7 project/task scripts

date-fields-bridge.ts (Date Enrichment)
├── bridgeGetDateFields()   [list-tasks.ts only]
├── Adds: added, modified, dropDate fields
└── Affects: 1 core query script

bridge-template.ts (Generic Bridge Operations)
├── Template patterns for task movement
├── Project assignment helpers
└── Affects: update-task.ts, update-project.ts

bridge-helpers.ts (Bridge Utilities)
├── Script formatting, parameter substitution
└── Affects: Complex update operations
```

## Script Dependency Depth

### Depth 0 (No helpers)

- get-version.ts (1 file)

### Depth 1 (Single helper only)

- delete-task.ts
- delete-project.ts
- delete-folder.ts
- list-perspectives.ts
- get-version.ts [5 files total]

### Depth 2 (1-2 helpers)

- complete-task.ts
- complete-tasks-bulk.ts
- delete-tasks-bulk.ts
- warm-task-caches.ts
- warm-projects-cache.ts [Many small scripts]

### Depth 3 (2-3 helpers)

- list-tasks.ts (helpers + date-fields-bridge + optional tag-bridge)
- list-projects.ts (helpers + optional stats-bridge)
- list-tags.ts (helpers + optional usage-stats) [Medium complexity scripts]

### Depth 4+ (3+ helpers)

- create-task.ts (helpers + minimal-tag-bridge + repeat-helpers)
- update-task.ts (helpers + minimal-tag-bridge + repeat-helpers + bridge-template)
- create-project.ts (helpers + repeat-helpers + bridge-template)
- update-project.ts (helpers + repeat-helpers + bridge-template + multiple bridges) [Complex state management]

## Architecture Dependency Chains

### Task Creation Flow

```
Tool Request
  ↓
create-task-with-bridge.ts
  ├→ getUnifiedHelpers()
  ├→ getMinimalTagBridge()
  └→ evaluateJavascript() → OmniJS bridge
       ├→ bridgeSetTags()
       ├→ applyRepetitionRuleViaBridge()
       └→ Result: Task with tags, dates, repeat rules
```

### Task Querying Flow

```
Tool Request
  ↓
list-tasks.ts or list-tasks-omnijs.ts
  ├→ getUnifiedHelpers()
  ├→ Filter logic (in-process)
  ├→ For advanced fields: evaluateJavascript()
  │  └→ bridgeGetDateFields() [if added/modified/dropDate requested]
  └→ Result: Filtered task list with optional enrichment
```

### Analytics Flow

```
Tool Request
  ↓
productivity-stats.ts
  ├→ getUnifiedHelpers()
  ├→ Count aggregation (JXA + OmniJS bridge)
  ├→ Date filtering
  ├→ evaluateJavascript() for bulk operations
  └→ Result: Statistics and trends

            OR

workflow-analysis.ts
  ├→ getUnifiedHelpers()
  ├→ Multiple analytical passes
  ├→ Pattern detection
  ├→ Trend calculation
  └→ Result: Detailed workflow insights
```

## Cross-Cutting Concerns

### Date Handling Dependencies

Scripts affected by date handling:

- list-tasks.ts → safeGetDate, bridgeGetDateFields
- create-task.ts → Date parsing
- update-task.ts → Date parsing
- productivity-stats.ts → Date filtering
- task-velocity.ts → Date filtering [12+ scripts total]

### Tag Management Dependencies

Scripts affected by tag operations:

- create-task.ts → minimal-tag-bridge
- update-task.ts → minimal-tag-bridge
- list-tasks.ts → safeGetTags (inline)
- list-tags.ts → Full tag enumeration
- manage-tags.ts → Tag CRUD [5 scripts, 2 bridges]

### Repetition Rule Dependencies

Scripts affected by repetition:

- create-task.ts → repeat-helpers, repeat-translation
- update-task.ts → repeat-helpers
- create-project.ts → repeat-helpers
- update-project.ts → repeat-helpers [4 scripts, 2 helpers]

### Bridge Dependencies

Scripts that use evaluateJavascript():

- list-tasks.ts → date-fields-bridge
- list-tasks-omnijs.ts → complete OmniJS script
- create-task.ts → minimal-tag-bridge + repeat bridge
- update-task.ts → task movement bridge + tag bridge
- list-tags.ts → OmniJS bridge (full retrieval)
- manage-tags.ts → OmniJS bridge
- All analytics scripts → Various bridges [25+ scripts total]

## Helper Composition Patterns

### Pattern A: Minimal + Helpers

```
import { getUnifiedHelpers } from '../shared/helpers.js';

// Usage: Simple operation, no domain-specific bridge
```

### Pattern B: Helpers + Domain Bridge

```
import { getUnifiedHelpers } from '../shared/helpers.js';
import { getMinimalTagBridge } from '../shared/minimal-tag-bridge.js';

// Usage: Task creation with tag assignment
```

### Pattern C: Heavy Composition

```
import { getUnifiedHelpers } from '../shared/helpers.js';
import { getMinimalTagBridge } from '../shared/minimal-tag-bridge.js';
import { ... } from '../shared/repeat-helpers.js';
import { ... } from '../shared/bridge-template.js';

// Usage: Complex state management (update-task.ts, update-project.ts)
```

## Shared Logic That Could Be Extracted

### Date Filtering Logic

Current: Duplicated in 5+ analytics scripts

- periodStart calculation (week/month/quarter/year)
- Date comparison logic
- Time zone handling Potential extraction: Shared date-filter helper function

### Count Aggregation

Current: Similar patterns in productivity-stats, workflow-analysis, recurring analyzer

- Task iteration
- Status checking
- Count accumulation Potential extraction: Shared aggregation helper

### Task Status Determination

Current: safeGet(() => task.taskStatus()) used in 8+ scripts

- Checks for: completed, available, blocked
- Fallback logic for missing values Potential extraction: safeGetTaskStatus() helper

## Unused / Underutilized Code

### date-range-queries.ts (335 LOC)

- Not imported by any operation scripts
- Appears to be utility code, possibly legacy
- Recommendation: Audit usage or archive

### Routing files

- tasks.ts (21 LOC) - Re-exports
- recurring.ts (10 LOC) - Re-exports
- perspectives.ts (252 LOC) - Re-exports
- reviews.ts (5 LOC) - Re-exports
- Total: 288 LOC of re-export infrastructure
- Recommendation: May be needed for tool discovery, verify with unified API

### Utility Bridges (Not Used in Latest Patterns)

- bridge-template.ts - Older template approach
- bridge-helpers.ts - Generic utilities potentially superseded
- helper-context.ts - Framework configuration
- script-builder.ts - Script assembly (appears unused)

## Recommended Refactoring Priorities

### 1. Consolidate Duplicate Scripts (1800 LOC savings)

- list-tasks variants → Single canonical version
- create-task variants → Single canonical version
- productivity-stats v3 → Single canonical version
- task-velocity v3 → Single canonical version
- list-tags v3 → Single canonical version

### 2. Extract Shared Analytics Patterns (200-300 LOC savings)

- Create analytics-common.ts with:
  - Date filtering logic
  - Period calculation
  - Count aggregation patterns
  - Task status helpers

### 3. Extract Date Handling Patterns (100-150 LOC savings)

- Create date-helpers.ts with:
  - safeGetDate improvements
  - Date filtering logic
  - Period comparison functions
  - Timezone handling

### 4. Audit Unused Code (200+ LOC)

- Review date-range-queries.ts usage
- Consolidate routing files if possible
- Archive obsolete bridge helpers

---

## Quick Reference: Which Script Uses What

### Uses minimal-tag-bridge

- src/omnifocus/scripts/tasks/create-task.ts
- src/omnifocus/scripts/tasks/create-task-with-bridge.ts
- src/omnifocus/scripts/tasks/update-task.ts

### Uses date-fields-bridge

- src/omnifocus/scripts/tasks/list-tasks.ts

### Uses repeat-helpers

- src/omnifocus/scripts/tasks/create-task.ts
- src/omnifocus/scripts/tasks/update-task.ts
- src/omnifocus/scripts/projects/create-project.ts
- src/omnifocus/scripts/projects/update-project.ts

### Uses bridge-template

- src/omnifocus/scripts/tasks/update-task.ts
- src/omnifocus/scripts/projects/update-project.ts

### Uses OmniJS evaluateJavascript

- All list scripts (heavy users)
- All analytics scripts
- All bulk operation scripts
- All management scripts (tags, reviews, etc.)
