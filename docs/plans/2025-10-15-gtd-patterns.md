# GTD Power User Suite Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Add 4 new pattern analyzers to help users discover hidden workflow problems: review gaps, next actions clarity, WIP limits, and due date bunching.

**Architecture:** Extend existing PatternAnalysisToolV2 with 4 new analyzer scripts. Each analyzer is a standalone TypeScript module that analyzes OmniFocus data and returns insights. Pure JXA execution (no bridge needed - read-only analysis).

**Tech Stack:** TypeScript, JXA (OmniFocus automation), Vitest (testing), Zod (validation)

---

## Task 1: Review Gaps Analyzer

**Files:**
- Create: `src/omnifocus/scripts/analytics/review-gaps-analyzer.ts`
- Test: `tests/unit/analytics/review-gaps-analyzer.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/analytics/review-gaps-analyzer.test.ts`:

```typescript
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
        lastReviewDate: null
      }
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
        reviewInterval: 7
      }
    ];

    const result = analyzeReviewGaps(projects);

    expect(result.projectsOverdueForReview).toHaveLength(1);
    expect(result.projectsOverdueForReview[0].name).toBe('Overdue Review');
  });

  it('skips dropped and completed projects', () => {
    const projects = [
      { id: 'proj-3', name: 'Dropped', status: 'dropped', nextReviewDate: null },
      { id: 'proj-4', name: 'Done', status: 'done', nextReviewDate: null }
    ];

    const result = analyzeReviewGaps(projects);

    expect(result.projectsNeverReviewed).toHaveLength(0);
    expect(result.projectsOverdueForReview).toHaveLength(0);
  });

  it('calculates average review interval', () => {
    const projects = [
      { id: 'p1', name: 'A', status: 'active', reviewInterval: 7, nextReviewDate: null },
      { id: 'p2', name: 'B', status: 'active', reviewInterval: 14, nextReviewDate: null },
      { id: 'p3', name: 'C', status: 'active', reviewInterval: 21, nextReviewDate: null }
    ];

    const result = analyzeReviewGaps(projects);

    expect(result.averageReviewInterval).toBe(14);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm run build
npx vitest tests/unit/analytics/review-gaps-analyzer.test.ts --run
```

Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `src/omnifocus/scripts/analytics/review-gaps-analyzer.ts`:

```typescript
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
```

**Step 4: Run test to verify it passes**

```bash
npm run build
npx vitest tests/unit/analytics/review-gaps-analyzer.test.ts --run
```

Expected: PASS (4 tests passing)

**Step 5: Commit**

```bash
git add tests/unit/analytics/review-gaps-analyzer.test.ts src/omnifocus/scripts/analytics/review-gaps-analyzer.ts
git commit -m "feat: add review gaps analyzer with tests"
```

---

## Task 2: Next Actions Clarity Analyzer

**Files:**
- Create: `src/omnifocus/scripts/analytics/next-actions-analyzer.ts`
- Test: `tests/unit/analytics/next-actions-analyzer.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/analytics/next-actions-analyzer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { analyzeNextActions } from '../../../src/omnifocus/scripts/analytics/next-actions-analyzer.js';

describe('analyzeNextActions', () => {
  it('scores clear action tasks highly', () => {
    const tasks = [
      { id: 't1', name: 'Call John about meeting', completed: false },
      { id: 't2', name: 'Write proposal draft', completed: false },
      { id: 't3', name: 'Review PR #123', completed: false }
    ];

    const result = analyzeNextActions(tasks);

    expect(result.clearTasks).toBe(3);
    expect(result.vagueTasks).toBe(0);
    expect(result.averageActionabilityScore).toBeGreaterThan(80);
  });

  it('identifies vague task names', () => {
    const tasks = [
      { id: 't1', name: 'Mom', completed: false },
      { id: 't2', name: 'Project ideas', completed: false },
      { id: 't3', name: 'Stuff', completed: false }
    ];

    const result = analyzeNextActions(tasks);

    expect(result.vagueTasks).toBe(3);
    expect(result.clearTasks).toBe(0);
    expect(result.examples).toHaveLength(3);
    expect(result.examples[0].score).toBeLessThan(50);
  });

  it('skips completed tasks', () => {
    const tasks = [
      { id: 't1', name: 'Vague', completed: true },
      { id: 't2', name: 'Call Sarah', completed: false }
    ];

    const result = analyzeNextActions(tasks);

    expect(result.clearTasks + result.vagueTasks).toBe(1);
  });

  it('provides suggestions for vague tasks', () => {
    const tasks = [
      { id: 't1', name: 'Mom', completed: false }
    ];

    const result = analyzeNextActions(tasks);

    expect(result.examples[0].suggestion).toContain('Call');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm run build
npx vitest tests/unit/analytics/next-actions-analyzer.test.ts --run
```

Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `src/omnifocus/scripts/analytics/next-actions-analyzer.ts`:

