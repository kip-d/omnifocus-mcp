/**
 * Pattern-analysis data scan: one OmniJS bridge pass that returns slimmed
 * tasks, projects and tags for the detectors in OmniFocusAnalyzeTool
 * (pattern_analysis). The caller validates the result with SlimmedDataSchema.
 *
 * OMN-269: one OmniJS bridge scan replaces the old pure-JXA per-item loop.
 * JXA made ~12 Apple Event round trips per task (~34k on a ~2.9k-task DB)
 * and chronically exceeded the 120s script budget; inside evaluateJavascript
 * the same scan is property access in OmniFocus's own JS engine
 * (live-probed 2026-07-16: ~11s wall, ~1.25MB JSON, on the real DB).
 *
 * numberOfTasks/numberOfAvailableTasks return undefined in OmniJS on the
 * live app (probed 2026-07-16 on both Project and its root task, current OF
 * build) — despite src/omnifocus/api/type-mapping.md and the bundled .d.ts
 * declaring them, and three legacy scripts reading them behind `|| 0` masks
 * (OMN-270 covers those silent-undefined reads). Do NOT "simplify" back to
 * the properties without re-probing them live. The counts are therefore computed:
 * - taskCount: direct children of the project's root task — exact parity
 *   with JXA numberOfTasks() (219/219 projects in the 2026-07-16 probe).
 * - availableTaskCount: descendants with an actionable effective status
 *   (Available/DueSoon/Next/Overdue — ACTIONABLE_STATUSES semantics, the
 *   OMN-255 spec's live-verified equivalent). This is a deliberate semantic
 *   change from JXA numberOfAvailableTasks(), which counts DIRECT children
 *   and treats a blocked parent group as available when a descendant is;
 *   the flattened count reports the actual actionable tasks instead. The
 *   ===0 boundary — the only branching consumer semantic
 *   (missing_next_actions) — agreed with JXA on all 219 probed projects;
 *   non-zero values (surfaced informationally by dormant_projects) can
 *   exceed JXA's on projects with nested groups. Exact JXA parity was
 *   attempted and rejected: the closest reproduction (direct children
 *   actionable-or-with-actionable-descendant) still mismatched 2/219.
 */
import { ACTIONABLE_STATUSES_ARRAY_LITERAL, PROJECT_STATUS_STRING_SNIPPET } from '../../../contracts/ast/types.js';

export interface SlimmedDataScanOptions {
  maxTasks: number;
  includeCompleted: boolean;
}

