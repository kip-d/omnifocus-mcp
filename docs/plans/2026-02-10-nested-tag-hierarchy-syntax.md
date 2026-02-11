# Nested Tag Hierarchy Syntax — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Support OmniFocus's `:` hierarchy separator in tag names for creation and assignment.

**Architecture:** Parse `:` paths at execution time inside OmniJS scripts. Walk the tag tree from root, creating missing
segments (`mkdir -p` semantics). Assign only the leaf tag. No schema or compiler changes.

**Tech Stack:** TypeScript, JXA/OmniJS bridge, Vitest

---

## Design Summary

**Syntax:** `:` (space-colon-space) — matches OmniFocus's display format.

**Scope:**

| Operation                            | Path Syntax | Behavior                                  |
| ------------------------------------ | ----------- | ----------------------------------------- |
| `tag_manage: create`                 | Yes         | Creates full hierarchy, returns leaf      |
| Task create/update `tags`, `addTags` | Yes         | Resolves/creates path, assigns leaf       |
| Task update `removeTags`             | Yes         | Resolves path (no creation), removes leaf |
| Other tag_manage actions             | No          | Unchanged                                 |

**Error cases:** Empty segments → error. Path syntax + `parentTag` → error. `removeTags` path not found → no-op.

---

## Task 1: `tag_manage: create` — Tests

**Files:**

- Modify: `tests/unit/tag-operations.test.ts`

**Step 1: Write failing tests**

Add a new `describe` block after the existing tests:

```typescript
describe('MANAGE_TAGS_SCRIPT - nested tag hierarchy syntax', () => {
  it('should contain parseTagPath helper function', () => {
    expect(MANAGE_TAGS_SCRIPT).toContain('function parseTagPath(');
  });

  it('should contain resolveOrCreateTagByPath helper function', () => {
    expect(MANAGE_TAGS_SCRIPT).toContain('function resolveOrCreateTagByPath(');
  });

  it('should check for path syntax conflict with parentTagName', () => {
    // Script should error if both path syntax and parentTagName are provided
    expect(MANAGE_TAGS_SCRIPT).toContain('Cannot use path syntax');
  });

  it('should handle path syntax in create action', () => {
    // The create case should call parseTagPath and resolveOrCreateTagByPath
    expect(MANAGE_TAGS_SCRIPT).toContain('parseTagPath(tagName)');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/tag-operations.test.ts` Expected: 4 failures — script doesn't contain these functions
yet.

---

## Task 2: `tag_manage: create` — Implementation

**Files:**

- Modify: `src/omnifocus/scripts/tags/manage-tags.ts:13-158` (create case)

**Step 3: Add helpers and rewrite create case**

Inside the IIFE, after `const allTags = doc.flattenedTags();` (line 28) and before the `switch(action)` (line 39), add:

```javascript
// --- Tag path helpers ---
function parseTagPath(input) {
  if (input.indexOf(' : ') === -1) return null;
  const segments = input.split(' : ').map(function (s) {
    return s.trim();
  });
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].length === 0) {
      throw new Error('Invalid tag path: empty segment in "' + input + '"');
    }
  }
  return segments;
}

function resolveOrCreateTagByPath(segments, app, doc) {
  let parent = null;
  let currentTag = null;
  const created = [];

  for (let si = 0; si < segments.length; si++) {
    const segmentName = segments[si];
    currentTag = null;

    if (parent) {
      // Search children of parent
      const children = parent.tags();
      for (let ci = 0; ci < children.length; ci++) {
        if (
          safeGet(function () {
            return children[ci].name();
          }) === segmentName
        ) {
          currentTag = children[ci];
          break;
        }
      }
    } else {
      // Search root-level tags
      const rootTags = doc.tags();
      for (let ri = 0; ri < rootTags.length; ri++) {
        if (
          safeGet(function () {
            return rootTags[ri].name();
          }) === segmentName
        ) {
          currentTag = rootTags[ri];
          break;
        }
      }
    }

    if (!currentTag) {
      // Create missing segment
      var targetCollection = parent
        ? safeGet(function () {
            return parent.tags;
          })
        : safeGet(function () {
            return doc.tags;
          });
      currentTag = app.make({
        new: 'tag',
        withProperties: { name: segmentName },
        at: targetCollection,
      });
      created.push(segmentName);
    }

    parent = currentTag;
  }

  return { leaf: currentTag, created: created };
}
```

Then replace the `case 'create':` block (lines 40-158) with:

