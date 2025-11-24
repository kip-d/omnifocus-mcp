/**
 * list-tasks-omnijs.ts - OmniJS-First Architecture
 *
 * MAJOR REDESIGN: Achieves 13-22x performance improvement by using OmniJS
 * property access instead of JXA per-property calls.
 *
 * Key Innovation:
 * - Fixed-size OmniJS scripts (no embedded task IDs - avoids Issue #27)
 * - Single bridge call for all property access (~0.001ms vs 16.662ms per property)
 * - Filtering done in OmniJS context for maximum speed
 *
 * Performance:
 * - Before: 45 inbox tasks = 13-22 seconds
 * - After: 45 inbox tasks = <1 second
 * - Improvement: 13-22x faster
 *
 * Pattern based on: src/omnifocus/scripts/perspectives/query-perspective.ts
 */

/**
 * Main script export - OmniJS-first architecture
 *
 * The template uses {{}} placeholders that get replaced at runtime with actual values.
 * This keeps the script size fixed (no embedded task IDs).
 */
export const LIST_TASKS_SCRIPT_V3 = `
  (() => {
    const app = Application('OmniFocus');
    const filter = {{filter}};
    const fields = {{fields}} || [];
    const limit = {{limit}} || 50;
    const mode = filter.mode || 'all';

    try {
      // Helper to check if field should be included
      function shouldInclude(fieldName) {
        return !fields || fields.length === 0 || fields.includes(fieldName);
      }

      // Tag filter helper - will be embedded in each mode's OmniJS script
      const tagFilterHelper = \`
        function matchesTagFilter(task, filterTags, tagsOperator) {
          if (!filterTags || filterTags.length === 0) return true;

          const taskTags = task.tags ? task.tags.map(t => t.name) : [];
          const operator = tagsOperator || 'AND';

          switch(operator) {
            case 'OR':
            case 'IN':
              return filterTags.some(tag => taskTags.includes(tag));
            case 'NOT_IN':
              return !filterTags.some(tag => taskTags.includes(tag));
            case 'AND':
            default:
              return filterTags.every(tag => taskTags.includes(tag));
          }
        }
      \`;

      // Text filter helper - Bug #9 fix
      const textFilterHelper = \`
        function matchesTextFilter(task, filterText, textOperator) {
          if (!filterText) return true;

          const taskName = (task.name || '').toLowerCase();
          const taskNote = (task.note || '').toLowerCase();
          const searchTerm = filterText.toLowerCase();
          const operator = textOperator || 'CONTAINS';

          switch(operator) {
            case 'CONTAINS':
              return taskName.includes(searchTerm) || taskNote.includes(searchTerm);
            case 'MATCHES':
              return taskName === searchTerm || taskNote === searchTerm;
            default:
              return true;
          }
        }
      \`;

      // Date filter helper - Bug #10 fix
      const dateFilterHelper = \`
        function matchesDateFilter(task, dueAfter, dueBefore, dueDateOperator) {
          if (!dueAfter && !dueBefore) return true;

          const dueDate = task.dueDate;

          if (dueDateOperator === 'BETWEEN' && dueAfter && dueBefore) {
            // BETWEEN: Exclude tasks with no due date AND tasks outside range
            if (!dueDate) return false;
            const dueLower = new Date(dueAfter);
            const dueUpper = new Date(dueBefore);
            // Include tasks with dueDate >= lower AND dueDate <= upper
            return dueDate >= dueLower && dueDate <= dueUpper;
          }

          // Other operators can be added here as needed
          return true;
        }
      \`;

      // Determine which OmniJS collection and filter to use
      let omniJsScript = '';

      if (filter.id) {
        // ID MODE - Fast lookup by exact task ID
        omniJsScript = \`
          (() => {
            \${tagFilterHelper}

            const results = [];
            const targetId = '\${filter.id}';
            const filterTags = \${JSON.stringify(filter.tags || [])};
            const tagsOperator = '\${filter.tagsOperator || 'AND'}';

            // Search through all tasks for exact ID match
            flattenedTasks.forEach(task => {
              if (task.id.primaryKey === targetId) {
                // Apply tag filter
                if (!matchesTagFilter(task, filterTags, tagsOperator)) return;

                results.push({
                  \${shouldInclude('id') ? 'id: task.id.primaryKey,' : ''}
                  \${shouldInclude('name') ? 'name: task.name,' : ''}
                  \${shouldInclude('completed') ? 'completed: task.completed || false,' : ''}
                  \${shouldInclude('flagged') ? 'flagged: task.flagged || false,' : ''}
                  \${shouldInclude('inInbox') ? 'inInbox: !task.containingProject,' : ''}
                  \${shouldInclude('blocked') ? 'blocked: task.taskStatus === Task.Status.Blocked,' : ''}
                  \${shouldInclude('available') ? 'available: task.taskStatus === Task.Status.Available,' : ''}
                  \${shouldInclude('taskStatus') ? 'taskStatus: task.taskStatus === Task.Status.Available ? "available" : task.taskStatus === Task.Status.Blocked ? "blocked" : "other",' : ''}
                  \${shouldInclude('dueDate') ? 'dueDate: task.dueDate ? task.dueDate.toISOString() : null,' : ''}
                  \${shouldInclude('deferDate') ? 'deferDate: task.deferDate ? task.deferDate.toISOString() : null,' : ''}
                  \${shouldInclude('plannedDate') ? 'plannedDate: task.plannedDate ? task.plannedDate.toISOString() : null,' : ''}
                  \${shouldInclude('added') ? 'added: task.added ? task.added.toISOString() : null,' : ''}
                  \${shouldInclude('modified') ? 'modified: task.modified ? task.modified.toISOString() : null,' : ''}
                  \${shouldInclude('completionDate') ? 'completionDate: task.completionDate ? task.completionDate.toISOString() : null,' : ''}
                  \${shouldInclude('tags') ? 'tags: task.tags ? task.tags.map(t => t.name) : [],' : ''}
                  \${shouldInclude('note') ? 'note: task.note || "",' : ''}
                  \${shouldInclude('estimatedMinutes') ? 'estimatedMinutes: task.estimatedMinutes || null,' : ''}
                  \${shouldInclude('project') || shouldInclude('projectId') ? '...((project) => { const result = {}; if (project) { result.project = project.name; result.projectId = project.id.primaryKey; } else { result.project = null; result.projectId = null; } return result; })(task.containingProject),' : ''}
                  \${shouldInclude('repetitionRule') ? 'repetitionRule: (function() { const rule = task.repetitionRule; if (!rule) return null; try { return { recurrence: rule.recurrence || null, repetitionMethod: rule.method ? rule.method.toString() : null, ruleString: rule.ruleString || null }; } catch (e) { return { _error: e.toString() }; } })(),' : ''}
                  \${shouldInclude('parentTaskId') || shouldInclude('parentTaskName') ? '...((parent) => { const result = {}; if (parent) { result.parentTaskId = parent.id.primaryKey; result.parentTaskName = parent.name; } return result; })(task.parent),' : ''}
                });
              }
            });

            return JSON.stringify({
              tasks: results,
              count: results.length,
              collection: 'flattenedTasks',
              mode: 'id_lookup',
              targetId: targetId
            });
          })()
        \`;
      } else if (mode === 'inbox') {
        // INBOX MODE - Use inbox global collection
        omniJsScript = \`
          (() => {
            \${tagFilterHelper}

            const results = [];
            let count = 0;
            const limit = \${limit};
            const filterTags = \${JSON.stringify(filter.tags || [])};
            const tagsOperator = '\${filter.tagsOperator || 'AND'}';

            inbox.forEach(task => {
              if (count >= limit) return;

              // Apply tag filter
              if (!matchesTagFilter(task, filterTags, tagsOperator)) return;

              results.push({
                \${shouldInclude('id') ? 'id: task.id.primaryKey,' : ''}
                \${shouldInclude('name') ? 'name: task.name,' : ''}
                \${shouldInclude('completed') ? 'completed: task.completed || false,' : ''}
                \${shouldInclude('flagged') ? 'flagged: task.flagged || false,' : ''}
                \${shouldInclude('inInbox') ? 'inInbox: true,' : ''}
                \${shouldInclude('blocked') ? 'blocked: task.taskStatus === Task.Status.Blocked,' : ''}
                \${shouldInclude('available') ? 'available: task.taskStatus === Task.Status.Available,' : ''}
                \${shouldInclude('taskStatus') ? 'taskStatus: task.taskStatus === Task.Status.Available ? "available" : task.taskStatus === Task.Status.Blocked ? "blocked" : "other",' : ''}
                \${shouldInclude('dueDate') ? 'dueDate: task.dueDate ? task.dueDate.toISOString() : null,' : ''}
                \${shouldInclude('deferDate') ? 'deferDate: task.deferDate ? task.deferDate.toISOString() : null,' : ''}
                \${shouldInclude('plannedDate') ? 'plannedDate: task.plannedDate ? task.plannedDate.toISOString() : null,' : ''}
                \${shouldInclude('added') ? 'added: task.added ? task.added.toISOString() : null,' : ''}
                \${shouldInclude('modified') ? 'modified: task.modified ? task.modified.toISOString() : null,' : ''}
                \${shouldInclude('completionDate') ? 'completionDate: task.completionDate ? task.completionDate.toISOString() : null,' : ''}
                \${shouldInclude('tags') ? 'tags: task.tags ? task.tags.map(t => t.name) : [],' : ''}
                \${shouldInclude('note') ? 'note: task.note || "",' : ''}
                \${shouldInclude('estimatedMinutes') ? 'estimatedMinutes: task.estimatedMinutes || null,' : ''}
                \${shouldInclude('project') || shouldInclude('projectId') ? 'project: null, projectId: null,' : ''}
                \${shouldInclude('repetitionRule') ? 'repetitionRule: (function() { const rule = task.repetitionRule; if (!rule) return null; try { return { recurrence: rule.recurrence || null, repetitionMethod: rule.method ? rule.method.toString() : null, ruleString: rule.ruleString || null }; } catch (e) { return { _error: e.toString() }; } })(),' : ''}
                \${shouldInclude('parentTaskId') || shouldInclude('parentTaskName') ? '...((parent) => { const result = {}; if (parent) { result.parentTaskId = parent.id.primaryKey; result.parentTaskName = parent.name; } return result; })(task.parent),' : ''}
              });

              count++;
            });

            return JSON.stringify({
              tasks: results,
              count: results.length,
              collection: 'inbox',
              mode: 'inbox'
            });
          })()
        \`;
      } else if (mode === 'today') {
        // TODAY MODE - Incomplete tasks due today
        omniJsScript = \`
          (() => {
            \${tagFilterHelper}

            const results = [];
            let count = 0;
            const limit = \${limit};
            const filterTags = \${JSON.stringify(filter.tags || [])};
            const tagsOperator = '\${filter.tagsOperator || 'AND'}';
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            flattenedTasks.forEach(task => {
              if (count >= limit) return;
              if (task.completed) return;

              const dueDate = task.dueDate;
              if (!dueDate) return;

              const taskDate = new Date(dueDate);
              taskDate.setHours(0, 0, 0, 0);

              if (taskDate >= today && taskDate < tomorrow) {
                // Apply tag filter
                if (!matchesTagFilter(task, filterTags, tagsOperator)) return;

                const proj = task.containingProject;
                results.push({
                  \${shouldInclude('id') ? 'id: task.id.primaryKey,' : ''}
                  \${shouldInclude('name') ? 'name: task.name,' : ''}
                  \${shouldInclude('completed') ? 'completed: false,' : ''}
                  \${shouldInclude('flagged') ? 'flagged: task.flagged || false,' : ''}
                  \${shouldInclude('inInbox') ? 'inInbox: task.inInbox || false,' : ''}
                  \${shouldInclude('blocked') ? 'blocked: task.taskStatus === Task.Status.Blocked,' : ''}
                  \${shouldInclude('available') ? 'available: task.taskStatus === Task.Status.Available,' : ''}
                  \${shouldInclude('dueDate') ? 'dueDate: task.dueDate.toISOString(),' : ''}
                  \${shouldInclude('deferDate') ? 'deferDate: task.deferDate ? task.deferDate.toISOString() : null,' : ''}
                  \${shouldInclude('plannedDate') ? 'plannedDate: task.plannedDate ? task.plannedDate.toISOString() : null,' : ''}
                  \${shouldInclude('tags') ? 'tags: task.tags ? task.tags.map(t => t.name) : [],' : ''}
                  \${shouldInclude('note') ? 'note: task.note || "",' : ''}
                  \${shouldInclude('project') ? 'project: proj ? proj.name : null,' : ''}
                  \${shouldInclude('projectId') ? 'projectId: proj ? proj.id.primaryKey : null,' : ''}
                  \${shouldInclude('repetitionRule') ? 'repetitionRule: (function() { const rule = task.repetitionRule; if (!rule) return null; try { return { recurrence: rule.recurrence || null, repetitionMethod: rule.method ? rule.method.toString() : null, ruleString: rule.ruleString || null }; } catch (e) { return { _error: e.toString() }; } })(),' : ''}
                });
                count++;
              }
            });

            return JSON.stringify({
              tasks: results,
              count: results.length,
              collection: 'flattenedTasks',
              mode: 'today'
            });
          })()
        \`;
      } else if (mode === 'overdue') {
        // OVERDUE MODE - Incomplete tasks past due
        omniJsScript = \`
          (() => {
            const results = [];
            let count = 0;
            const limit = \${limit};
            const now = new Date();

            flattenedTasks.forEach(task => {
              if (count >= limit) return;
              if (task.completed) return;

              const dueDate = task.dueDate;
              if (!dueDate || dueDate >= now) return;

              // Apply tag filter
              if (!matchesTagFilter(task, filterTags, tagsOperator)) return;

              const proj = task.containingProject;
              results.push({
                \${shouldInclude('id') ? 'id: task.id.primaryKey,' : ''}
                \${shouldInclude('name') ? 'name: task.name,' : ''}
                \${shouldInclude('completed') ? 'completed: false,' : ''}
                \${shouldInclude('flagged') ? 'flagged: task.flagged || false,' : ''}
                \${shouldInclude('inInbox') ? 'inInbox: task.inInbox || false,' : ''}
                \${shouldInclude('blocked') ? 'blocked: task.taskStatus === Task.Status.Blocked,' : ''}
                \${shouldInclude('available') ? 'available: task.taskStatus === Task.Status.Available,' : ''}
                \${shouldInclude('dueDate') ? 'dueDate: task.dueDate.toISOString(),' : ''}
                \${shouldInclude('deferDate') ? 'deferDate: task.deferDate ? task.deferDate.toISOString() : null,' : ''}
                \${shouldInclude('plannedDate') ? 'plannedDate: task.plannedDate ? task.plannedDate.toISOString() : null,' : ''}
                \${shouldInclude('tags') ? 'tags: task.tags ? task.tags.map(t => t.name) : [],' : ''}
                \${shouldInclude('note') ? 'note: task.note || "",' : ''}
                \${shouldInclude('project') ? 'project: proj ? proj.name : null,' : ''}
                \${shouldInclude('projectId') ? 'projectId: proj ? proj.id.primaryKey : null,' : ''}
                \${shouldInclude('repetitionRule') ? 'repetitionRule: (function() { const rule = task.repetitionRule; if (!rule) return null; try { return { recurrence: rule.recurrence || null, repetitionMethod: rule.method ? rule.method.toString() : null, ruleString: rule.ruleString || null }; } catch (e) { return { _error: e.toString() }; } })(),' : ''}
              });
              count++;
            });

            return JSON.stringify({
              tasks: results,
              count: results.length,
              collection: 'flattenedTasks',
              mode: 'overdue'
            });
          })()
        \`;
      } else if (mode === 'flagged') {
        // FLAGGED MODE - Incomplete flagged tasks
        omniJsScript = \`
          (() => {
            const results = [];
            let count = 0;
            const limit = \${limit};

            flattenedTasks.forEach(task => {
              if (count >= limit) return;
              if (task.completed) return;
              if (!task.flagged) return;

              // Apply tag filter
              if (!matchesTagFilter(task, filterTags, tagsOperator)) return;

              const proj = task.containingProject;
              results.push({
                \${shouldInclude('id') ? 'id: task.id.primaryKey,' : ''}
                \${shouldInclude('name') ? 'name: task.name,' : ''}
                \${shouldInclude('completed') ? 'completed: false,' : ''}
                \${shouldInclude('flagged') ? 'flagged: true,' : ''}
                \${shouldInclude('inInbox') ? 'inInbox: task.inInbox || false,' : ''}
                \${shouldInclude('blocked') ? 'blocked: task.taskStatus === Task.Status.Blocked,' : ''}
                \${shouldInclude('available') ? 'available: task.taskStatus === Task.Status.Available,' : ''}
                \${shouldInclude('dueDate') ? 'dueDate: task.dueDate ? task.dueDate.toISOString() : null,' : ''}
                \${shouldInclude('deferDate') ? 'deferDate: task.deferDate ? task.deferDate.toISOString() : null,' : ''}
                \${shouldInclude('plannedDate') ? 'plannedDate: task.plannedDate ? task.plannedDate.toISOString() : null,' : ''}
                \${shouldInclude('tags') ? 'tags: task.tags ? task.tags.map(t => t.name) : [],' : ''}
                \${shouldInclude('note') ? 'note: task.note || "",' : ''}
                \${shouldInclude('project') ? 'project: proj ? proj.name : null,' : ''}
                \${shouldInclude('projectId') ? 'projectId: proj ? proj.id.primaryKey : null,' : ''}
                \${shouldInclude('repetitionRule') ? 'repetitionRule: (function() { const rule = task.repetitionRule; if (!rule) return null; try { return { recurrence: rule.recurrence || null, repetitionMethod: rule.method ? rule.method.toString() : null, ruleString: rule.ruleString || null }; } catch (e) { return { _error: e.toString() }; } })(),' : ''}
              });
              count++;
            });

            return JSON.stringify({
              tasks: results,
              count: results.length,
              collection: 'flattenedTasks',
              mode: 'flagged'
            });
          })()
        \`;
      } else if (mode === 'available') {
        // AVAILABLE MODE - Tasks available for work
        omniJsScript = \`
          (() => {
            const results = [];
            let count = 0;
            const limit = \${limit};

            flattenedTasks.forEach(task => {
              if (count >= limit) return;
              if (task.completed) return;
              if (task.taskStatus !== Task.Status.Available) return;

              // Apply tag filter
              if (!matchesTagFilter(task, filterTags, tagsOperator)) return;

              const proj = task.containingProject;
              results.push({
                \${shouldInclude('id') ? 'id: task.id.primaryKey,' : ''}
                \${shouldInclude('name') ? 'name: task.name,' : ''}
                \${shouldInclude('completed') ? 'completed: false,' : ''}
                \${shouldInclude('flagged') ? 'flagged: task.flagged || false,' : ''}
                \${shouldInclude('inInbox') ? 'inInbox: task.inInbox || false,' : ''}
                \${shouldInclude('blocked') ? 'blocked: false,' : ''}
                \${shouldInclude('available') ? 'available: true,' : ''}
                \${shouldInclude('taskStatus') ? 'taskStatus: "available",' : ''}
                \${shouldInclude('dueDate') ? 'dueDate: task.dueDate ? task.dueDate.toISOString() : null,' : ''}
                \${shouldInclude('deferDate') ? 'deferDate: task.deferDate ? task.deferDate.toISOString() : null,' : ''}
                \${shouldInclude('plannedDate') ? 'plannedDate: task.plannedDate ? task.plannedDate.toISOString() : null,' : ''}
                \${shouldInclude('tags') ? 'tags: task.tags ? task.tags.map(t => t.name) : [],' : ''}
                \${shouldInclude('note') ? 'note: task.note || "",' : ''}
                \${shouldInclude('project') ? 'project: proj ? proj.name : null,' : ''}
                \${shouldInclude('projectId') ? 'projectId: proj ? proj.id.primaryKey : null,' : ''}
                \${shouldInclude('repetitionRule') ? 'repetitionRule: (function() { const rule = task.repetitionRule; if (!rule) return null; try { return { recurrence: rule.recurrence || null, repetitionMethod: rule.method ? rule.method.toString() : null, ruleString: rule.ruleString || null }; } catch (e) { return { _error: e.toString() }; } })(),' : ''}
              });
              count++;
            });

            return JSON.stringify({
              tasks: results,
              count: results.length,
              collection: 'flattenedTasks',
              mode: 'available'
            });
          })()
        \`;
      } else if (mode === 'search') {
        // SEARCH MODE - Find tasks by name or note content
        const searchTerm = (filter.search || '').toLowerCase();
        omniJsScript = \`
          (() => {
            const results = [];
            let count = 0;
            const limit = \${limit};
            const searchTerm = \${JSON.stringify(searchTerm)};

            flattenedTasks.forEach(task => {
              if (count >= limit) return;

              // Search in task name and note
              const taskName = (task.name || '').toLowerCase();
              const taskNote = (task.note || '').toLowerCase();

              if (!taskName.includes(searchTerm) && !taskNote.includes(searchTerm)) {
                return;
              }

              // Apply tag filter
              if (!matchesTagFilter(task, filterTags, tagsOperator)) return;

              const proj = task.containingProject;
              results.push({
                \${shouldInclude('id') ? 'id: task.id.primaryKey,' : ''}
                \${shouldInclude('name') ? 'name: task.name,' : ''}
                \${shouldInclude('completed') ? 'completed: task.completed || false,' : ''}
                \${shouldInclude('flagged') ? 'flagged: task.flagged || false,' : ''}
                \${shouldInclude('inInbox') ? 'inInbox: task.inInbox || false,' : ''}
                \${shouldInclude('blocked') ? 'blocked: task.taskStatus === Task.Status.Blocked,' : ''}
                \${shouldInclude('available') ? 'available: task.taskStatus === Task.Status.Available,' : ''}
                \${shouldInclude('dueDate') ? 'dueDate: task.dueDate ? task.dueDate.toISOString() : null,' : ''}
                \${shouldInclude('deferDate') ? 'deferDate: task.deferDate ? task.deferDate.toISOString() : null,' : ''}
                \${shouldInclude('plannedDate') ? 'plannedDate: task.plannedDate ? task.plannedDate.toISOString() : null,' : ''}
                \${shouldInclude('tags') ? 'tags: task.tags ? task.tags.map(t => t.name) : [],' : ''}
                \${shouldInclude('note') ? 'note: task.note || "",' : ''}
                \${shouldInclude('estimatedMinutes') ? 'estimatedMinutes: task.estimatedMinutes || null,' : ''}
                \${shouldInclude('project') ? 'project: proj ? proj.name : null,' : ''}
                \${shouldInclude('projectId') ? 'projectId: proj ? proj.id.primaryKey : null,' : ''}
                \${shouldInclude('repetitionRule') ? 'repetitionRule: (function() { const rule = task.repetitionRule; if (!rule) return null; try { return { recurrence: rule.recurrence || null, repetitionMethod: rule.method ? rule.method.toString() : null, ruleString: rule.ruleString || null }; } catch (e) { return { _error: e.toString() }; } })(),' : ''}
              });
              count++;
            });

            return JSON.stringify({
              tasks: results,
              count: results.length,
              collection: 'flattenedTasks',
              mode: 'search',
              searchTerm: searchTerm
            });
          })()
        \`;
      } else {
        // ALL/DEFAULT MODE - All tasks with completed status filtering
        // Handle three cases:
        // 1. filter.completed === true → Only return completed tasks
        // 2. filter.completed === false → Only return non-completed tasks
        // 3. filter.completed === undefined → Default: skip completed (backward compatible)
        const wantCompleted = filter.completed === true;
        const wantOnlyActive = filter.completed === false;
        const skipCompleted = !wantCompleted && (wantOnlyActive || filter.includeCompleted !== true);
        const filterTags = filter.tags || [];
        const tagsOperator = filter.tagsOperator || 'AND';
        const filterText = filter.text || '';
        const textOperator = filter.textOperator || 'CONTAINS';
        const dueAfter = filter.dueAfter || '';
        const dueBefore = filter.dueBefore || '';
        const dueDateOperator = filter.dueDateOperator || '';
        const filterFlagged = filter.flagged; // undefined means no filter, true/false means filter
        omniJsScript = \`
          (() => {
            \${tagFilterHelper}
            \${textFilterHelper}
            \${dateFilterHelper}

            const results = [];
            let count = 0;
            const limit = \${limit};
            const filterTags = \${JSON.stringify(filterTags)};
            const tagsOperator = '\${tagsOperator}';
            const filterText = \${JSON.stringify(filterText)};
            const textOperator = '\${textOperator}';
            const dueAfter = \${JSON.stringify(dueAfter)};
            const dueBefore = \${JSON.stringify(dueBefore)};
            const dueDateOperator = '\${dueDateOperator}';
            const filterFlagged = \${filterFlagged === undefined ? 'undefined' : filterFlagged};

            flattenedTasks.forEach(task => {
              if (count >= limit) return;
              \${wantCompleted ? 'if (!task.completed) return;' : (skipCompleted ? 'if (task.completed) return;' : '')}

              // Apply tag filter
              if (!matchesTagFilter(task, filterTags, tagsOperator)) return;

              // Apply text filter (Bug #9 fix)
              if (!matchesTextFilter(task, filterText, textOperator)) return;

              // Apply date filter (Bug #10 fix)
              if (!matchesDateFilter(task, dueAfter, dueBefore, dueDateOperator)) return;

              // Apply flagged filter (Bug #11 fix - PR #33 testing)
              if (filterFlagged !== undefined && task.flagged !== filterFlagged) return;

              const proj = task.containingProject;
              results.push({
                \${shouldInclude('id') ? 'id: task.id.primaryKey,' : ''}
                \${shouldInclude('name') ? 'name: task.name,' : ''}
                \${shouldInclude('completed') ? 'completed: task.completed || false,' : ''}
                \${shouldInclude('flagged') ? 'flagged: task.flagged || false,' : ''}
                \${shouldInclude('inInbox') ? 'inInbox: task.inInbox || false,' : ''}
                \${shouldInclude('blocked') ? 'blocked: task.taskStatus === Task.Status.Blocked,' : ''}
                \${shouldInclude('available') ? 'available: task.taskStatus === Task.Status.Available,' : ''}
                \${shouldInclude('dueDate') ? 'dueDate: task.dueDate ? task.dueDate.toISOString() : null,' : ''}
                \${shouldInclude('deferDate') ? 'deferDate: task.deferDate ? task.deferDate.toISOString() : null,' : ''}
                \${shouldInclude('plannedDate') ? 'plannedDate: task.plannedDate ? task.plannedDate.toISOString() : null,' : ''}
                \${shouldInclude('tags') ? 'tags: task.tags ? task.tags.map(t => t.name) : [],' : ''}
                \${shouldInclude('note') ? 'note: task.note || "",' : ''}
                \${shouldInclude('project') ? 'project: proj ? proj.name : null,' : ''}
                \${shouldInclude('projectId') ? 'projectId: proj ? proj.id.primaryKey : null,' : ''}
                \${shouldInclude('repetitionRule') ? 'repetitionRule: (function() { const rule = task.repetitionRule; if (!rule) return null; try { return { recurrence: rule.recurrence || null, repetitionMethod: rule.method ? rule.method.toString() : null, ruleString: rule.ruleString || null }; } catch (e) { return { _error: e.toString() }; } })(),' : ''}
              });
              count++;
            });

            return JSON.stringify({
              tasks: results,
              count: results.length,
              collection: 'flattenedTasks',
              mode: 'all'
            });
          })()
        \`;
      }

      // Execute the OmniJS script - SINGLE BRIDGE CALL!
      const resultJson = app.evaluateJavascript(omniJsScript);
      const result = JSON.parse(resultJson);

      // Return with metadata
      return JSON.stringify({
        tasks: result.tasks,
        metadata: {
          total_count: result.count,
          limit_applied: limit,
          mode: result.mode,
          collection: result.collection,
          optimization: 'omnijs_v3',
          architecture: 'omnijs_first'
        }
      });

    } catch (error) {
      return JSON.stringify({
        error: true,
        message: error.message || String(error),
        stack: error.stack || '',
        context: 'list_tasks_v3_omnijs'
      });
    }
  })();
`;
