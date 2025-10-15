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
  options: DueDateBunchingOptions,
): DueDateBunchingResult {
  const { threshold } = options;

  // Filter to incomplete tasks with due dates
  const incompleteTasks = tasks.filter(t => !t.completed && t.dueDate);

  // Group by date
  const dateGroups = new Map<string, Task[]>();
  incompleteTasks.forEach(task => {
    // Extract date portion - handles both ISO (2025-10-20T14:30:00Z) and local (2025-10-20 14:30) formats
    const dateOnly = task.dueDate!.substring(0, 10); // Always get first 10 chars (YYYY-MM-DD)
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
        projects,
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
      `${bunchedDates.length} day(s) have excessive task loads (>${threshold} tasks). Consider redistributing ${totalBunched} tasks across more days.`,
    );
  }

  return {
    bunchedDates,
    averageTasksPerDay,
    peakDay,
    recommendations,
  };
}
