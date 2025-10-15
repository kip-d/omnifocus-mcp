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
    let availableTasks: number;

    if (project.sequential) {
      // For sequential projects, only the first available task counts
      const firstAvailable = project.tasks.find(isTaskAvailable);
      availableTasks = firstAvailable ? 1 : 0;
    } else {
      // For parallel projects, all available tasks count
      availableTasks = project.tasks.filter(isTaskAvailable).length;
    }

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