```typescript
interface Task {
  id: string;
  name: string;
  completed: boolean;
}

interface NextActionsResult {
  clearTasks: number;
  vagueTasks: number;
  averageActionabilityScore: number;
  examples: Array<{
    task: string;
    score: number;
    suggestion: string;
  }>;
  recommendations: string[];
}

const ACTION_VERBS = [
  'call', 'email', 'write', 'review', 'send', 'update', 'create',
  'fix', 'test', 'deploy', 'schedule', 'research', 'draft', 'finalize',
  'submit', 'prepare', 'organize', 'order', 'buy', 'read', 'watch',
  'listen', 'practice', 'clean', 'file', 'backup', 'install', 'configure'
];

const VAGUE_KEYWORDS = [
  'stuff', 'things', 'maybe', 'ideas', 'misc', 'miscellaneous',
  'various', 'etc', 'tbd', 'todo'
];

function scoreTaskName(name: string): number {
  let score = 50; // Base score
  const lowerName = name.toLowerCase();
  const words = lowerName.split(/\s+/);

  // Bonus: Starts with action verb
  if (ACTION_VERBS.some(verb => lowerName.startsWith(verb))) {
    score += 30;
  }

  // Penalty: Contains vague keywords
  if (VAGUE_KEYWORDS.some(keyword => lowerName.includes(keyword))) {
    score -= 30;
  }

  // Penalty: Too short (single word, no verb)
  if (words.length === 1 && !ACTION_VERBS.includes(words[0])) {
    score -= 20;
  }

  // Bonus: Has sufficient detail (3+ words)
  if (words.length >= 3) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

function generateSuggestion(taskName: string): string {
  const lowerName = taskName.toLowerCase();

  // Single word tasks - suggest adding action verb
  if (!taskName.includes(' ')) {
    return `Call ${taskName} about...`;
  }

  // Contains vague keywords
  if (VAGUE_KEYWORDS.some(keyword => lowerName.includes(keyword))) {
    return 'Replace with specific action (e.g., "Write down...", "Review...")';
  }

  // Missing action verb
  if (!ACTION_VERBS.some(verb => lowerName.startsWith(verb))) {
    return `Add action verb at start (e.g., "Review ${taskName}")`;
  }

  return 'Task name could be more specific';
}

export function analyzeNextActions(tasks: Task[]): NextActionsResult {
  const incompleteTasks = tasks.filter(t => !t.completed);

  const scoredTasks = incompleteTasks.map(task => ({
    task: task.name,
    score: scoreTaskName(task.name),
    suggestion: ''
  }));

  // Add suggestions for low-scoring tasks
  scoredTasks.forEach(item => {
    if (item.score < 70) {
      item.suggestion = generateSuggestion(item.task);
    }
  });

  const clearTasks = scoredTasks.filter(t => t.score >= 70).length;
  const vagueTasks = scoredTasks.filter(t => t.score < 70).length;

  const totalScore = scoredTasks.reduce((sum, t) => sum + t.score, 0);
  const averageScore = scoredTasks.length > 0
    ? Math.round(totalScore / scoredTasks.length)
    : 0;

  // Get worst examples for reporting
  const worstExamples = scoredTasks
    .filter(t => t.score < 70)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  const recommendations: string[] = [];
  if (vagueTasks > 0) {
    const percentage = Math.round((vagueTasks / incompleteTasks.length) * 100);
    recommendations.push(
      `${vagueTasks} task(s) (${percentage}%) have unclear action items. Review examples for improvement suggestions.`
    );
  }

  return {
    clearTasks,
    vagueTasks,
    averageActionabilityScore: averageScore,
    examples: worstExamples,
    recommendations
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npm run build
npx vitest tests/unit/analytics/next-actions-analyzer.test.ts --run
```

