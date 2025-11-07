# Helper Function Inventory

**Created:** 2025-11-07
**Purpose:** Complete catalog of all helper functions for Phase 2 refactoring
**Status:** Phase 2A.1 - Initial Inventory

## Summary Statistics

- **Total helper files:** 9
- **Total LOC:** 1,828 lines
- **Total size:** ~59KB (58KB characters)
- **Helper bundles identified:** 11 constant exports + 1 meta-function (`getUnifiedHelpers()`)
- **JXA embedded functions:** 42 functions
- **TypeScript utility functions:** 10 functions
- **TypeScript types/interfaces:** 6 interfaces + 1 type

## Helper Files Overview

### helpers.ts
- **Size:** 566 LOC
- **Character count:** ~18.4KB
- **Functions:** 25 JXA functions embedded in constants
- **Bundles:** `SAFE_UTILITIES`, `PROJECT_VALIDATION`, `TASK_SERIALIZATION`, `ERROR_HANDLING`, `RECURRENCE_APPLY_FUNCTIONS`, `getUnifiedHelpers()`
- **Purpose:** Core helper functions for task/project operations, validation, serialization, and recurrence
- **Key feature:** `getUnifiedHelpers()` is the primary export that bundles all helpers together

### bridge-helpers.ts
- **Size:** 176 LOC
- **Character count:** ~6.9KB
- **Functions:** 9 JXA functions + templates
- **Bundles:** `BRIDGE_HELPERS`, `BRIDGE_MIGRATION`
- **Purpose:** Consolidated bridge operations for tags, repeat rules, and task movement via evaluateJavascript()
- **Pattern:** Template-based script generation with `__formatBridgeScript()` formatter

### minimal-tag-bridge.ts
- **Size:** 143 LOC
- **Character count:** ~4.9KB
- **Functions:** 3 JXA functions (tag and plannedDate operations)
- **Bundles:** `MINIMAL_TAG_BRIDGE`
- **Purpose:** Minimal bridge focused solely on tag assignment and plannedDate setting
- **Key feature:** Documents the STANDARD PATTERN for embedded bridge helpers

### date-fields-bridge.ts
- **Size:** 163 LOC
- **Character count:** ~5.6KB
- **Functions:** 1 JXA function
- **Bundles:** `DATE_FIELDS_BRIDGE`
- **Purpose:** Bulk retrieval of added/modified/dropDate fields via OmniJS (JXA cannot access these)
- **Pattern:** Single bridge call returns map indexed by task ID for efficient merging

### repeat-helpers.ts
- **Size:** 320 LOC
- **Character count:** ~9.7KB
- **Functions:** 6 JXA functions
- **Bundles:** `REPEAT_HELPERS`
- **Purpose:** Convert repeat rules to RRULE format and apply via bridge
- **Key functions:** RRULE conversion, method mapping, rule application via bridge

### repeat-translation.ts
- **Size:** 87 LOC
- **Character count:** ~3KB
- **Functions:** 2 TypeScript functions
- **Types:** 4 interfaces/types
- **Purpose:** Translate user-friendly repeat intent to OmniFocus internal parameters
- **Layer:** TypeScript-only (not embedded in JXA scripts)

### bridge-template.ts
- **Size:** 187 LOC
- **Character count:** ~5.8KB
- **Functions:** 2 TypeScript functions
- **Templates:** 4 predefined bridge templates
- **Purpose:** Secure template system for evaluateJavascript() operations with injection prevention
- **Layer:** TypeScript-only utility for building bridge scripts

### helper-context.ts
- **Size:** 99 LOC
- **Character count:** ~3KB
- **Functions:** 2 TypeScript functions
- **Types:** 1 interface with configuration options
- **Purpose:** Configuration context for helper generation (skipAnalysis, performance tracking, cache strategy)
- **Layer:** TypeScript-only configuration

### script-builder.ts
- **Size:** 87 LOC
- **Character count:** ~2.6KB
- **Functions:** 4 TypeScript functions
- **Purpose:** Centralized script builder with parameter declarations and validation
- **Layer:** TypeScript-only utility for script assembly

## Complete Function Catalog

### Category: Safe Utilities (JXA - helpers.ts)

