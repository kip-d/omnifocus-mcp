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
 *
 * OMN-340 (slice 3): the maxTasks budget applies to ADMITTED rows (not
 * completed, not dropped, not a project root — unless includeCompleted),
 * never to raw rows walked. The returned scanMeta block ({scannedTotal,
 * admittedTotal, cap}) lets the caller build an honest coverage disclosure
 * even when the admissible population exceeds the budget.
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

      // OMN-340 (slice 3): the budget applies to ADMITTED rows, not raw rows
      // walked. Before this, completed/dropped/root rows burned a slot in the
      // Math.min(allTasks.length, maxTasks) walk, so the scan could exhaust
      // its budget on terminal rows before reaching a single live task. The
      // walk below always covers every raw row (scannedTotal === allTasks.length)
      // so admittedTotal is the TRUE admissible population ("count the
      // population, cap only the detail" — OMN-335/340 principle); once
      // tasks.length reaches maxTasks, admitted rows past the budget are
      // still counted (admittedTotal++) but NOT built into a full row (no
      // per-field try/catch, no date/tag reads).
      //
      // This one walk also computes availByProject (availableTaskCount for
      // every project), which used to be a second whole-database pass. Both
      // passes read taskStatus, the costliest read here because OmniFocus may
      // compute it (blocked/available chain) rather than store it; sharing
      // the walk reads it ONCE per row, into status, for admission, the
      // built row and the count alike. Checks run cheapest-first: completed
      // is a stored boolean, and a completed row is never actionable, so it
      // leaves before any taskStatus read (most rows in a real GTD database
      // are completed); .project is a reference compare. The count is
      // recorded before the dropped skip and the budget check, so it stays
      // whole-database however small maxTasks is (#312 review). (No
      // backticks in this comment block: it sits inside a TS template
      // literal.)
      let scannedTotal = 0;
      let admittedTotal = 0;
      // A row whose reads throw, during admission or while its row is built,
      // is UNREADABLE: counted here and taken back out of admittedTotal, so
      // an uncapped scan always has admittedTotal === tasks.length and the
      // loss is disclosed instead of silently shrinking the result (#312
      // review round 2).
      let unreadableTotal = 0;
      const availByProject = {};
      for (let i = 0; i < allTasks.length; i++) {
        scannedTotal++;
        const task = allTasks[i];
        let admitted = false;
        try {
          const completed = task.completed;
          if (!includeCompleted && completed) continue;
          // OMN-338: skip project ROOT rows (non-null .project) in both the
          // admission and the count. Otherwise every detector sees each
          // project as a task (deadline_health overdue, clarify_candidates
          // names, +1 on every WIP count), and a root task reads as
          // actionable even when the project has no workable children
          // (live-caught: counting roots turned 12 of 13 stalled projects
          // "healthy"). Bare check inside this row's try/catch keeps the
          // loop's fail-closed semantics (a throwing read drops the row, as
          // before). Do NOT swap in the fail-open shared
          // IS_PROJECT_ROOT_ROW_SNIPPET here (OMN-290 splice-site lesson).
          if (task.project) continue;
          const status = task.taskStatus;
          // availableTaskCount: every descendant's containingProject IS its
          // project, so this equals the per-project flattened count. Its own
          // try/catch: an unreadable container costs only this row's count,
          // never its admission.
          if (ACTIONABLE.indexOf(status) !== -1) {
            try {
              const proj = task.containingProject;
              if (proj) {
                const pid = proj.id.primaryKey;
                availByProject[pid] = (availByProject[pid] || 0) + 1;
              }
            } catch(e) {}
          }
          // Dropped tasks keep completed===false, so the completed filter
          // alone let them through to every detector.
          if (!includeCompleted && status === Task.Status.Dropped) continue;

          // Admitted: not completed (unless include_completed), not a
          // project root, not dropped (unless include_completed).
          admittedTotal++;
          admitted = true;
          // OMN-340: the 3000 budget is consumed by ADMITTED rows only. Once
          // filled, keep counting admittedTotal (coverage.total must be the
          // true admissible population) but stop building full rows.
          if (tasks.length >= maxTasks) continue;

          const taskData = {
            id: task.id.primaryKey,
            name: task.name,
            completed: completed,
            flagged: task.flagged,
            status: taskStatusString(status)
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
          unreadableTotal++;
          if (admitted) admittedTotal--;
        }
      }

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

      return JSON.stringify({
        tasks: tasks,
        projects: projects,
        tags: tags,
        // OMN-340 (slice 3): scanMeta.admittedTotal is the true admissible
        // population (every non-root, non-terminal task), independent of the
        // maxTasks budget; scannedTotal is every raw row walked (always
        // allTasks.length, since the walk no longer stops early);
        // unreadableTotal is rows dropped because a read threw (never part of
        // admittedTotal). The tool builds the shared coverage disclosure from
        // these.
        scanMeta: {
          scannedTotal: scannedTotal,
          admittedTotal: admittedTotal,
          unreadableTotal: unreadableTotal,
          cap: maxTasks
        }
      });
    })()`;

  // Minimal JXA wrapper (OMNIJS-FIRST-PATTERN). The program is injected via
  // JSON.stringify to sidestep nested-template escaping entirely.
  return `(() => {
      const app = Application('OmniFocus');
      return app.evaluateJavascript(${JSON.stringify(omniJsProgram)});
    })()`;
}
