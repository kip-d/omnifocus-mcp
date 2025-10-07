# OmniFocus 4.7-4.8.3 Feature Support Implementation Plan

## Overview
Update MCP server to fully support new OmniFocus 4.7+ features: Planned Dates, Mutually Exclusive Tags, and Enhanced Repeat Functionality.

## Phase 1: Planned Date Support (Highest Priority)

### 1.1 Schema Updates
- **src/tools/schemas/task-schemas.ts**:
  - Add `plannedDate: LocalDateTimeSchema.optional()` to TaskSchema
  - Add `plannedDate: LocalDateTimeSchema.optional()` to CreateTaskSchema
  - Add `plannedDate: LocalDateTimeSchema.optional()` to UpdateTaskSchema
  - Add `clearPlannedDate: coerceBoolean().optional()` to UpdateTaskSchema
  - Add date filter fields (plannedBefore, plannedAfter) to ListTasksSchema

- **src/tools/schemas/project-schemas.ts**:
  - Add `plannedDate: LocalDateTimeSchema.optional()` to ProjectSchema
  - Add planned date fields to create/update project schemas
  - Add `clearPlannedDate` option

### 1.2 Script Updates
- **src/omnifocus/scripts/tasks/create-task.ts** (lines 66-82):
  - Add plannedDate handling after deferDate/dueDate logic

- **src/omnifocus/scripts/tasks/update-task.ts** (line 100+):
  - Add plannedDate update logic
  - Add clearPlannedDate handling

- **src/omnifocus/scripts/tasks/list-tasks.ts**:
  - Add plannedDate to field extraction
  - Add planned date filtering support

- **src/omnifocus/scripts/projects/create-project.ts**:
  - Add plannedDate property setting

- **src/omnifocus/scripts/projects/update-project.ts**:
  - Add plannedDate update logic

- **src/omnifocus/scripts/export/export-tasks.ts** (OmniJS bridge section):
  - Add plannedDate field to OmniJS property access
  - Include in CSV/JSON/Markdown exports

### 1.3 Query Tool Updates
- **src/tools/tasks/QueryTasksToolV2.ts**:
  - Add planned date as query filter option
  - Document usage patterns

- **src/tools/perspectives/PerspectivesToolV2.ts**:
  - Include plannedDate in perspective results

## Phase 2: Mutually Exclusive Tags Support

### 2.1 Schema Updates
- **src/tools/schemas/shared-schemas.ts**:
  - Add `childrenAreMutuallyExclusive: boolean` to tag response schema

### 2.2 Script Updates
- **src/omnifocus/scripts/tags/list-tags.ts**:
  - Add childrenAreMutuallyExclusive property to tag extraction

- **src/omnifocus/scripts/tags.ts** (MANAGE_TAGS_SCRIPT):
  - Add new action: `set_mutual_exclusivity`
  - Support setting/unsetting childrenAreMutuallyExclusive property

### 2.3 Tool Updates
- **src/tools/tags/TagsToolV2.ts**:
  - Add action enum value for mutual exclusivity management
  - Document the feature and usage patterns

## Phase 3: Enhanced Repeat Functionality

### 3.1 Schema Updates
- **src/tools/schemas/repeat-schemas.ts**:
  - Add `anchorDateKey: z.enum(['DeferDate', 'DueDate', 'PlannedDate']).optional()` to RepeatRuleSchema
  - Add `catchUpAutomatically: coerceBoolean().optional().default(false)` to RepeatRuleSchema
  - Add `scheduleType: z.enum(['FromCompletion', 'None', 'Regularly']).optional()` to RepeatRuleSchema
  - Add `endAfterDate: LocalDateTimeSchema.optional()` to RepeatRuleSchema
  - Add `endAfterOccurrences: coerceNumber().int().positive().optional()` to RepeatRuleSchema

### 3.2 Helper Updates
- **src/omnifocus/scripts/shared/repeat-helpers.ts**:
  - Update prepareRepetitionRuleData() to handle new parameters
  - Add support for anchorDateKey, catchUpAutomatically, scheduleType
  - Add end condition handling

### 3.3 Script Updates
- **src/omnifocus/scripts/tasks/create-task.ts** (line 98+):
  - Update repeat rule application to use new parameters

- **src/omnifocus/scripts/tasks/update-task.ts**:
  - Update repeat rule updates to support new fields

## Phase 4: Version Detection & Compatibility

### 4.1 Version Detection
- **src/omnifocus/version-detection.ts** (NEW):
  - Create utility to detect OmniFocus version via JXA
  - Cache version for session
  - Export feature flags (hasPlannedDates, hasMutuallyExclusiveTags, hasEnhancedRepeats)

### 4.2 Documentation Updates
- **src/omnifocus/api/README.md**:
  - Add section on version-specific features
  - Document which features require 4.7+
  - Add migration notes

- **CLAUDE.md**:
  - Update with 4.7+ feature availability
  - Add notes about version detection

## Phase 5: Testing & Validation

