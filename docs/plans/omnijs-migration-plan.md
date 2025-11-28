# OmniJS Migration Plan

**Created:** 2025-11-27
**Goal:** Convert remaining JXA scripts to OmniJS-first pattern
**Reference:** [OmniJS-First Pattern](../dev/OMNIJS-FIRST-PATTERN.md)

---

## Executive Summary

Convert 15 active JXA scripts to OmniJS-first pattern for:
- Consistency (one mental model)
- Performance (no Apple Events overhead)
- Future-proofing (JXA is sunset mode)
- Reliability (no "Can't convert types" surprises)

---

## Migration Phases

### Phase 1: High Priority - Bulk Operations & Complex Logic
**Estimated effort:** Medium
**Impact:** High (performance + reliability)

| Script | Location | Reason | Complexity |
|--------|----------|--------|------------|
| `complete-tasks-bulk.ts` | `scripts/tasks/` | Bulk operation, should be OmniJS | Medium |
| `create-folder.ts` | `scripts/folders/` | 185 lines, iteration over folders | Medium |
| `projects-for-review.ts` | `scripts/reviews/` | Iterates projects, checks dates | Medium |

#### Task 1.1: Migrate `complete-tasks-bulk.ts`
- [ ] Read current implementation
- [ ] Create OmniJS version using `Task.byIdentifier()` and `markComplete()`
- [ ] Handle completion date parameter
- [ ] Test with multiple task IDs
- [ ] Update imports in calling code
- [ ] Run integration tests

#### Task 1.2: Migrate `create-folder.ts`
- [ ] Read current implementation (185 lines)
- [ ] Move folder lookup to OmniJS (`Folder.byIdentifier()`)
- [ ] Move duplicate name check to OmniJS
- [ ] Use `new Folder(name)` in OmniJS
- [ ] Handle parent folder assignment
- [ ] Handle position (beginning/ending/before/after)
- [ ] Test folder creation scenarios
- [ ] Update FoldersTool imports

#### Task 1.3: Migrate `projects-for-review.ts`
- [ ] Read current implementation
- [ ] Move project iteration to OmniJS
- [ ] Access `project.nextReviewDate` properly
- [ ] Calculate overdue status in OmniJS
- [ ] Test review date filtering
- [ ] Update ReviewsTool

---

### Phase 2: Medium Priority - Mutation Operations
**Estimated effort:** Low-Medium
**Impact:** Medium (consistency)

| Script | Location | Reason | Complexity |
|--------|----------|--------|------------|
| `update-folder.ts` | `scripts/folders/` | Mutation, benefits from OmniJS | Low |
| `delete-folder.ts` | `scripts/folders/` | Simple but should be consistent | Low |
| `move-folder.ts` | `scripts/folders/` | Uses folder relationships | Low |
| `complete-project.ts` | `scripts/projects/` | Mutation operation | Low |
| `delete-project.ts` | `scripts/projects/` | Simple deletion | Low |
| `mark-project-reviewed.ts` | `scripts/reviews/` | Sets review date | Low |
| `set-review-schedule.ts` | `scripts/reviews/` | Sets review interval | Low |

#### Task 2.1: Migrate folder mutation scripts
- [ ] `update-folder.ts` - property updates
- [ ] `delete-folder.ts` - simple deletion
- [ ] `move-folder.ts` - parent reassignment
- [ ] Update FoldersTool to use new scripts
- [ ] Test all folder operations

#### Task 2.2: Migrate project mutation scripts
- [ ] `complete-project.ts` - mark complete
- [ ] `delete-project.ts` - remove project
- [ ] Update ProjectsTool
- [ ] Test project operations

#### Task 2.3: Migrate review scripts
- [ ] `mark-project-reviewed.ts` - set lastReviewDate
- [ ] `set-review-schedule.ts` - set reviewInterval
- [ ] Update ReviewsTool
- [ ] Test review operations

---

### Phase 3: Low Priority - Already Working Well
**Estimated effort:** Low
**Impact:** Low (nice to have consistency)

| Script | Location | Reason | Complexity |
|--------|----------|--------|------------|
| `flagged-tasks-perspective.ts` | `scripts/tasks/` | Works, but could be cleaner | Low |
| Analyzer scripts | `scripts/analytics/` | Pure TypeScript (no migration needed) | N/A |

