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
