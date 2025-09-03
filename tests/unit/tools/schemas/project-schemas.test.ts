import { describe, it, expect } from 'vitest';
import {
  ReviewIntervalSchema,
  ListProjectsSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  CompleteProjectSchema,
  DeleteProjectSchema,
  ProjectsForReviewSchema,
  MarkProjectReviewedSchema,
  SetReviewScheduleSchema,
} from '../../../../src/tools/schemas/project-schemas.js';

describe('Project Schemas', () => {
  it('validates ReviewIntervalSchema and defaults fixed=false', () => {
    const parsed = ReviewIntervalSchema.parse({ unit: 'week', steps: 1 });
    expect(parsed.unit).toBe('week');
    expect(parsed.steps).toBe(1);
    expect(parsed.fixed).toBe(false);
  });

  it('ListProjectsSchema supplies sensible defaults and coercions', () => {
    const parsed = ListProjectsSchema.parse({ includeStats: 'false', includeTaskCounts: 'true' } as any);
    expect(parsed.includeStats).toBe(false);
    expect(parsed.includeTaskCounts).toBe(true);
    expect(parsed.sortBy).toBe('name');
    expect(parsed.sortOrder).toBe('asc');
    expect(parsed.limit).toBe(20);
    expect(parsed.performanceMode).toBe('lite');
  });

  it('CreateProjectSchema handles dates, booleans, and review config', () => {
    const parsed = CreateProjectSchema.parse({
      name: 'Quarterly Goals',
      flagged: 'true',
      dueDate: '2025-01-15',
      deferDate: '2025-01-10 09:00',
      sequential: 'false',
      nextReviewDate: '2025-02-01',
      reviewInterval: { unit: 'week', steps: 1 },
    } as any);

    expect(parsed.name).toBe('Quarterly Goals');
    expect(parsed.flagged).toBe(true);
    expect(parsed.dueDate).toBe('2025-01-15');
    expect(parsed.deferDate).toBe('2025-01-10 09:00');
    expect(parsed.sequential).toBe(false);
    expect(parsed.reviewInterval?.unit).toBe('week');
  });

  it('UpdateProjectSchema enforces at least one update field and accepts null to clear', () => {
    expect(() => UpdateProjectSchema.parse({ projectId: 'p1', updates: {} } as any)).toThrow();

    const ok = UpdateProjectSchema.parse({
      projectId: 'p1',
      updates: {
        name: 'Renamed',
        dueDate: null,
        nextReviewDate: '2025-02-01',
        reviewInterval: { unit: 'month', steps: 1, fixed: true },
        clearRepeatRule: 'true' as any,
      },
    });
    expect(ok.updates.name).toBe('Renamed');
    expect(ok.updates.dueDate).toBeNull();
    expect(ok.updates.clearRepeatRule).toBe(true);
  });

  it('CompleteProjectSchema and DeleteProjectSchema apply defaults and coercions', () => {
    const complete = CompleteProjectSchema.parse({ projectId: 'p1', completeAllTasks: 'true' } as any);
    expect(complete.completeAllTasks).toBe(true);

    const del = DeleteProjectSchema.parse({ projectId: 'p1' });
    expect(del.deleteTasks).toBe(false);
  });

  it('ProjectsForReviewSchema validates constraints and defaults', () => {
    const parsed = ProjectsForReviewSchema.parse({ overdue: 'true', daysAhead: '14' } as any);
    expect(parsed.overdue).toBe(true);
    expect(parsed.daysAhead).toBe(14);

    // boundary
    expect(() => ProjectsForReviewSchema.parse({ daysAhead: 9999 } as any)).toThrow();
  });

  it('MarkProjectReviewedSchema defaults updateNextReviewDate=true', () => {
    const parsed = MarkProjectReviewedSchema.parse({ projectId: 'p1' });
    expect(parsed.updateNextReviewDate).toBe(true);
  });

  it('SetReviewScheduleSchema validates non-empty ids and interval', () => {
    const parsed = SetReviewScheduleSchema.parse({
      projectIds: ['a', 'b'],
      reviewInterval: { unit: 'week', steps: 2 },
      nextReviewDate: '2025-02-01',
    });
    expect(parsed.projectIds.length).toBe(2);
    expect(parsed.reviewInterval.steps).toBe(2);
  });
});