| Function | LOC | Purpose | Complexity | Dependencies |
|----------|-----|---------|------------|--------------|
| `safeGet()` | 8 | Try/catch wrapper for property access | Simple | None |
| `safeGetDate()` | 12 | Safe date retrieval with validation | Simple | `isValidDate()` |
| `safeGetProject()` | 14 | Get containing project safely | Simple | `safeGet()` |
| `safeGetTags()` | 15 | Get task tags with error handling | Simple | `safeGet()` |
| `isValidDate()` | 3 | Validate Date object | Simple | None |
| `isTaskAvailable()` | 11 | Check if task is deferred | Medium | `isValidDate()` |
| `isTaskEffectivelyCompleted()` | 24 | Check task/project completion | Complex | None |
| `isFlagged()` | 7 | Safe flagged status check | Simple | None |
| `safeGetEstimatedMinutes()` | 8 | Get time estimate safely | Simple | None |
| `safeGetFolder()` | 11 | Get project folder | Medium | `safeGet()` |
| `safeGetTaskCount()` | 7 | Get project task count | Simple | None |
| `safeIsCompleted()` | 7 | Check task completion | Simple | None |
| `getTaskStatus()` | 12 | Get Task.Status enum | Simple | None |
| `isTaskBlocked()` | 77 | Determine if task is blocked | Complex | `safeGetStatus()` |
| `isTaskNext()` | 30 | Check if task is next action | Complex | `isTaskAvailableForWork()`, `isTaskBlocked()` |
| `isTaskAvailableForWork()` | 30 | Check if task is available | Medium | `isValidDate()`, `isTaskBlocked()` |
| `safeGetStatus()` | 18 | Get project status with normalization | Medium | None |

**Total:** 17 functions, ~294 LOC

### Category: Validation (JXA - helpers.ts)

| Function | LOC | Purpose | Complexity | Dependencies |
|----------|-----|---------|------------|--------------|
| `validateProject()` | 30 | Find and validate project by ID | Medium | None |

**Total:** 1 function, ~30 LOC

### Category: Serialization (JXA - helpers.ts)

| Function | LOC | Purpose | Complexity | Dependencies |
|----------|-----|---------|------------|--------------|
| `serializeTask()` | 53 | Build complete task object | Complex | `safeGet()`, `isFlagged()`, `getTaskStatus()`, `isTaskBlocked()`, etc. |

**Total:** 1 function, ~53 LOC

### Category: Error Handling (JXA - helpers.ts)

| Function | LOC | Purpose | Complexity | Dependencies |
|----------|-----|---------|------------|--------------|
| `formatError()` | 13 | Format error with context | Simple | None |

**Total:** 1 function, ~13 LOC

### Category: Recurrence/Repeat (JXA - helpers.ts)

| Function | LOC | Purpose | Complexity | Dependencies |
|----------|-----|---------|------------|--------------|
| `convertToRRULE()` | 28 | Convert rule to RRULE format | Complex | None |
| `convertToOmniMethod()` | 3 | Map method to OmniJS enum | Simple | None |
| `prepareRepetitionRuleData()` | 11 | Prepare rule for bridge | Medium | `convertToRRULE()`, `convertToOmniMethod()` |
| `applyRepetitionRuleViaBridge()` | 30 | Apply rule via evaluateJavascript | Complex | `setRepeatRuleViaBridge()` (bridge-helpers) |
| `applyDeferAnother()` | 7 | Set defer date based on rule | Medium | None |

**Total:** 5 functions, ~79 LOC

### Category: Bridge Operations - Tags (JXA)

| Function | File | LOC | Purpose | Complexity |
|----------|------|-----|---------|------------|
| `__formatBridgeScript()` | bridge-helpers.ts | 13 | Template parameter substitution | Medium |
| `getTagsViaBridge()` | bridge-helpers.ts | 7 | Get tags via OmniJS | Simple |
| `setTagsViaBridge()` | bridge-helpers.ts | 7 | Set tags via OmniJS | Simple |
| `safeGetTagsWithBridge()` | bridge-helpers.ts | 15 | Get tags with fallback | Medium |
| `__formatTagScript()` | minimal-tag-bridge.ts | 12 | Minimal template formatter | Simple |
| `bridgeSetTags()` | minimal-tag-bridge.ts | 16 | Set tags (minimal version) | Simple |
| `bridgeSetPlannedDate()` | minimal-tag-bridge.ts | 12 | Set plannedDate via bridge | Simple |

**Total:** 7 functions, ~82 LOC

### Category: Bridge Operations - Repeat Rules (JXA)

