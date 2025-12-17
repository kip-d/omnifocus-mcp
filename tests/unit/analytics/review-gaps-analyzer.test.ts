import { describe, it, expect } from 'vitest';
import { analyzeReviewGaps } from '../../../src/omnifocus/scripts/analytics/review-gaps-analyzer.js';

describe('analyzeReviewGaps', () => {
  it('identifies projects never reviewed', () => {
    const projects = [
      {
        id: 'proj-1',
        name: 'Never Reviewed',
        status: 'active',
        nextReviewDate: null,
        lastReviewDate: null,
      },
    ];

    const result = analyzeReviewGaps(projects);

    expect(result.projectsNeverReviewed).toHaveLength(1);
    expect(result.projectsNeverReviewed[0].name).toBe('Never Reviewed');
  });

  it('identifies overdue reviews', () => {
    const pastDate = new Date('2025-10-01').toISOString();
    const projects = [
      {
        id: 'proj-2',
        name: 'Overdue Review',
        status: 'active',
        nextReviewDate: pastDate,
        reviewInterval: 7,
      },
    ];

    const result = analyzeReviewGaps(projects);

    expect(result.projectsOverdueForReview).toHaveLength(1);
    expect(result.projectsOverdueForReview[0].name).toBe('Overdue Review');
  });

  it('skips dropped and completed projects', () => {
    const projects = [
      { id: 'proj-3', name: 'Dropped', status: 'dropped', nextReviewDate: null },
      { id: 'proj-4', name: 'Done', status: 'done', nextReviewDate: null },
    ];

    const result = analyzeReviewGaps(projects);

    expect(result.projectsNeverReviewed).toHaveLength(0);
    expect(result.projectsOverdueForReview).toHaveLength(0);
  });

  it('calculates average review interval', () => {
    const projects = [
      { id: 'p1', name: 'A', status: 'active', reviewInterval: 7, nextReviewDate: null },
      { id: 'p2', name: 'B', status: 'active', reviewInterval: 14, nextReviewDate: null },
      { id: 'p3', name: 'C', status: 'active', reviewInterval: 21, nextReviewDate: null },
    ];

    const result = analyzeReviewGaps(projects);

    expect(result.averageReviewInterval).toBe(14);
  });
});