Expected: PASS (4 tests passing)

**Step 5: Commit**

```bash
git add tests/unit/analytics/next-actions-analyzer.test.ts src/omnifocus/scripts/analytics/next-actions-analyzer.ts
git commit -m "feat: add next actions clarity analyzer with tests"
```

---

## Task 3: WIP Limits Analyzer

**Files:**
- Create: `src/omnifocus/scripts/analytics/wip-limits-analyzer.ts`
- Test: `tests/unit/analytics/wip-limits-analyzer.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/analytics/wip-limits-analyzer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { analyzeWipLimits } from '../../../src/omnifocus/scripts/analytics/wip-limits-analyzer.js';

describe('analyzeWipLimits', () => {
  it('identifies projects over WIP limit', () => {
    const projects = [
      {
        id: 'p1',
        name: 'Overloaded Project',
        status: 'active',
        tasks: [
          { id: 't1', completed: false, blocked: false, deferDate: null },
          { id: 't2', completed: false, blocked: false, deferDate: null },
          { id: 't3', completed: false, blocked: false, deferDate: null },
          { id: 't4', completed: false, blocked: false, deferDate: null },
          { id: 't5', completed: false, blocked: false, deferDate: null },
          { id: 't6', completed: false, blocked: false, deferDate: null } // 6 available
        ]
      }
    ];

    const result = analyzeWipLimits(projects, { wipLimit: 5 });

    expect(result.projectsOverWipLimit).toHaveLength(1);
    expect(result.projectsOverWipLimit[0].availableTasks).toBe(6);
    expect(result.projectsOverWipLimit[0].limit).toBe(5);
  });

  it('excludes blocked and deferred tasks from available count', () => {
    const futureDate = new Date('2025-12-01').toISOString();
    const projects = [
      {
        id: 'p1',
        name: 'Project',
        status: 'active',
        tasks: [
          { id: 't1', completed: false, blocked: false, deferDate: null }, // available
          { id: 't2', completed: false, blocked: true, deferDate: null },  // blocked
          { id: 't3', completed: false, blocked: false, deferDate: futureDate }, // deferred
          { id: 't4', completed: true, blocked: false, deferDate: null }   // completed
        ]
      }
    ];

    const result = analyzeWipLimits(projects, { wipLimit: 5 });

    expect(result.healthyProjects).toBe(1);
    expect(result.overloadedProjects).toBe(0);
  });

  it('skips dropped and completed projects', () => {
    const projects = [
      { id: 'p1', name: 'Dropped', status: 'dropped', tasks: [] },
      { id: 'p2', name: 'Done', status: 'done', tasks: [] }
    ];

    const result = analyzeWipLimits(projects, { wipLimit: 5 });

    expect(result.healthyProjects).toBe(0);
    expect(result.overloadedProjects).toBe(0);
  });

  it('handles sequential projects differently', () => {
    const projects = [
      {
        id: 'p1',
        name: 'Sequential Project',
        status: 'active',
        sequential: true,
        tasks: [
          { id: 't1', completed: false, blocked: false, deferDate: null },
          { id: 't2', completed: false, blocked: true, deferDate: null } // Only first is available
        ]
      }
    ];

    const result = analyzeWipLimits(projects, { wipLimit: 5 });

    expect(result.healthyProjects).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm run build
npx vitest tests/unit/analytics/wip-limits-analyzer.test.ts --run
```

Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `src/omnifocus/scripts/analytics/wip-limits-analyzer.ts`:

