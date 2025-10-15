interface Project {
  id: string;
  name: string;
  status: string;
  nextReviewDate?: string | null;
  lastReviewDate?: string | null;
  reviewInterval?: number;
}

interface ReviewGapsResult {
  projectsNeverReviewed: Array<{
    id: string;
    name: string;
    status: string;
  }>;
  projectsOverdueForReview: Array<{
    id: string;
    name: string;
    daysPastDue: number;
    nextReviewDate: string;
  }>;
  averageReviewInterval: number;
  recommendations: string[];
}

export function analyzeReviewGaps(projects: Project[]): ReviewGapsResult {
  const now = new Date();
  const activeProjects = projects.filter(
    p => p.status === 'active' || p.status === 'on-hold'
  );

  // Projects never reviewed (no nextReviewDate or lastReviewDate)
  const neverReviewed = activeProjects
    .filter(p => !p.nextReviewDate && !p.lastReviewDate)
    .map(p => ({
      id: p.id,
      name: p.name,
      status: p.status
    }));

  // Projects overdue for review (nextReviewDate in past)
  const overdueProjects = activeProjects
    .filter(p => {
      if (!p.nextReviewDate) return false;
      const reviewDate = new Date(p.nextReviewDate);
      return reviewDate < now;
    })
    .map(p => {
      const reviewDate = new Date(p.nextReviewDate!);
      const daysPastDue = Math.floor((now.getTime() - reviewDate.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: p.id,
        name: p.name,
        daysPastDue,
        nextReviewDate: p.nextReviewDate!
      };
    });

  // Calculate average review interval
  const intervalsSum = activeProjects
    .filter(p => p.reviewInterval && p.reviewInterval > 0)
    .reduce((sum, p) => sum + (p.reviewInterval || 0), 0);
  const intervalCount = activeProjects.filter(p => p.reviewInterval && p.reviewInterval > 0).length;
  const averageReviewInterval = intervalCount > 0 ? Math.round(intervalsSum / intervalCount) : 0;

  // Generate recommendations
  const recommendations: string[] = [];
  if (neverReviewed.length > 0) {
    recommendations.push(`${neverReviewed.length} project(s) have never been reviewed. Consider setting up review schedules.`);
  }
  if (overdueProjects.length > 0) {
    recommendations.push(`${overdueProjects.length} project(s) are overdue for review. Schedule time for GTD weekly review.`);
  }

  return {
    projectsNeverReviewed: neverReviewed,
    projectsOverdueForReview: overdueProjects,
    averageReviewInterval,
    recommendations
  };
}