```javascript
      case 'create':
        // Check for path syntax
        var pathSegments = parseTagPath(tagName);

        if (pathSegments) {
          // Path syntax: "Work : Projects : Active"
          // Conflict check: cannot use path syntax with parentTagName
          if (parentTagName || parentTagId) {
            return JSON.stringify({
              error: true,
              message: "Cannot use path syntax (' : ' separator) with parentTag parameter. Use either path syntax OR parentTag, not both."
            });
          }

          try {
            var pathResult = resolveOrCreateTagByPath(pathSegments, app, doc);
            var leafTag = pathResult.leaf;
            return JSON.stringify({
              success: true,
              action: 'created',
              tagName: pathSegments[pathSegments.length - 1],
              tagId: safeGet(function() { return leafTag.id(); }, 'unknown'),
              path: tagName,
              createdSegments: pathResult.created,
              message: pathResult.created.length === 0
                ? "Tag path '" + tagName + "' already exists"
                : "Created " + pathResult.created.length + " tag(s) in path '" + tagName + "'"
            });
          } catch (pathError) {
            return JSON.stringify({
              error: true,
              message: pathError.message || String(pathError)
            });
          }
        }

        // Non-path syntax: original create logic (unchanged)
        // Check if tag already exists
        for (let i = 0; i < allTags.length; i++) {
          // ... existing code unchanged ...
```

The existing non-path create logic (lines 42-158) stays exactly as-is after this new block.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/tag-operations.test.ts` Expected: All pass.

**Step 5: Commit**

```bash
git add tests/unit/tag-operations.test.ts src/omnifocus/scripts/tags/manage-tags.ts
git commit -m "feat: add nested tag hierarchy syntax to tag_manage create"
```

---

## Task 3: Task tag assignment — Tests

**Files:**

- Modify: `tests/unit/contracts/ast/mutation-script-builder.test.ts`

**Step 6: Write failing tests**

Add inside the `buildCreateTaskScript` describe block:

```typescript
it('includes resolveOrCreateTagByPath for tag assignment', async () => {
  const result = await buildCreateTaskScript({
    name: 'Task with Nested Tags',
    tags: ['Work : Projects : Active'],
  });

  // OmniJS bridge block should contain the hierarchy resolution helper
  expect(result.script).toContain('resolveOrCreateTagByPath');
});
```

Add inside the `buildUpdateTaskScript` describe block:

```typescript
it('includes resolveOrCreateTagByPath for tag update', async () => {
  const result = await buildUpdateTaskScript('task-123', {
    tags: ['Errands : Downtown'],
  });

  expect(result.script).toContain('resolveOrCreateTagByPath');
});

it('includes resolveTagByPath for removeTags (no creation)', async () => {
  const result = await buildUpdateTaskScript('task-123', {
    removeTags: ['Errands : Downtown'],
  });

  expect(result.script).toContain('resolveTagByPath');
});
```

**Step 7: Run tests to verify they fail**

Run: `npx vitest run tests/unit/contracts/ast/mutation-script-builder.test.ts` Expected: 3 failures — scripts don't
contain these functions yet.

---

## Task 4: Task create tag assignment — Implementation

**Files:**

- Modify: `src/contracts/ast/mutation-script-builder.ts:485-517` (task create OmniJS tag block)

**Step 8: Rewrite task create tag assignment**

Replace the OmniJS tag assignment block inside `buildCreateTaskScript` (the `evaluateJavascript` template string, lines
489-508) with:

```javascript
          (() => {
            // Tag path helpers
            function parseTagPath(input) {
              if (input.indexOf(' : ') === -1) return null;
              var segs = input.split(' : ');
              for (var i = 0; i < segs.length; i++) {
                segs[i] = segs[i].trim();
                if (segs[i].length === 0) throw new Error('Invalid tag path: empty segment');
              }
              return segs;
            }

            function resolveOrCreateTagByPath(segments) {
              var parent = null;
              var current = null;
              for (var i = 0; i < segments.length; i++) {
                current = null;
                var children = parent ? parent.children : tags;
                for (var j = 0; j < children.length; j++) {
                  if (children[j].name === segments[i]) { current = children[j]; break; }
                }
                if (!current) {
                  current = parent ? new Tag(segments[i], parent) : new Tag(segments[i]);
                }
                parent = current;
              }
              return current;
            }

            const task = Task.byIdentifier('\${taskId}');
            if (!task) return JSON.stringify({success: false, error: 'Task not found by ID: ' + '\${taskId}'});

            const tagNames = \${JSON.stringify(taskData.tags)};
            const appliedTags = [];

            for (const tagName of tagNames) {
              var pathSegs = parseTagPath(tagName);
              var tag;
              if (pathSegs) {
                tag = resolveOrCreateTagByPath(pathSegs);
              } else {
                tag = flattenedTags.find(t => t.name === tagName);
                if (!tag) tag = new Tag(tagName);
              }
              task.addTag(tag);
              appliedTags.push(tag.name);
            }

            return JSON.stringify({success: true, tags: appliedTags});
          })()
```

**Note:** This is OmniJS code (property access, not method calls). `parent.children` and `tag.name` are correct OmniJS
patterns. `new Tag(name, parent)` creates a tag nested under parent in OmniJS.

**Step 9: Apply same pattern to project create tag assignment**

Replace the equivalent block in `buildCreateProjectScript` (~lines 765-783) with the same helpers + path-aware loop. The
only difference: use `proj` instead of `task`, and `proj.addTag(tag)`.

**Step 10: Run tests to verify create tests pass**

Run: `npx vitest run tests/unit/contracts/ast/mutation-script-builder.test.ts` Expected: Create test passes, update
tests still fail.

---

## Task 5: Task update tag assignment — Implementation

**Files:**

- Modify: `src/contracts/ast/mutation-script-builder.ts:960-985` (task update OmniJS tag block)

**Step 11: Rewrite task update tag handling**

Replace the tag handling block in the update script (lines 960-985) with:

```javascript
// Tag path helpers (OmniJS)
function parseTagPath(input) {
  if (input.indexOf(' : ') === -1) return null;
  var segs = input.split(' : ');
  for (var i = 0; i < segs.length; i++) {
    segs[i] = segs[i].trim();
    if (segs[i].length === 0) throw new Error('Invalid tag path: empty segment');
  }
  return segs;
}