| Function | File | LOC | Purpose | Complexity |
|----------|------|-----|---------|------------|
| `getRepeatRuleViaBridge()` | bridge-helpers.ts | 7 | Get repeat rule via OmniJS | Simple |
| `setRepeatRuleViaBridge()` | bridge-helpers.ts | 7 | Set repeat rule via OmniJS | Simple |
| `clearRepeatRuleViaBridge()` | bridge-helpers.ts | 7 | Clear repeat rule | Simple |
| `convertToRRULE()` | repeat-helpers.ts | 86 | Convert rule to RRULE | Complex |
| `convertToOmniMethod()` | repeat-helpers.ts | 12 | Map method enum | Simple |
| `prepareRepetitionRuleData()` | repeat-helpers.ts | 23 | Prepare rule data | Medium |
| `applyRepetitionRuleViaBridge()` | repeat-helpers.ts | 49 | Apply rule with fallback | Complex |
| `applyDeferAnother()` | repeat-helpers.ts | 42 | Apply defer calculation | Medium |
| `extractRepeatRuleInfo()` | repeat-helpers.ts | 81 | Parse existing rule | Complex |

**Total:** 9 functions, ~314 LOC

### Category: Bridge Operations - Task Movement (JXA)

| Function | File | LOC | Purpose | Complexity |
|----------|------|-----|---------|------------|
| `moveTaskViaBridge()` | bridge-helpers.ts | 7 | Move task via OmniJS | Simple |

**Total:** 1 function, ~7 LOC

### Category: Bridge Operations - Date Fields (JXA)

| Function | File | LOC | Purpose | Complexity |
|----------|------|-----|---------|------------|
| `bridgeGetDateFields()` | date-fields-bridge.ts | 48 | Bulk get added/modified/dropDate | Medium |

**Total:** 1 function, ~48 LOC

### Category: TypeScript Utilities - Bridge Templates

| Function | File | LOC | Purpose | Complexity |
|----------|------|-----|---------|------------|
| `formatBridgeScript()` | bridge-template.ts | 39 | Secure template formatting | Medium |
| `executeBridgeTemplate()` | bridge-template.ts | 27 | Execute bridge template | Medium |

**Total:** 2 functions, ~66 LOC

### Category: TypeScript Utilities - Script Building

| Function | File | LOC | Purpose | Complexity |
|----------|------|-----|---------|------------|
| `buildParameterDeclarations()` | script-builder.ts | 13 | Build param declarations | Simple |
| `buildScriptWithParameters()` | script-builder.ts | 10 | Wrap script with params | Simple |
| `extractExpectedParameters()` | script-builder.ts | 12 | Parse template placeholders | Medium |
| `validateScriptParameters()` | script-builder.ts | 11 | Validate param completeness | Simple |

**Total:** 4 functions, ~46 LOC

### Category: TypeScript Utilities - Helper Context

| Function | File | LOC | Purpose | Complexity |
|----------|------|-----|---------|------------|
| `mergeHelperContext()` | helper-context.ts | 5 | Merge with defaults | Simple |
| `generateHelperConfig()` | helper-context.ts | 14 | Generate config object | Simple |

**Total:** 2 functions, ~19 LOC

### Category: TypeScript Utilities - Repeat Translation

| Function | File | LOC | Purpose | Complexity |
|----------|------|-----|---------|------------|
| `mapAnchorIntentToOmniFocus()` | repeat-translation.ts | 25 | Map user intent to OmniJS | Medium |
| `translateRepeatIntent()` | repeat-translation.ts | 12 | Full intent translation | Simple |

**Total:** 2 functions, ~37 LOC

### Category: Meta Functions (TypeScript)

| Function | File | LOC | Purpose | Complexity |
|----------|------|-----|---------|------------|
| `getUnifiedHelpers()` | helpers.ts | 25 | Bundle all helpers together | Simple |
| `getMinimalTagBridge()` | minimal-tag-bridge.ts | 3 | Export minimal tag bridge | Simple |
| `getDateFieldsBridge()` | date-fields-bridge.ts | 3 | Export date fields bridge | Simple |

**Total:** 3 functions, ~31 LOC

## Helper Bundle Analysis

### String Constants (Embedded JXA Code)

These are exported as template strings containing JXA functions:

1. **`SAFE_UTILITIES`** (helpers.ts)
   - **Size:** ~7.5KB, 316 lines
   - **Includes:** 17 safe utility functions
   - **Purpose:** Core error-safe property access and validation

2. **`PROJECT_VALIDATION`** (helpers.ts)
   - **Size:** ~900 bytes, 32 lines
   - **Includes:** `validateProject()` function
   - **Purpose:** Project ID validation with Claude Desktop bug detection

3. **`TASK_SERIALIZATION`** (helpers.ts)
   - **Size:** ~1.4KB, 54 lines
   - **Includes:** `serializeTask()` function
   - **Purpose:** Build complete task objects with all fields
   - **Dependencies:** Requires SAFE_UTILITIES functions

