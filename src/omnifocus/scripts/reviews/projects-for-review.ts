/**
 * Script to find projects that are due for review
 *
 * Architecture: OmniJS-first (2025+)
 * - Minimal JXA wrapper for osascript execution
 * - All logic in OmniJS via evaluateJavascript()
 *
 * Features:
 * - Find projects overdue for review
 * - Find projects due for review within specified days
 * - Filter by project status and folder
 * - Include review status and time calculations
 * - Essential for GTD weekly reviews
 */

import {
  PROJECT_STATUS_STRING_SNIPPET,
  TASK_COUNTS_BY_PROJECT_PASS_SNIPPET,
  TASK_COUNTS_ZERO_LITERAL,
} from '../../../contracts/ast/types.js';

export interface ProjectsForReviewFilter {
  overdue?: boolean;
  daysAhead?: number;
  status?: string[];
  folder?: string;
  limit?: number;
  /**
   * OMN-340 (D1/slice 2): the caller's "now", as an ISO string, so the
   * tool's own per-row reviewStatus classification (OmniFocusAnalyzeTool)
   * and this script's full-population review_summary counts agree on the
   * same instant. Defaults to the script's own `new Date()` when omitted
   * (existing vm-executed tests that build the filter without it keep
   * working unchanged).
   */
  now?: string;
}

export interface ProjectsForReviewParams {
  filter: ProjectsForReviewFilter;
}