#### Task 3.1: Migrate remaining task scripts
- [x] `flagged-tasks-perspective.ts` - Migrated to OmniJS-first pattern
- [x] Test perspective queries - 1041 unit tests pass

#### Task 3.2: Analyzer scripts - NO MIGRATION NEEDED
The analyzer scripts are **pure TypeScript functions** that operate on data already fetched from OmniFocus. They don't contain JXA code and don't need migration:
- `due-date-bunching-analyzer.ts` - Pure TS data analysis
- `next-actions-analyzer.ts` - Pure TS data analysis
- `review-gaps-analyzer.ts` - Pure TS data analysis
- `wip-limits-analyzer.ts` - Pure TS data analysis

---

## Migration Template

For each script migration:

```typescript
// BEFORE: JXA style
export const MY_SCRIPT = `
  (() => {
    const app = Application('OmniFocus');
    const doc = app.defaultDocument();
    const items = doc.flattenedTasks();  // JXA collection

    for (let i = 0; i < items.length; i++) {
      const name = items[i].name();      // Method call
      const id = items[i].id();          // Method call
    }
  })()
`;

// AFTER: OmniJS-first style
export function buildMyScript(params: Params): string {
  const serialized = JSON.stringify(params);

  return `
    (() => {
      const app = Application('OmniFocus');

      try {
        const omniJsScript = \`
          (() => {
            const params = ${serialized};
            const results = [];

            flattenedTasks.forEach(task => {      // OmniJS global
              const name = task.name;              // Property access
              const id = task.id.primaryKey;       // Property access
            });

            return JSON.stringify({ success: true, data: results });
          })()
        \`;

        return app.evaluateJavascript(omniJsScript);
      } catch (error) {
        return JSON.stringify({ success: false, error: error.message });
      }
    })()
  `;
}
```

---

## Testing Strategy

### For Each Migration:

1. **Unit Test** - Verify script generates correct OmniJS
2. **Integration Test** - Execute against real OmniFocus
3. **Regression Test** - Ensure existing functionality preserved

### Test Commands:

```bash
# Run specific test file
npm test -- tests/unit/scripts/folders/create-folder.test.ts

# Run integration tests for a tool
npm run test:integration -- --grep "FoldersTool"

# Manual execution test
osascript -l JavaScript /tmp/test-script.js
```

---

## Success Criteria

- [ ] All Phase 1 scripts migrated and tested
- [ ] All Phase 2 scripts migrated and tested
- [ ] No regressions in existing functionality
- [ ] Integration tests pass
- [ ] Documentation updated

---

## Scripts NOT Being Migrated

These are already OmniJS or don't need migration:

| Script | Reason |
|--------|--------|
| `list-*-v3.ts` | Already OmniJS |
| `*-v3.ts` analytics | Already OmniJS |
| `create-task.ts` | Already uses bridge for tags |
| `create-project.ts` | Already uses bridge |
| Cache warming scripts | Already OmniJS |
| Export scripts | Already OmniJS |

---

## Deprecated Scripts (Cleanup Status)

| Script | Replacement | Status |
|--------|-------------|--------|
| `list-folders.ts` | `list-folders-v3.ts` | ⚠️ Still in use by FoldersTool.ts |
| `list-projects.ts` | `list-projects-v3.ts` | ✅ Deleted (2025-11-27) |
| `workflow-analysis.ts` | `workflow-analysis-v3.ts` | ✅ Deleted (2025-11-27) |

**Note:** `list-folders.ts` requires migration of FoldersTool.ts to use v3 version before deletion.

---

## Timeline

| Phase | Scripts | Priority | Status |
|-------|---------|----------|--------|
| Phase 1 | 3 scripts | High | ✅ Complete (2025-11-27) |
| Phase 2 | 7 scripts | Medium | ✅ Complete (2025-11-27) |
| Phase 3 | 1 script (analyzers are pure TS) | Low | ✅ Complete (2025-11-27) |
| Cleanup | Delete deprecated | Low | ✅ Partial (2/3 deleted, list-folders.ts still in use) |

---

## Notes

- Each migration should be its own commit
- Update CHANGELOG.md for significant changes
- Consider creating a `scripts/legacy/` folder for deprecated scripts before deletion
- Run full test suite after each phase completion