function resolveOrCreateTagByPath(segments) {
  var parent = null;
  var current = null;
  for (var i = 0; i < segments.length; i++) {
    current = null;
    var children = parent ? parent.children : tags;
    for (var j = 0; j < children.length; j++) {
      if (children[j].name === segments[i]) {
        current = children[j];
        break;
      }
    }
    if (!current) {
      current = parent ? new Tag(segments[i], parent) : new Tag(segments[i]);
    }
    parent = current;
  }
  return current;
}

function resolveTagByPath(segments) {
  var parent = null;
  var current = null;
  for (var i = 0; i < segments.length; i++) {
    current = null;
    var children = parent ? parent.children : tags;
    for (var j = 0; j < children.length; j++) {
      if (children[j].name === segments[i]) {
        current = children[j];
        break;
      }
    }
    if (!current) return null;
    parent = current;
  }
  return current;
}

// Handle tags
if (changes.tags || changes.addTags || changes.removeTags) {
  function resolveTag(tagName, create) {
    var pathSegs = parseTagPath(tagName);
    if (pathSegs) {
      return create ? resolveOrCreateTagByPath(pathSegs) : resolveTagByPath(pathSegs);
    }
    var found = flattenedTags.find((t) => t.name === tagName);
    if (!found && create) found = new Tag(tagName);
    return found;
  }

  if (changes.tags) {
    task.clearTags();
    for (const tagName of changes.tags) {
      var tag = resolveTag(tagName, true);
      if (tag) task.addTag(tag);
    }
  }

  if (changes.addTags) {
    for (const tagName of changes.addTags) {
      var tag = resolveTag(tagName, true);
      if (tag) task.addTag(tag);
    }
  }

  if (changes.removeTags) {
    for (const tagName of changes.removeTags) {
      var tag = resolveTag(tagName, false);
      if (tag) task.removeTag(tag);
    }
  }
}
```

**Step 12: Run all tests**

Run: `npx vitest run tests/unit/contracts/ast/mutation-script-builder.test.ts` Expected: All pass including the 3 new
tests.

**Step 13: Commit**

```bash
git add src/contracts/ast/mutation-script-builder.ts tests/unit/contracts/ast/mutation-script-builder.test.ts
git commit -m "feat: add nested tag hierarchy syntax to task/project tag assignment"
```

---

## Task 6: Full test suite verification

**Step 14: Run full unit test suite**

Run: `npm run test:unit` Expected: All ~1200 tests pass.

**Step 15: Build check**

Run: `npm run build` Expected: Clean build, no TypeScript errors.

**Step 16: Commit and push**

```bash
git push
```

Pre-push hook runs typecheck + lint + unit tests automatically.

---

## Task 7: Integration test (manual verification)

**Step 17: Test `tag_manage: create` with path syntax via MCP**

Use the `omnifocus_write` tool:

```json
{ "operation": "tag_manage", "action": "create", "tagName": "__test-nested : __test-child : __test-leaf" }
```

Verify response contains `createdSegments` and `path`. Then query tags to confirm hierarchy:

```json
{ "type": "tags", "mode": "search", "filters": "{ \"text\": { \"contains\": \"__test-nested\" } }" }
```

Clean up: delete `__test-nested` (cascades to children).

**Step 18: Test task assignment with path syntax**

```json
{
  "operation": "create",
  "target": "task",
  "data": { "name": "__TEST__ path tag test", "tags": ["__test-nested : __test-child"] }
}
```

Verify the task has only the leaf tag `__test-child` assigned, nested under `__test-nested`.

Clean up: delete test task and tags.

---

## Files Modified (Summary)

| File                                                       | Change                                                                                                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/omnifocus/scripts/tags/manage-tags.ts`                | Add `parseTagPath()`, `resolveOrCreateTagByPath()` helpers. Rewrite `create` case to handle path syntax with conflict check.                               |
| `src/contracts/ast/mutation-script-builder.ts`             | Add OmniJS `parseTagPath()`, `resolveOrCreateTagByPath()`, `resolveTagByPath()` in tag assignment blocks for task create, project create, and task update. |
| `tests/unit/tag-operations.test.ts`                        | 4 new tests for manage-tags path syntax                                                                                                                    |
| `tests/unit/contracts/ast/mutation-script-builder.test.ts` | 3 new tests for mutation script path syntax                                                                                                                |

## Files Unchanged

- Schemas, compilers, tag queries, other tag_manage actions, OmniFocusWriteTool routing