```typescript
interface Task {
  id: string;
  completed: boolean;
  blocked: boolean;
  deferDate: string | null;
}

interface Project {
  id: string;
  name: string;
  status: string;
  sequential?: boolean;
  tasks: Task[];
}

interface WipLimitsOptions {
  wipLimit: number;
}

interface WipLimitsResult {
  projectsOverWipLimit: Array<{
    project: string;
    availableTasks: number;
    limit: number;
    sequential: boolean;
    recommendation: string;
  }>;
  healthyProjects: number;
  overloadedProjects: number;
  recommendations: string[];
}

function isTaskAvailable(task: Task): boolean {
  if (task.completed) return false;
  if (task.blocked) return false;
  if (task.deferDate) {
    const deferDate = new Date(task.deferDate);
    const now = new Date();
    if (deferDate > now) return false;
  }
  return true;
}

export function analyzeWipLimits(
  projects: Project[],
  options: WipLimitsOptions
): WipLimitsResult {
  const { wipLimit } = options;
  const activeProjects = projects.filter(
    p => p.status === 'active' || p.status === 'on-hold'
  );

  const analyzed = activeProjects.map(project => {
    const availableTasks = project.tasks.filter(isTaskAvailable).length;
    return {
      project: project.name,
      availableTasks,
      limit: wipLimit,
      sequential: project.sequential || false,
      overLimit: availableTasks > wipLimit
    };
  });

  const overLimit = analyzed.filter(p => p.overLimit);
  const healthy = analyzed.filter(p => !p.overLimit);

  const projectsOverWipLimit = overLimit.map(p => ({
    project: p.project,
    availableTasks: p.availableTasks,
    limit: p.limit,
    sequential: p.sequential,
    recommendation: p.sequential
      ? `Sequential project with ${p.availableTasks} available tasks. Consider if all should be unblocked.`
      : `${p.availableTasks} available tasks exceeds WIP limit of ${p.limit}. Consider deferring some tasks or making project sequential.`
  }));

  const recommendations: string[] = [];
  if (overLimit.length > 0) {
    recommendations.push(
      `${overLimit.length} project(s) exceed WIP limit of ${wipLimit}. Too many parallel tasks can reduce focus.`
    );
  }

  return {
    projectsOverWipLimit,
    healthyProjects: healthy.length,
    overloadedProjects: overLimit.length,
    recommendations
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npm run build
npx vitest tests/unit/analytics/wip-limits-analyzer.test.ts --run
```

Expected: PASS (4 tests passing)

**Step 5: Commit**

```bash
git add tests/unit/analytics/wip-limits-analyzer.test.ts src/omnifocus/scripts/analytics/wip-limits-analyzer.ts
git commit -m "feat: add WIP limits analyzer with tests"
```

---

## Task 4: Due Date Bunching Analyzer

**Files:**
- Create: `src/omnifocus/scripts/analytics/due-date-bunching-analyzer.ts`
- Test: `tests/unit/analytics/due-date-bunching-analyzer.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/analytics/due-date-bunching-analyzer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { analyzeDueDateBunching } from '../../../src/omnifocus/scripts/analytics/due-date-bunching-analyzer.js';

describe('analyzeDueDateBunching', () => {
  it('identifies days with excessive tasks', () => {
    const tasks = [
      { id: 't1', dueDate: '2025-10-20', completed: false, project: 'Work' },
      { id: 't2', dueDate: '2025-10-20', completed: false, project: 'Work' },
      { id: 't3', dueDate: '2025-10-20', completed: false, project: 'Work' },
      { id: 't4', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't5', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't6', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't7', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't8', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't9', dueDate: '2025-10-20', completed: false, project: 'Home' }
    ];

    const result = analyzeDueDateBunching(tasks, { threshold: 8 });

    expect(result.bunchedDates).toHaveLength(1);
    expect(result.bunchedDates[0].taskCount).toBe(9);
    expect(result.bunchedDates[0].date).toBe('2025-10-20');
  });

  it('skips completed tasks', () => {
    const tasks = [
      { id: 't1', dueDate: '2025-10-20', completed: true, project: 'Work' },
      { id: 't2', dueDate: '2025-10-20', completed: false, project: 'Work' }
    ];

    const result = analyzeDueDateBunching(tasks, { threshold: 5 });

    expect(result.bunchedDates).toHaveLength(0);
  });

  it('groups by project for bunched dates', () => {
    const tasks = [
      { id: 't1', dueDate: '2025-10-20', completed: false, project: 'Work' },
      { id: 't2', dueDate: '2025-10-20', completed: false, project: 'Work' },
      { id: 't3', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't4', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't5', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't6', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't7', dueDate: '2025-10-20', completed: false, project: 'Home' },
      { id: 't8', dueDate: '2025-10-20', completed: false, project: 'Home' }
    ];

    const result = analyzeDueDateBunching(tasks, { threshold: 5 });

    expect(result.bunchedDates[0].projects).toContain('Work');
    expect(result.bunchedDates[0].projects).toContain('Home');
  });

  it('calculates average tasks per day', () => {
    const tasks = [
      { id: 't1', dueDate: '2025-10-20', completed: false, project: 'Work' },
      { id: 't2', dueDate: '2025-10-20', completed: false, project: 'Work' },
      { id: 't3', dueDate: '2025-10-21', completed: false, project: 'Work' },
      { id: 't4', dueDate: '2025-10-21', completed: false, project: 'Work' }
    ];

    const result = analyzeDueDateBunching(tasks, { threshold: 10 });

    expect(result.averageTasksPerDay).toBe(2);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm run build
npx vitest tests/unit/analytics/due-date-bunching-analyzer.test.ts --run
```

Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `src/omnifocus/scripts/analytics/due-date-bunching-analyzer.ts`:

