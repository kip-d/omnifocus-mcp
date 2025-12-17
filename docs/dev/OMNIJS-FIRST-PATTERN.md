# OmniJS-First Script Pattern

**Created:** 2025-11-27 **Status:** Standard for all new scripts

---

## Why OmniJS-First?

Based on our investigation
([JXA vs OmniJS Investigation](../plans/things-to-check-out.md#4-jxa-vs-omnijs-investigation-2025-11-27--complete)):

1. **JXA is "legacy/sunset mode"** - Per Omni Group forums
2. **Performance** - OmniJS runs inside OmniFocus (no Apple Events overhead)
3. **Consistency** - One mental model (property access, not method calls)
4. **No surprises** - Everything works, no "Can't convert types" errors
5. **Future-proof** - OmniJS is the recommended path forward

---

## The Standard Pattern

### Template: OmniJS-First Script

```typescript
/**
 * Script description
 *
 * Architecture: OmniJS-first (2025+)
 * - Minimal JXA wrapper for osascript execution
 * - All logic in OmniJS via evaluateJavascript()
 */

export function buildMyScript(params: MyParams): string {
  // Serialize parameters for injection
  const serializedParams = JSON.stringify(params);

  return `
    (() => {
      const app = Application('OmniFocus');

      try {
        // ═══════════════════════════════════════════════════════════
        // OmniJS BLOCK - All logic here
        // ═══════════════════════════════════════════════════════════
        const omniJsScript = \`
          (() => {
            const params = ${serializedParams};

            // ─────────────────────────────────────────────────────────
            // Your logic here - standard JavaScript property access
            // ─────────────────────────────────────────────────────────

            // Examples of OmniJS patterns:
            // const name = task.name;              // NOT task.name()
            // const parent = folder.parent;        // Works! (fails in JXA)
            // const id = task.id.primaryKey;       // NOT task.id()
            // task.tags = [tag1, tag2];            // Direct assignment works

            // Return JSON result
            return JSON.stringify({
              success: true,
              data: { /* your data */ }
            });
          })()
        \`;

        const result = app.evaluateJavascript(omniJsScript);
        return result;

      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error.message || String(error),
          context: 'my_operation'
        });
      }
    })()
  `;
}
```

### Key Rules

1. **JXA wrapper is minimal** - Only `Application('OmniFocus')` and `evaluateJavascript()`
2. **All logic in OmniJS** - Iterations, property access, mutations
3. **Property access without `()`** - `task.name` not `task.name()`
4. **IDs use `.primaryKey`** - `task.id.primaryKey` not `task.id()`
5. **Direct assignment works** - `task.tags = [...]` persists correctly
6. **Return JSON strings** - Always `JSON.stringify()` results

---

## Property Access Reference

### OmniJS (Inside evaluateJavascript) ✅

```javascript
// Reading properties - no parentheses
const name = task.name;
const id = task.id.primaryKey;
const completed = task.completed;
const dueDate = task.dueDate;
const project = task.containingProject;
const projectName = project ? project.name : null;
const tags = task.tags;
const tagNames = tags.map((t) => t.name);

// Parent relationships - all work!
const parentFolder = folder.parent; // ✅ Works
const projectFolder = project.parentFolder; // ✅ Works
const parentTask = task.parent; // ✅ Works

// Writing properties - direct assignment
task.name = 'New Name';
task.flagged = true;
task.tags = [Tag.byName('work'), Tag.byName('urgent')];
task.dueDate = new Date('2025-12-01');
task.plannedDate = new Date('2025-11-28');

// Finding objects
const task = Task.byIdentifier('taskId');
const project = Project.byIdentifier('projectId');
const tag = Tag.byName('tagName');
const folder = Folder.byIdentifier('folderId');

// Collections
const allTasks = flattenedTasks;
const allProjects = flattenedProjects;
const allFolders = flattenedFolders;
const allTags = flattenedTags;
const inboxTasks = inbox;
```

### JXA (Outer Wrapper) - Minimal Use Only

```javascript
// Only these patterns in JXA:
const app = Application('OmniFocus');
const result = app.evaluateJavascript(omniJsScript);
return result;
```

---

## Common Patterns

### Pattern 1: List/Query Operation

```typescript
export function buildListItemsScript(options: ListOptions): string {
  const opts = JSON.stringify(options);

  return `
    (() => {
      const app = Application('OmniFocus');

      try {
        const omniJsScript = \`
          (() => {
            const options = ${opts};
            const results = [];
            let count = 0;

            flattenedTasks.forEach(task => {
              if (count >= options.limit) return;

              // Filter logic
              if (options.completed === false && task.completed) return;
              if (options.flagged && !task.flagged) return;

              // Build result object
              results.push({
                id: task.id.primaryKey,
                name: task.name,
                completed: task.completed,
                flagged: task.flagged,
                dueDate: task.dueDate ? task.dueDate.toISOString() : null,
                project: task.containingProject ? task.containingProject.name : null,
                tags: task.tags.map(t => t.name)
              });
              count++;
            });

            return JSON.stringify({
              success: true,
              items: results,
              metadata: { count: results.length, limit: options.limit }
            });
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

### Pattern 2: Create Operation

```typescript
export function buildCreateItemScript(data: CreateData): string {
  const serialized = JSON.stringify(data);

  return `
    (() => {
      const app = Application('OmniFocus');

      try {
        const omniJsScript = \`
          (() => {
            const data = ${serialized};

            // Create the task
            const task = new Task(data.name, inbox);

            // Set properties
            if (data.note) task.note = data.note;
            if (data.flagged) task.flagged = data.flagged;
            if (data.dueDate) task.dueDate = new Date(data.dueDate);
            if (data.deferDate) task.deferDate = new Date(data.deferDate);

            // Set project
            if (data.projectId) {
              const project = Project.byIdentifier(data.projectId);
              if (project) {
                moveTasks([task], project);
              }
            }

            // Set tags
            if (data.tags && data.tags.length > 0) {
              task.tags = data.tags.map(name => {
                let tag = Tag.byName(name);
                if (!tag) tag = new Tag(name);
                return tag;
              });
            }

            return JSON.stringify({
              success: true,
              task: {
                id: task.id.primaryKey,
                name: task.name,
                project: task.containingProject ? task.containingProject.name : null
              }
            });
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

### Pattern 3: Update Operation

```typescript
export function buildUpdateItemScript(id: string, changes: Changes): string {
  const changesJson = JSON.stringify(changes);

  return `
    (() => {
      const app = Application('OmniFocus');

      try {
        const omniJsScript = \`
          (() => {
            const changes = ${changesJson};
            const task = Task.byIdentifier('${id}');

            if (!task) {
              return JSON.stringify({
                success: false,
                error: 'Task not found: ${id}'
              });
            }

            // Apply changes
            if (changes.name !== undefined) task.name = changes.name;
            if (changes.note !== undefined) task.note = changes.note;
            if (changes.flagged !== undefined) task.flagged = changes.flagged;
            if (changes.dueDate !== undefined) {
              task.dueDate = changes.dueDate ? new Date(changes.dueDate) : null;
            }

            // Handle tags
            if (changes.tags !== undefined) {
              task.tags = changes.tags.map(name => Tag.byName(name) || new Tag(name));
            }
            if (changes.addTags) {
              const currentTags = task.tags.slice();
              changes.addTags.forEach(name => {
                const tag = Tag.byName(name) || new Tag(name);
                if (!currentTags.includes(tag)) currentTags.push(tag);
              });
              task.tags = currentTags;
            }

            return JSON.stringify({
              success: true,
              task: {
                id: task.id.primaryKey,
                name: task.name,
                modified: new Date().toISOString()
              }
            });
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

### Pattern 4: Folder Hierarchy (Parent Access)

```typescript
export function buildFolderHierarchyScript(): string {
  return `
    (() => {
      const app = Application('OmniFocus');

      try {
        const omniJsScript = \`
          (() => {
            const results = [];

            // Helper to build folder path
            function getFolderPath(folder) {
              if (!folder) return '';
              const parts = [];
              let current = folder;
              while (current) {
                parts.unshift(current.name);
                current = current.parent;  // ✅ Works in OmniJS!
              }
              return parts.join('/');
            }

            flattenedFolders.forEach(folder => {
              results.push({
                id: folder.id.primaryKey,
                name: folder.name,
                path: getFolderPath(folder),
                parentId: folder.parent ? folder.parent.id.primaryKey : null,
                parentName: folder.parent ? folder.parent.name : null,
                depth: getFolderPath(folder).split('/').length - 1
              });
            });

            return JSON.stringify({
              success: true,
              folders: results
            });
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

## Migration Checklist

When converting a JXA script to OmniJS-first:

- [ ] Move all logic inside `evaluateJavascript()` block
- [ ] Change `property()` calls to `property` access
- [ ] Change `obj.id()` to `obj.id.primaryKey`
- [ ] Change `doc.flattenedTasks()` to `flattenedTasks` (global in OmniJS)
- [ ] Change `app.Task({...})` to `new Task(name, location)`
- [ ] Change `task.containingProject()` to `task.containingProject`
- [ ] Remove `safeGet()` wrappers (direct access is safe in OmniJS)
- [ ] Update error handling to use try/catch within OmniJS block
- [ ] Test all operations work correctly
- [ ] Update any related tests

---

## Error Handling

```typescript
// Standard error handling pattern
const omniJsScript = `
  (() => {
    try {
      // Your logic here

      return JSON.stringify({ success: true, data: result });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: {
          message: error.message || String(error),
          type: error.name || 'Error'
        }
      });
    }
  })()
`;
```

---

## Testing

When testing OmniJS-first scripts:

```bash
# Direct execution test
osascript -l JavaScript -e "$(cat << 'EOF'
(() => {
  const app = Application('OmniFocus');
  const result = app.evaluateJavascript(`
    (() => {
      return JSON.stringify({
        taskCount: flattenedTasks.length,
        projectCount: flattenedProjects.length
      });
    })()
  `);
  return result;
})()
EOF
)"
```

---

## Related Documentation

- [JXA vs OmniJS Patterns](./JXA-VS-OMNIJS-PATTERNS.md) - Detailed comparison
- [Migration Plan](../plans/omnijs-migration-plan.md) - Script migration tasks
- [Omni Automation](https://omni-automation.com/omnifocus/) - Official docs