export function buildProjectsForReviewScript(params: ProjectsForReviewParams): string {
  const serializedFilter = JSON.stringify(params.filter || {});

  return `
    (() => {
      const app = Application('OmniFocus');

      try {
        const omniJsScript = \`
          (() => {
            const filter = ${serializedFilter};
            const projects = [];
            // OMN-340: use the caller-supplied instant when given, so the
            // tool's per-row classification and this script's review_summary
            // counts (below) agree on exactly the same "now" — never two
            // independent Date() reads racing the wall clock milliseconds
            // apart.
            const now = filter.now ? new Date(filter.now) : new Date();

            // Default values
            const daysAhead = filter.daysAhead || 7;
            const statusFilter = filter.status || ['active'];
            const limit = filter.limit || 100;

            // Helper function to calculate days between dates
            function daysBetween(date1, date2) {
              const msPerDay = 24 * 60 * 60 * 1000;
              return Math.ceil((date2.getTime() - date1.getTime()) / msPerDay);
            }

            // OMN-272: single-definition status map (replaced a drifted
            // inline copy that emitted a hyphenated OnHold variant and an
            // 'unknown' fallback) — see PROJECT_STATUS_STRING_SNIPPET
            // (contracts/ast/types). statusFilter uses the same vocabulary.
            ${PROJECT_STATUS_STRING_SNIPPET}

            // Helper to get folder name
            function getFolderName(project) {
              const folder = project.parentFolder;
              return folder ? folder.name : null;
            }

            // Helper to determine if project matches review criteria
            function shouldInclude(project) {
              const nextReviewDate = project.nextReviewDate;

              // If no review date set, only include if we're looking for projects without schedules
              if (!nextReviewDate) {
                return !filter.overdue;
              }

              const daysUntilReview = daysBetween(now, nextReviewDate);

              if (filter.overdue) {
                // Only include overdue projects (negative days until review)
                return daysUntilReview < 0;
              } else {
                // Include projects due within daysAhead (including overdue)
                return daysUntilReview <= daysAhead;
              }
            }

            // OMN-270: the root-task count properties are undefined in
            // OmniJS (live-probed 2026-07-16; JXA/AppleScript-only), so
            // taskCounts serialized as {} for every project. Do NOT
            // "simplify" back to them. All three counts come from the shared
            // whole-DB pass below (one scope: every non-root descendant) —
            // semantics and measured cost documented at
            // TASK_COUNTS_BY_PROJECT_PASS_SNIPPET (contracts/ast/types).
            // Deliberately unconditional (/code-review round 3, declined
            // with data): taskCounts is part of this operation's advertised
            // response shape on EVERY row — the MCP surface has no way to
            // request list_for_review without it — and the pass measured
            // ~0.6s on a 2.9k-task DB, on a weekly-review flow that is not
            // latency-sensitive. A skip flag would be a new public param
            // (full contract-matrix walk) to save cost no caller can ask for.
            ${TASK_COUNTS_BY_PROJECT_PASS_SNIPPET}

            // Process all projects. OMN-340 (D1/slice 2): admit EVERY project
            // matching the review filter here — no cap during the walk. The
            // detail must hold the N nearest-due (sort-before-slice, same
            // principle as overdue's slice 1), not the first N encountered in
            // flattenedProjects' DB order, and review_summary (below) must
            // count the WHOLE matched population, not a capped sample.
            //
            // /code-review (PR #307) — efficiency finding: don't build the
            // full project row (note, folder lookup, taskCounts,
            // reviewInterval, …) for every match before the cap. The
            // admission loop below pushes only a SLIM record — the project
            // reference plus nextReviewDate, the only field review_summary's
            // classification needs. buildProjectRow() (below, after the
            // sort+slice) builds the full row, and runs ONLY for the rows
            // the response actually returns.
            flattenedProjects.forEach(project => {
              // Apply status filter
              const projectStatus = projectStatusString(project.status);
              if (!statusFilter.includes(projectStatus)) return;

              // Apply folder filter
              if (filter.folder) {
                const folderName = getFolderName(project);
                if (folderName !== filter.folder) return;
              }

              // Check if project meets review criteria
              if (!shouldInclude(project)) return;

              projects.push({
                project: project,
                nextReviewDate: project.nextReviewDate || null
              });
            });

            // OMN-340: review_summary counts the WHOLE matched population
            // (projects, before the slice below) — the exact same
            // classification OmniFocusAnalyzeTool.reviewsListForReview uses
            // per returned row (overdue/due_today/due_soon/no_schedule,
            // against the same now and daysAhead), mirrored here so the
            // summary and the per-row status always agree. "scheduled" (due
            // beyond daysAhead) isn't a review_summary bucket - matches the
            // tool's existing fields.
            const totalFound = projects.length;
            const reviewSummary = {
              total_projects: totalFound,
              overdue: 0,
              due_today: 0,
              due_soon: 0,
              no_schedule: 0
            };
            projects.forEach(p => {
              if (!p.nextReviewDate) {
                reviewSummary.no_schedule++;
                return;
              }
              const daysUntilReview = daysBetween(now, p.nextReviewDate);
              if (daysUntilReview < 0) {
                reviewSummary.overdue++;
              } else if (daysUntilReview === 0) {
                reviewSummary.due_today++;
              } else if (daysUntilReview <= daysAhead) {
                reviewSummary.due_soon++;
              }
            });

            // Sort by next review date (overdue first, then by date) BEFORE
            // slicing to the cap (D1a) — the detail must hold the N
            // nearest-due, not the first N encountered in flattenedProjects'
            // DB order.
            projects.sort((a, b) => {
              const aDate = a.nextReviewDate ? new Date(a.nextReviewDate) : new Date('2099-12-31');
              const bDate = b.nextReviewDate ? new Date(b.nextReviewDate) : new Date('2099-12-31');
              return aDate.getTime() - bDate.getTime();
            });
            const cappedProjects = projects.slice(0, limit);

            // /code-review (PR #307) — build the full project row, exactly
            // the same field-building code as before this change, ONLY for
            // the slim records that survived the sort+cap above.
            function buildProjectRow(project) {
              const projectStatus = projectStatusString(project.status);

              // Build project object with review information
              const projectObj = {
                id: project.id.primaryKey,
                name: project.name,
                status: projectStatus,
                flagged: project.flagged
              };

              // Add optional properties
              if (project.note) projectObj.note = project.note;

              const folderName = getFolderName(project);
              if (folderName) projectObj.folder = folderName;

              if (project.dueDate) {
                projectObj.dueDate = project.dueDate.toISOString();
              }

              if (project.deferDate) {
                projectObj.deferDate = project.deferDate.toISOString();
              }

              // Review-specific information
              if (project.lastReviewDate) {
                projectObj.lastReviewDate = project.lastReviewDate.toISOString();
              }

              if (project.nextReviewDate) {
                projectObj.nextReviewDate = project.nextReviewDate.toISOString();
              }

              // Review interval information
              const reviewInterval = project.reviewInterval;
              if (reviewInterval) {
                projectObj.reviewInterval = {
                  unit: reviewInterval.unit || 'week',
                  steps: reviewInterval.steps || 1
                };
              }

              // Task counts for review context (OMN-270: see the formula
              // comment above the taskCountsByProject pass)
              projectObj.taskCounts = taskCountsByProject[project.id.primaryKey] || ${TASK_COUNTS_ZERO_LITERAL};

              // Sequential vs parallel for review
              projectObj.sequential = project.sequential;
              projectObj.completedByChildren = project.completedByChildren;

              return projectObj;
            }

            for (let i = 0; i < cappedProjects.length; i++) {
              cappedProjects[i] = buildProjectRow(cappedProjects[i].project);
            }

            // /code-review (PR #307) — contract-leak finding: 'filter' is the
            // tool's internal payload to this script (includes 'now', added
            // so the tool's per-row classification and this script's
            // review_summary agree on the same instant — see
            // ProjectsForReviewFilter.now). Clients never sent 'now' and
            // must never see it echoed back. filter_applied is a shallow
            // copy of filter with 'now' omitted; every other pre-existing
            // key (operation, daysAhead, …) is unaffected.
            const filterApplied = {};
            Object.keys(filter).forEach(key => {
              if (key !== 'now') filterApplied[key] = filter[key];
            });

            return JSON.stringify({
              success: true,
              projects: cappedProjects,
              metadata: {
                // OMN-340: the TRUE pre-cap count — never cappedProjects.length.
                total_found: totalFound,
                filter_applied: filterApplied,
                generated_at: now.toISOString(),
                search_criteria: {
                  overdue_only: filter.overdue || false,
                  days_ahead: daysAhead,
                  status_filter: statusFilter,
                  folder_filter: filter.folder || null
                },
                capped: totalFound > limit,
                cap: limit,
                review_summary: reviewSummary
              }
            });
          })()
        \`;

        const result = app.evaluateJavascript(omniJsScript);
        return result;

      } catch (error) {
        return JSON.stringify({
          success: false,
          error: error.message || String(error),
          context: 'projects_for_review'
        });
      }
    })()
  `;
}
