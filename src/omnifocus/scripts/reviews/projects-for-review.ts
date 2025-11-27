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

export interface ProjectsForReviewFilter {
  overdue?: boolean;
  daysAhead?: number;
  status?: string[];
  folder?: string;
  limit?: number;
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
            const now = new Date();

            // Default values
            const daysAhead = filter.daysAhead || 7;
            const statusFilter = filter.status || ['active'];
            const limit = filter.limit || 100;

            // Helper function to calculate days between dates
            function daysBetween(date1, date2) {
              const msPerDay = 24 * 60 * 60 * 1000;
              return Math.ceil((date2.getTime() - date1.getTime()) / msPerDay);
            }

            // Helper to get project status string
            function getProjectStatus(project) {
              if (project.status === Project.Status.Active) return 'active';
              if (project.status === Project.Status.OnHold) return 'on-hold';
              if (project.status === Project.Status.Done) return 'done';
              if (project.status === Project.Status.Dropped) return 'dropped';
              return 'unknown';
            }

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

            // Process all projects
            flattenedProjects.forEach(project => {
              if (projects.length >= limit) return;

              // Apply status filter
              const projectStatus = getProjectStatus(project);
              if (!statusFilter.includes(projectStatus)) return;

              // Apply folder filter
              if (filter.folder) {
                const folderName = getFolderName(project);
                if (folderName !== filter.folder) return;
              }

              // Check if project meets review criteria
              if (!shouldInclude(project)) return;

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

              // Task counts for review context
              const rootTask = project.task;
              if (rootTask) {
                projectObj.taskCounts = {
                  total: rootTask.numberOfTasks,
                  available: rootTask.numberOfAvailableTasks,
                  completed: rootTask.numberOfCompletedTasks
                };
              }

              // Sequential vs parallel for review
              projectObj.sequential = project.sequential;
              projectObj.completedByChildren = project.completedByChildren;

              projects.push(projectObj);
            });

            // Sort by next review date (overdue first, then by date)
            projects.sort((a, b) => {
              const aDate = a.nextReviewDate ? new Date(a.nextReviewDate) : new Date('2099-12-31');
              const bDate = b.nextReviewDate ? new Date(b.nextReviewDate) : new Date('2099-12-31');
              return aDate.getTime() - bDate.getTime();
            });

            return JSON.stringify({
              success: true,
              projects: projects,
              metadata: {
                total_found: projects.length,
                filter_applied: filter,
                generated_at: now.toISOString(),
                search_criteria: {
                  overdue_only: filter.overdue || false,
                  days_ahead: daysAhead,
                  status_filter: statusFilter,
                  folder_filter: filter.folder || null
                }
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

// Legacy export for backwards compatibility (template-based)
export const PROJECTS_FOR_REVIEW_SCRIPT = `
  (() => {
    const app = Application('OmniFocus');

    try {
      const omniJsScript = \`
        (() => {
          const filter = {{filter}};
          const projects = [];
          const now = new Date();

          const daysAhead = filter.daysAhead || 7;
          const statusFilter = filter.status || ['active'];
          const limit = filter.limit || 100;

          function daysBetween(date1, date2) {
            const msPerDay = 24 * 60 * 60 * 1000;
            return Math.ceil((date2.getTime() - date1.getTime()) / msPerDay);
          }

          function getProjectStatus(project) {
            if (project.status === Project.Status.Active) return 'active';
            if (project.status === Project.Status.OnHold) return 'on-hold';
            if (project.status === Project.Status.Done) return 'done';
            if (project.status === Project.Status.Dropped) return 'dropped';
            return 'unknown';
          }

          function getFolderName(project) {
            const folder = project.parentFolder;
            return folder ? folder.name : null;
          }

          function shouldInclude(project) {
            const nextReviewDate = project.nextReviewDate;
            if (!nextReviewDate) return !filter.overdue;
            const daysUntilReview = daysBetween(now, nextReviewDate);
            if (filter.overdue) return daysUntilReview < 0;
            return daysUntilReview <= daysAhead;
          }

          flattenedProjects.forEach(project => {
            if (projects.length >= limit) return;

            const projectStatus = getProjectStatus(project);
            if (!statusFilter.includes(projectStatus)) return;

            if (filter.folder) {
              const folderName = getFolderName(project);
              if (folderName !== filter.folder) return;
            }

            if (!shouldInclude(project)) return;

            const projectObj = {
              id: project.id.primaryKey,
              name: project.name,
              status: projectStatus,
              flagged: project.flagged
            };

            if (project.note) projectObj.note = project.note;
            const folderName = getFolderName(project);
            if (folderName) projectObj.folder = folderName;
            if (project.dueDate) projectObj.dueDate = project.dueDate.toISOString();
            if (project.deferDate) projectObj.deferDate = project.deferDate.toISOString();
            if (project.lastReviewDate) projectObj.lastReviewDate = project.lastReviewDate.toISOString();
            if (project.nextReviewDate) projectObj.nextReviewDate = project.nextReviewDate.toISOString();

            const reviewInterval = project.reviewInterval;
            if (reviewInterval) {
              projectObj.reviewInterval = { unit: reviewInterval.unit || 'week', steps: reviewInterval.steps || 1 };
            }

            const rootTask = project.task;
            if (rootTask) {
              projectObj.taskCounts = {
                total: rootTask.numberOfTasks,
                available: rootTask.numberOfAvailableTasks,
                completed: rootTask.numberOfCompletedTasks
              };
            }

            projectObj.sequential = project.sequential;
            projectObj.completedByChildren = project.completedByChildren;

            projects.push(projectObj);
          });

          projects.sort((a, b) => {
            const aDate = a.nextReviewDate ? new Date(a.nextReviewDate) : new Date('2099-12-31');
            const bDate = b.nextReviewDate ? new Date(b.nextReviewDate) : new Date('2099-12-31');
            return aDate.getTime() - bDate.getTime();
          });

          return JSON.stringify({
            success: true,
            projects: projects,
            metadata: {
              total_found: projects.length,
              filter_applied: filter,
              generated_at: now.toISOString()
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