```typescript
interface Task {
  id: string;
  dueDate: string | null;
  completed: boolean;
  project: string;
}

interface DueDateBunchingOptions {
  threshold: number;
}

interface DueDateBunchingResult {
  bunchedDates: Array<{
    date: string;
    taskCount: number;
    projects: string[];
  }>;
  averageTasksPerDay: number;
  peakDay: {
    date: string;
    count: number;
  } | null;
  recommendations: string[];
}

export function analyzeDueDateBunching(
  tasks: Task[],
  options: DueDateBunchingOptions
): DueDateBunchingResult {
  const { threshold } = options;

  // Filter to incomplete tasks with due dates
  const incompleteTasks = tasks.filter(t => !t.completed && t.dueDate);

  // Group by date
  const dateGroups = new Map<string, Task[]>();
  incompleteTasks.forEach(task => {
    const dateOnly = task.dueDate!.split('T')[0]; // Extract date part
    if (!dateGroups.has(dateOnly)) {
      dateGroups.set(dateOnly, []);
    }
    dateGroups.get(dateOnly)!.push(task);
  });

  // Find bunched dates (over threshold)
  const bunchedDates = Array.from(dateGroups.entries())
    .filter(([_, tasks]) => tasks.length > threshold)
    .map(([date, tasks]) => {
      const projects = Array.from(new Set(tasks.map(t => t.project)));
      return {
        date,
        taskCount: tasks.length,
        projects
      };
    })
    .sort((a, b) => b.taskCount - a.taskCount);

  // Calculate average tasks per day
  const totalTasks = incompleteTasks.length;
  const totalDays = dateGroups.size;
  const averageTasksPerDay = totalDays > 0
    ? Math.round((totalTasks / totalDays) * 10) / 10
    : 0;

  // Find peak day
  let peakDay: { date: string; count: number } | null = null;
  dateGroups.forEach((tasks, date) => {
    if (!peakDay || tasks.length > peakDay.count) {
      peakDay = { date, count: tasks.length };
    }
  });

  // Generate recommendations
  const recommendations: string[] = [];
  if (bunchedDates.length > 0) {
    const totalBunched = bunchedDates.reduce((sum, d) => sum + d.taskCount, 0);
    recommendations.push(
      `${bunchedDates.length} day(s) have excessive task loads (>${threshold} tasks). Consider redistributing ${totalBunched} tasks across more days.`
    );
  }

  return {
    bunchedDates,
    averageTasksPerDay,
    peakDay,
    recommendations
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npm run build
npx vitest tests/unit/analytics/due-date-bunching-analyzer.test.ts --run
```

Expected: PASS (4 tests passing)

**Step 5: Commit**