4. **`ERROR_HANDLING`** (helpers.ts)
   - **Size:** ~400 bytes, 14 lines
   - **Includes:** `formatError()` function
   - **Purpose:** Standardized error formatting

5. **`RECURRENCE_APPLY_FUNCTIONS`** (helpers.ts)
   - **Size:** ~2.5KB, 75 lines
   - **Includes:** 5 recurrence functions
   - **Purpose:** Apply repeat rules via bridge (condensed versions)

6. **`BRIDGE_HELPERS`** (bridge-helpers.ts)
   - **Size:** ~5.5KB, 158 lines
   - **Includes:** 8 bridge functions + templates
   - **Purpose:** Complete bridge operations suite

7. **`BRIDGE_MIGRATION`** (bridge-helpers.ts)
   - **Size:** ~300 bytes, 7 lines
   - **Includes:** Override for `safeGetTags()`
   - **Purpose:** Redirect old tag calls to bridge version

8. **`MINIMAL_TAG_BRIDGE`** (minimal-tag-bridge.ts)
   - **Size:** ~2.7KB, 81 lines
   - **Includes:** 3 functions for tags and plannedDate
   - **Purpose:** Lightweight tag operations only

9. **`DATE_FIELDS_BRIDGE`** (date-fields-bridge.ts)
   - **Size:** ~2KB, 50 lines
   - **Includes:** `bridgeGetDateFields()` function
   - **Purpose:** Bulk date field retrieval

10. **`REPEAT_HELPERS`** (repeat-helpers.ts)
    - **Size:** ~9.2KB, 314 lines
    - **Includes:** 6 repeat rule functions
    - **Purpose:** Full repeat rule conversion and application

### Meta Bundle Function

**`getUnifiedHelpers(context?: HelperContext): string`** (helpers.ts)
- **Returns:** All helpers concatenated into single string
- **Components:**
  - `generateHelperConfig(context)` - Config object
  - `SAFE_UTILITIES`
  - `PROJECT_VALIDATION`
  - `ERROR_HANDLING`
  - `TASK_SERIALIZATION`
  - `RECURRENCE_APPLY_FUNCTIONS`
- **Total size:** ~50KB
- **Purpose:** Single export for scripts that need everything
- **Note:** Does NOT include bridge-helpers, minimal-tag-bridge, date-fields-bridge, or repeat-helpers (must be imported separately)

### Template Collections

**`BridgeTemplates`** (bridge-template.ts)
- **Type:** Object with 4 template strings
- **Templates:**
  - `GET_TASK` - Retrieve task by ID
  - `ASSIGN_TAGS` - Assign tags to task
  - `SET_REPEAT_RULE` - Set repetition rule
  - `MOVE_TASK` - Move task to inbox/project/parent
- **Purpose:** Predefined secure templates for common operations

## Duplication Analysis

### Duplicate Functions Across Files

1. **`convertToRRULE()`**
   - **Location 1:** helpers.ts → RECURRENCE_APPLY_FUNCTIONS (lines 444-471, ~28 lines)
   - **Location 2:** repeat-helpers.ts → REPEAT_HELPERS (lines 8-93, ~86 lines)
   - **Difference:** repeat-helpers version is MUCH longer with detailed comments
   - **Recommendation:** Consolidate to single version

2. **`convertToOmniMethod()`**
   - **Location 1:** helpers.ts → RECURRENCE_APPLY_FUNCTIONS (lines 472-474, ~3 lines)
   - **Location 2:** repeat-helpers.ts → REPEAT_HELPERS (lines 96-108, ~12 lines)
   - **Difference:** repeat-helpers has switch statement, helpers uses ternary
   - **Recommendation:** Use repeat-helpers version (more readable)

3. **`prepareRepetitionRuleData()`**
   - **Location 1:** helpers.ts → RECURRENCE_APPLY_FUNCTIONS (lines 475-483, ~11 lines)
   - **Location 2:** repeat-helpers.ts → REPEAT_HELPERS (lines 112-135, ~23 lines)
   - **Difference:** repeat-helpers has logging and error handling
   - **Recommendation:** Use repeat-helpers version (more robust)

4. **`applyRepetitionRuleViaBridge()`**
   - **Location 1:** helpers.ts → RECURRENCE_APPLY_FUNCTIONS (lines 484-509, ~30 lines)
   - **Location 2:** repeat-helpers.ts → REPEAT_HELPERS (lines 139-188, ~49 lines)
   - **Difference:** repeat-helpers has more comprehensive error handling
   - **Recommendation:** Use repeat-helpers version