export function buildSlimmedDataScript({ maxTasks, includeCompleted }: SlimmedDataScanOptions): string {
  const omniJsProgram = `(() => {
      const ACTIONABLE = ${ACTIONABLE_STATUSES_ARRAY_LITERAL};
      // OmniJS enums stringify as '[object Task.Status: Blocked]' — map explicitly.
      // Detectors only branch on 'blocked'; the rest are informational.
      function taskStatusString(s) {
        if (s === Task.Status.Blocked) return 'blocked';
        if (s === Task.Status.Available) return 'available';
        if (s === Task.Status.Next) return 'next';
        if (s === Task.Status.DueSoon) return 'dueSoon';
        if (s === Task.Status.Overdue) return 'overdue';
        if (s === Task.Status.Completed) return 'completed';
        if (s === Task.Status.Dropped) return 'dropped';
        return 'unknown';
      }
      // OMN-272: single-definition status map — see PROJECT_STATUS_STRING_SNIPPET
      // (contracts/ast/types). normalizeProjectStatus at the TS boundary stays
      // as the fail-open safety net for any future drift.
      ${PROJECT_STATUS_STRING_SNIPPET}
      // One shared date emitter: a throwing/absent date degrades to an
      // omitted key (SlimTask/SlimProject date fields are optional).
      function putISO(target, key, source, prop) {
        try {
          const v = source[prop];
          if (v) target[key] = v.toISOString();
        } catch(e) {}
      }

      const tasks = [];
      const allTasks = flattenedTasks;
      const maxTasks = ${String(maxTasks)};
      const includeCompleted = ${String(includeCompleted)};

      for (let i = 0; i < Math.min(allTasks.length, maxTasks); i++) {
        const task = allTasks[i];
        try {
          // OMN-338: skip project ROOT rows (non-null .project), as the
          // uncapped pass below does. Otherwise every detector sees each
          // project as a task: deadline_health overdue, clarify_candidates
          // names, +1 on every WIP count. Bare check inside this row's
          // try/catch keeps the loop's fail-closed semantics (a throwing read
          // drops the row, as before). Do NOT swap in the fail-open shared
          // IS_PROJECT_ROOT_ROW_SNIPPET here (OMN-290 splice-site lesson).
          if (task.project) continue;
          const completed = task.completed;
          if (!includeCompleted && completed) continue;
          // Dropped tasks keep completed===false, so the completed filter
          // alone let them through to every detector.
          if (!includeCompleted && task.taskStatus === Task.Status.Dropped) continue;

          const taskData = {
            id: task.id.primaryKey,
            name: task.name,
            completed: completed,
            flagged: task.flagged,
            status: taskStatusString(task.taskStatus)
          };

          // Per-field try/catch (as in the JXA version): one misbehaving
          // accessor on an edge-case task must degrade to a missing field,
          // never silently drop the whole row.
          try { taskData.tags = task.tags.map(t => t.name); } catch(e) { taskData.tags = []; }

          try {
            const container = task.containingProject;
            if (container) {
              taskData.project = container.name;
              taskData.projectId = container.id.primaryKey;
            }
          } catch(e) {}

          putISO(taskData, 'deferDate', task, 'deferDate');
          putISO(taskData, 'dueDate', task, 'dueDate');
          putISO(taskData, 'completionDate', task, 'completionDate');
          // added/modified are the OmniJS names for JXA's creationDate/modificationDate;
          // the wire keys stay the JXA-era names (SlimTaskSchema pins them).
          putISO(taskData, 'creationDate', task, 'added');
          putISO(taskData, 'modificationDate', task, 'modified');
          try { taskData.estimatedMinutes = task.estimatedMinutes; } catch(e) { taskData.estimatedMinutes = null; }

          try {
            const note = task.note;
            if (note) taskData.noteHead = note.substring(0, 160);
          } catch(e) {}
          try { taskData.children = task.children.length; } catch(e) { taskData.children = 0; }

          tasks.push(taskData);
        } catch(e) {
          // Skip problematic tasks
        }
      }

      // availableTaskCount for ALL projects in one uncapped pass over the
      // global collection (every descendant's containingProject IS its
      // project, so this equals the per-project flattened count) instead of
      // re-walking each project's subtree. Deliberately separate from the
      // capped task loop above: coupling counts to max_tasks would undercount
      // projects beyond the cap into false "stalled" reports. Failure
      // granularity (review rounds 2-4): one bad task costs only itself
      // (inner try/catch); a failure of the pass itself propagates to a
      // script error and the OMN-268 envelope — an unreadable count must NOT
      // surface as a real 0.
      const availByProject = {};
      flattenedTasks.forEach(t => {
        try {
          // The global collection INCLUDES each project's root task, which
          // project.flattenedTasks excludes — and a root task reads as
          // actionable even when the project has no workable children.
          // Root tasks have a non-null .project; skip them (live-caught:
          // counting roots turned 12 of 13 stalled projects "healthy").
          if (t.project) return;
          if (ACTIONABLE.indexOf(t.taskStatus) === -1) return;
          const proj = t.containingProject;
          if (!proj) return;
          const pid = proj.id.primaryKey;
          availByProject[pid] = (availByProject[pid] || 0) + 1;
        } catch(e) {}
      });

      const projects = [];
      flattenedProjects.forEach(project => {
        try {
          const taskCount = project.task ? project.task.children.length : 0;

          const projectData = {
            id: project.id.primaryKey,
            name: project.name,
            status: projectStatusString(project.status),
            taskCount: taskCount,
            availableTaskCount: availByProject[project.id.primaryKey] || 0
          };

          try { projectData.folder = project.parentFolder ? project.parentFolder.name : null; } catch(e) { projectData.folder = null; }
          putISO(projectData, 'lastReviewDate', project, 'lastReviewDate');
          putISO(projectData, 'nextReviewDate', project, 'nextReviewDate');
          putISO(projectData, 'creationDate', project, 'added');
          putISO(projectData, 'modificationDate', project, 'modified');
          putISO(projectData, 'completionDate', project, 'completionDate');
          try { projectData.sequential = project.sequential; } catch(e) {}

          projects.push(projectData);
        } catch(e) {}
      });

      const tags = [];
      flattenedTags.forEach(tag => {
        try {
          const tagData = { name: tag.name, id: tag.id.primaryKey };
          // taskCount degrades to 0 rather than dropping the tag row
          try { tagData.taskCount = tag.tasks.length; } catch(e) { tagData.taskCount = 0; }
          tags.push(tagData);
        } catch(e) {}
      });

      return JSON.stringify({ tasks: tasks, projects: projects, tags: tags });
    })()`;

  // Minimal JXA wrapper (OMNIJS-FIRST-PATTERN). The program is injected via
  // JSON.stringify to sidestep nested-template escaping entirely.
  return `(() => {
      const app = Application('OmniFocus');
      return app.evaluateJavascript(${JSON.stringify(omniJsProgram)});
    })()`;
}
