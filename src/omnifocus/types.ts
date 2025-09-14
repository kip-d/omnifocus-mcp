/**
 * Basic type definitions for OmniFocus MCP
 */

// Basic OmniFocus entity types
export interface OmniFocusTask {
  id: string;
  name: string;
  completed: boolean;
  flagged: boolean;
  blocked: boolean;
  available?: boolean;
  estimatedMinutes?: number;
  dueDate?: string;
  deferDate?: string;
  completionDate?: string;
  note?: string;
  projectId?: string;
  project?: string;
  tags?: string[];
}

export interface OmniFocusProject {
  id: string;
  name: string;
  status: string;
  note?: string;
  folderId?: string;
  folder?: string;
}

export interface OmniFocusTag {
  id: string;
  name: string;
  tasks?: string[];
}

// Additional types that were being imported
export interface TaskFilter {
  completed?: boolean;
  flagged?: boolean;
  projectId?: string;
  tags?: string[];
}

export interface ProjectFilter {
  status?: string;
  folderId?: string;
}

export interface TaskUpdate {
  name?: string;
  note?: string;
  dueDate?: string;
  deferDate?: string;
  flagged?: boolean;
  projectId?: string;
  tags?: string[];
}

export interface ProjectUpdate {
  name?: string;
  note?: string;
  status?: string;
  folderId?: string;
}

export interface ProductivityStats {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  flaggedTasks: number;
  completionRate: number;
}

export type RecurringTaskStatus = 'active' | 'completed' | 'cancelled';

export interface RepetitionRule {
  type: string;
  interval: number;
  unit: string;
}