### 5.1 Unit Tests
- **tests/unit/tools/schemas/task-schemas.test.ts** (NEW):
  - Test plannedDate schema validation
  - Test clearPlannedDate logic

- **tests/unit/tools/schemas/repeat-schemas.test.ts**:
  - Test new repeat rule parameters
  - Test anchorDateKey, catchUpAutomatically, scheduleType

- **tests/unit/tools/tags-v2.test.ts**:
  - Test mutually exclusive tag operations

### 5.2 Integration Tests
- **tests/integration/planned-dates.test.ts** (NEW):
  - Create task with planned date
  - Update task planned date
  - Query tasks by planned date
  - Clear planned date
  - Test with projects

- **tests/integration/mutually-exclusive-tags.test.ts** (NEW):
  - Set tag group to mutually exclusive
  - Verify single-tag constraint works
  - Test tag switching behavior

- **tests/integration/enhanced-repeats.test.ts** (NEW):
  - Test repeat with PlannedDate anchor
  - Test catchUpAutomatically behavior
  - Test end after date
  - Test end after N occurrences

### 5.3 Manual Testing Checklist
- [ ] Create task with planned date in OmniFocus 4.8.3
- [ ] Verify planned date appears in Forecast view
- [ ] Test mutually exclusive tag groups
- [ ] Test repeat with planned date anchor
- [ ] Test automatic catch-up for repeats
- [ ] Verify backward compatibility with 4.6.1 (if available)

## Phase 6: Documentation & Examples

### 6.1 User Documentation
- Update tool descriptions with planned date examples
- Add mutually exclusive tag workflow examples
- Document enhanced repeat patterns with new options

### 6.2 API Documentation
- Document version requirements for each feature
- Add migration guide from 4.6.x to 4.7+
- Create feature comparison matrix

## Implementation Order
1. **Phase 1** (Planned Dates) - Most impactful user-facing feature
2. **Phase 3** (Enhanced Repeats) - High value, builds on existing repeat infrastructure
3. **Phase 2** (Mutually Exclusive Tags) - Useful but lower priority
4. **Phase 4** (Version Detection) - Needed for graceful degradation
5. **Phase 5** (Testing) - Continuous throughout, comprehensive at end
6. **Phase 6** (Documentation) - Final polish

## Success Criteria
- ✅ All new 4.7+ API properties accessible via MCP tools
- ✅ Backward compatibility maintained (scripts don't break on older versions)
- ✅ Comprehensive test coverage for new features
- ✅ Documentation updated with version-specific feature notes
- ✅ CI tests pass with new functionality
- ✅ Manual testing confirms features work in OmniFocus 4.8.3

## Estimated Effort
- Phase 1: 3-4 hours (schemas, scripts, tests)
- Phase 2: 1-2 hours (simpler feature)
- Phase 3: 2-3 hours (complex repeat logic)
- Phase 4: 1 hour (version detection)
- Phase 5: 2-3 hours (comprehensive testing)
- Phase 6: 1 hour (documentation)

**Total: 10-14 hours**

## Key API Changes from OmniFocus 4.6.1 → 4.8.3

### New Properties Available

**Task & Project:**
- `plannedDate: Date | null` (line 1607 in Task, line 1171 in Project)
- `effectivePlannedDate: Date | null` (readonly, inherits from parent)

**Tag:**
- `childrenAreMutuallyExclusive: boolean` (line 1485)
- When true, only one child tag can be assigned at a time

**Task.RepetitionRule:**
- `anchorDateKey: Task.AnchorDateKey` (DeferDate, DueDate, or PlannedDate)
- `catchUpAutomatically: boolean` - skip missed occurrences
- Enhanced scheduling with `scheduleType: Task.RepetitionScheduleType`

### Implementation Notes

1. **Planned Dates** are a third date type alongside Defer and Due
   - Show in Forecast view
   - Can be inherited from parent project
   - Uncompleted items remain in "Past" section

2. **Mutually Exclusive Tags** enforce single-tag constraint per group
   - Ideal for priority levels, energy states, time-of-day contexts
   - Selecting new tag auto-removes previous tag from same group

3. **Enhanced Repeats** support:
   - Repeat anchor on Planned Date (in addition to Defer/Due)
   - Automatic catch-up to skip past occurrences
   - End after specific date or number of repetitions
   - Improved repeat schedule types

## Version-Specific Feature Detection

Since we support both 4.6.1 and 4.8.3, consider:

1. **Feature Detection**: Check if properties exist before accessing
2. **Graceful Degradation**: Skip new features on older versions
3. **Clear Error Messages**: Inform users when features require 4.7+
4. **Documentation**: Mark which tool parameters require 4.7+

## References

- OmniFocus 4.7 Release Notes (provided by user)
- OmniFocus 4.8.3 API Definitions: `src/omnifocus/api/OmniFocus-4.8.3-d.ts`
- OmniFocus 4.6.1 API Definitions (archived): `src/omnifocus/api/OmniFocus-4.6.1-d.ts`