```bash
git add tests/unit/analytics/due-date-bunching-analyzer.test.ts src/omnifocus/scripts/analytics/due-date-bunching-analyzer.ts
git commit -m "feat: add due date bunching analyzer with tests"
```

---

## Task 5: Integrate with PatternAnalysisToolV2

**Files:**
- Modify: `src/tools/analytics/PatternAnalysisToolV2.ts`
- Test: `tests/integration/analytics/pattern-analysis-tool.test.ts`

**Step 1: Write the failing test**

Add to `tests/integration/analytics/pattern-analysis-tool.test.ts`:

```typescript
describe('PatternAnalysisToolV2 - GTD Patterns', () => {
  it('analyzes review gaps pattern', async () => {
    const tool = new PatternAnalysisToolV2(cache);
    const result = await tool.execute({
      patterns: ['review_gaps'],
      options: {}
    });

    expect(result.status).toBe('success');
    expect(result.data.patterns.review_gaps).toBeDefined();
    expect(result.data.patterns.review_gaps.projectsNeverReviewed).toBeInstanceOf(Array);
  });

  it('analyzes next actions pattern', async () => {
    const tool = new PatternAnalysisToolV2(cache);
    const result = await tool.execute({
      patterns: ['next_actions'],
      options: {}
    });

    expect(result.status).toBe('success');
    expect(result.data.patterns.next_actions).toBeDefined();
    expect(result.data.patterns.next_actions.averageActionabilityScore).toBeGreaterThanOrEqual(0);
  });

  it('analyzes wip limits pattern', async () => {
    const tool = new PatternAnalysisToolV2(cache);
    const result = await tool.execute({
      patterns: ['wip_limits'],
      options: { wipLimit: 5 }
    });

    expect(result.status).toBe('success');
    expect(result.data.patterns.wip_limits).toBeDefined();
    expect(typeof result.data.patterns.wip_limits.healthyProjects).toBe('number');
  });

  it('analyzes due date bunching pattern', async () => {
    const tool = new PatternAnalysisToolV2(cache);
    const result = await tool.execute({
      patterns: ['due_date_bunching'],
      options: { bunchingThreshold: 8 }
    });

    expect(result.status).toBe('success');
    expect(result.data.patterns.due_date_bunching).toBeDefined();
    expect(result.data.patterns.due_date_bunching.bunchedDates).toBeInstanceOf(Array);
  });

  it('analyzes all GTD patterns together', async () => {
    const tool = new PatternAnalysisToolV2(cache);
    const result = await tool.execute({
      patterns: ['review_gaps', 'next_actions', 'wip_limits', 'due_date_bunching'],
      options: { wipLimit: 5, bunchingThreshold: 8 }
    });

    expect(result.status).toBe('success');
    expect(result.data.patterns).toHaveProperty('review_gaps');
    expect(result.data.patterns).toHaveProperty('next_actions');
    expect(result.data.patterns).toHaveProperty('wip_limits');
    expect(result.data.patterns).toHaveProperty('due_date_bunching');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm run build
npm run test:integration
```

Expected: FAIL with tests unable to find new patterns

**Step 3: Modify PatternAnalysisToolV2**

Update `src/tools/analytics/PatternAnalysisToolV2.ts`:

```typescript
// Add imports at top
import { analyzeReviewGaps } from '../../omnifocus/scripts/analytics/review-gaps-analyzer.js';
import { analyzeNextActions } from '../../omnifocus/scripts/analytics/next-actions-analyzer.js';
import { analyzeWipLimits } from '../../omnifocus/scripts/analytics/wip-limits-analyzer.js';
import { analyzeDueDateBunching } from '../../omnifocus/scripts/analytics/due-date-bunching-analyzer.js';

// Update schema to include new patterns
const PatternAnalysisSchema = z.object({
  patterns: z.array(z.enum([
    'duplicates',
    'dormant_projects',
    'tag_audit',
    'deadline_health',
    'waiting_for',
    'review_gaps',        // NEW
    'next_actions',       // NEW
    'wip_limits',         // NEW
    'due_date_bunching',  // NEW
    'all'
  ])),
  options: z.object({
    minSimilarity: z.number().min(0).max(1).optional(),
    dormantDays: z.number().min(1).optional(),
    wipLimit: z.number().min(1).optional(),           // NEW
    bunchingThreshold: z.number().min(1).optional()   // NEW
  }).optional()
});

// In the execute method, add pattern handlers (find the section with existing patterns)
// Add after existing pattern handlers:

if (patterns.includes('review_gaps') || patterns.includes('all')) {
  try {
    const projects = await this.omnifocus.listProjects({
      status: 'active',
      includeDetails: true
    });
    results.review_gaps = analyzeReviewGaps(projects);
  } catch (error) {
    logger.error('Review gaps analysis failed', error);
    results.review_gaps = {
      error: true,
      message: 'Failed to analyze review gaps'
    };
  }
}

if (patterns.includes('next_actions') || patterns.includes('all')) {
  try {
    const tasks = await this.omnifocus.listTasks({
      completed: false
    });
    results.next_actions = analyzeNextActions(tasks);
  } catch (error) {
    logger.error('Next actions analysis failed', error);
    results.next_actions = {
      error: true,
      message: 'Failed to analyze next actions'
    };
  }
}

if (patterns.includes('wip_limits') || patterns.includes('all')) {
  try {
    const projects = await this.omnifocus.listProjects({
      status: 'active',
      includeDetails: true
    });
    const wipLimit = options?.wipLimit || 5;
    results.wip_limits = analyzeWipLimits(projects, { wipLimit });
  } catch (error) {
    logger.error('WIP limits analysis failed', error);
    results.wip_limits = {
      error: true,
      message: 'Failed to analyze WIP limits'
    };
  }
}

if (patterns.includes('due_date_bunching') || patterns.includes('all')) {
  try {
    const tasks = await this.omnifocus.listTasks({
      completed: false
    });
    const threshold = options?.bunchingThreshold || 8;
    results.due_date_bunching = analyzeDueDateBunching(tasks, { threshold });
  } catch (error) {
    logger.error('Due date bunching analysis failed', error);
    results.due_date_bunching = {
      error: true,
      message: 'Failed to analyze due date bunching'
    };
  }
}

// Update tool description
static description = `Analyze patterns in OmniFocus data for insights and improvements.
Supports: duplicates, dormant projects, tag audits, deadline health, waiting tasks,
review gaps, next actions clarity, WIP limits, and due date bunching analysis.`;
```

**Step 4: Run test to verify it passes**

```bash
npm run build
npm run test:integration
```

Expected: PASS (integration tests passing for new patterns)

**Step 5: Commit**

```bash
git add src/tools/analytics/PatternAnalysisToolV2.ts tests/integration/analytics/pattern-analysis-tool.test.ts
git commit -m "feat: integrate GTD patterns with PatternAnalysisToolV2"
```

---

## Task 6: Update Documentation

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/future-ideas/pattern-analysis-enhancements.md`

**Step 1: Update README**

In `README.md`, find the Pattern Analysis section and add:

```markdown
#### GTD Workflow Patterns

- `review_gaps` - Find projects overdue for weekly review or never reviewed
- `next_actions` - Analyze task names for actionability (clear action verbs vs vague descriptions)
- `wip_limits` - Identify projects with too many available tasks (configurable threshold, default: 5)
- `due_date_bunching` - Detect workload imbalances and deadline clustering (configurable threshold, default: 8 tasks/day)

**Example:**
```bash
# Analyze GTD workflow health
echo '{"patterns": ["review_gaps", "next_actions", "wip_limits", "due_date_bunching"], "options": {"wipLimit": 5, "bunchingThreshold": 8}}' | mcp call analyze_patterns
```
```

**Step 2: Update CHANGELOG**

Add to `CHANGELOG.md`:

```markdown
## [Unreleased]

### Added
- **GTD Power User Suite**: 4 new pattern analyzers for workflow health
  - `review_gaps` - Identifies projects overdue for GTD weekly review
  - `next_actions` - Analyzes task name clarity and actionability
  - `wip_limits` - Detects projects with excessive work-in-progress
  - `due_date_bunching` - Identifies workload imbalances and deadline clustering