5. **`applyDeferAnother()`**
   - **Location 1:** helpers.ts → RECURRENCE_APPLY_FUNCTIONS (lines 510-516, ~7 lines)
   - **Location 2:** repeat-helpers.ts → REPEAT_HELPERS (lines 191-233, ~42 lines)
   - **Difference:** repeat-helpers is MUCH more detailed with logging
   - **Recommendation:** Use repeat-helpers version

### Duplicate Tag Functionality

1. **Tag setting:**
   - `setTagsViaBridge()` (bridge-helpers.ts) - Uses `__formatBridgeScript()`
   - `bridgeSetTags()` (minimal-tag-bridge.ts) - Uses `__formatTagScript()`
   - **Difference:** Different formatters, same OmniJS script
   - **Recommendation:** Keep both (different use cases)

2. **Tag getting:**
   - `getTagsViaBridge()` (bridge-helpers.ts)
   - `safeGetTagsWithBridge()` (bridge-helpers.ts) - Has JXA fallback
   - `safeGetTags()` (helpers.ts SAFE_UTILITIES) - Pure JXA
   - `safeGetTags()` (bridge-helpers.ts BRIDGE_MIGRATION) - Override to use bridge
   - **Observation:** 4 different tag retrieval approaches!
   - **Recommendation:** Consolidate strategy in Phase 2

### Template Formatter Duplication

1. **`__formatBridgeScript()`** (bridge-helpers.ts) - Generic bridge formatter
2. **`__formatTagScript()`** (minimal-tag-bridge.ts) - Specialized for tags
3. **`formatBridgeScript()`** (bridge-template.ts) - TypeScript version
- **Observation:** 3 versions of essentially the same thing
- **Recommendation:** Unify in Phase 2

## Observations

### Key Findings

1. **Significant Duplication:** 5 major functions duplicated between helpers.ts and repeat-helpers.ts with different implementations

2. **Bundle Complexity:** `getUnifiedHelpers()` does NOT actually include everything:
   - Missing: BRIDGE_HELPERS
   - Missing: MINIMAL_TAG_BRIDGE
   - Missing: DATE_FIELDS_BRIDGE
   - Missing: REPEAT_HELPERS
   - Scripts must manually import these if needed

3. **Size Distribution:**
   - Largest file: helpers.ts (566 LOC, ~18KB)
   - Largest function: `isTaskBlocked()` (77 LOC) - complex sequential logic
   - Most functions: Simple/Medium complexity (under 20 LOC)

4. **Helper Organization:**
   - Clear separation between JXA (embedded strings) and TypeScript (utilities)
   - Template/pattern-based approach for bridge operations
   - Bridge operations concentrated in 3 files (bridge-helpers, minimal-tag-bridge, date-fields-bridge)

5. **Dependency Patterns:**
   - Most helpers have minimal dependencies (call 1-2 other helpers)
   - `serializeTask()` is the most dependent (calls 6+ helpers)
   - Bridge functions are self-contained (no cross-file dependencies)

6. **Performance Implications:**
   - From Phase 1 testing: Pure OmniJS scripts run 13-67x faster
   - Hypothesis: Helper overhead (especially safe wrappers) may be bottleneck
   - `isTaskBlocked()` is 77 LOC of complex logic - potential optimization target

7. **Architectural Layers:**
   - **Layer 1:** JXA embedded functions (executed in osascript)
   - **Layer 2:** TypeScript utilities (build-time only)
   - **Layer 3:** Meta functions that bundle Layer 1 code
   - Clear separation enables targeted optimization

### Questions for Phase 2A.2 (Usage Analysis)

1. Which scripts actually use `getUnifiedHelpers()` vs manual imports?
2. How many scripts use SAFE_UTILITIES vs direct property access?
3. Are the duplicated recurrence functions both used, or can we remove one version?
4. Which bridge helper file is used most? (bridge-helpers vs minimal-tag-bridge)
5. Is `isTaskBlocked()`'s complexity necessary or can it be simplified?

### Risk Areas

1. **Duplication risk:** Bugs fixed in one version but not the other
2. **Size risk:** Including all helpers when only 2-3 are needed
3. **Maintenance risk:** 3 different template formatters to maintain
4. **Performance risk:** Safe wrappers add overhead, but how much?

## Next Steps

This inventory will be used in **Phase 2A.2** to:
1. Search all scripts for helper usage patterns
2. Map which helpers are actually used vs included
3. Identify candidates for elimination/consolidation
4. Measure actual performance impact of helpers vs direct access

**Phase 2A.2 deliverable:** `helper-usage-analysis.md` mapping every script to its helper dependencies.