- Configurable options for WIP limits (default: 5) and bunching threshold (default: 8)
```

**Step 3: Update future-ideas document**

Mark items as completed in `docs/future-ideas/pattern-analysis-enhancements.md`:

At the top, update the status section:

```markdown
## Status Update (October 2025)

### ✅ Completed - GTD Power User Suite
Implemented in v2.3.0:
- ✅ Review Gaps Analysis (Priority 2)
- ✅ Next Actions Clarity (Priority 3)
- ✅ WIP Limits (Priority 6)
- ✅ Due-Date Bunching (Priority 5)

### ⏸️ Deferred
Remaining from original list:
- Estimation Bias (Priority 1)
- Tag Entropy & Synonym Detection (Priority 4)
- Task Dependency Analysis (Priority 7)
- Context Switching Analysis (Priority 8)
- Hierarchical Summarization (Priority 9)
- Vector Embeddings (Priority 10)
```

**Step 4: Commit**

```bash
git add README.md CHANGELOG.md docs/future-ideas/pattern-analysis-enhancements.md
git commit -m "docs: update documentation for GTD pattern analyzers"
```

---

## Task 7: Manual Testing

**Test each pattern with real OmniFocus data**

**Step 1: Build the project**

```bash
npm run build
```

**Step 2: Test review gaps**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"analyze_patterns","arguments":{"patterns":["review_gaps"]}}}' | node dist/index.js 2>&1 | grep -A 50 '"result":'
```

Expected: JSON response with projectsNeverReviewed and projectsOverdueForReview arrays

**Step 3: Test next actions**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"analyze_patterns","arguments":{"patterns":["next_actions"]}}}' | node dist/index.js 2>&1 | grep -A 50 '"result":'
```

Expected: JSON response with clearTasks, vagueTasks, and averageActionabilityScore

**Step 4: Test WIP limits**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"analyze_patterns","arguments":{"patterns":["wip_limits"],"options":{"wipLimit":5}}}}' | node dist/index.js 2>&1 | grep -A 50 '"result":'
```

Expected: JSON response with projectsOverWipLimit, healthyProjects, overloadedProjects

**Step 5: Test due date bunching**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"analyze_patterns","arguments":{"patterns":["due_date_bunching"],"options":{"bunchingThreshold":8}}}}' | node dist/index.js 2>&1 | grep -A 50 '"result":'
```

Expected: JSON response with bunchedDates, averageTasksPerDay, peakDay

**Step 6: Test all GTD patterns together**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"analyze_patterns","arguments":{"patterns":["review_gaps","next_actions","wip_limits","due_date_bunching"],"options":{"wipLimit":5,"bunchingThreshold":8}}}}' | node dist/index.js 2>&1 | grep -A 100 '"result":'
```

Expected: JSON response with all four pattern results

**Step 7: Record findings**

Document any issues found:
- Do all patterns execute without errors?
- Do the insights make sense for your OmniFocus database?
- Are the recommendations helpful?
- Is performance acceptable (< 5 seconds)?

---

## Success Criteria

**Before considering this complete:**
- ✅ All unit tests pass (16 new tests across 4 analyzers)
- ✅ All integration tests pass (5 new tests)
- ✅ Manual testing shows reasonable results with real data
- ✅ Performance under 5 seconds for typical database
- ✅ Documentation updated (README, CHANGELOG, future-ideas)
- ✅ All commits follow conventional commit format
- ✅ Code follows existing patterns in codebase

**After implementation:**
- Run full test suite: `npm test`
- Verify all tests pass (should see 579+ passing tests)
- Test with Claude Desktop to ensure MCP integration works
- Create PR following contribution guidelines

---

## Notes

- **Helper functions:** All analyzers use TypeScript analysis logic, no JXA helpers needed
- **Error handling:** Each analyzer wrapped in try/catch within PatternAnalysisToolV2
- **Configuration:** WIP limit and bunching threshold are configurable via options parameter
- **Performance:** Pure TypeScript analysis is fast; main bottleneck is OmniFocus data fetching (already cached)
- **Future enhancements:** Estimation bias analyzer can be added later using similar pattern
