/** Execution strategy based on empirical JXA/OmniJS testing */
export enum ExecStrategy {
  JXA_DIRECT = 'jxa_direct', // Property reads via JXA method calls -- fast, simple
  OMNIJS_BRIDGE = 'omnijs_bridge', // Complex writes, bulk ops, parent traversal
  HYBRID = 'hybrid', // JXA for creation, bridge for complex properties
}

export type ScriptParams = Record<string, unknown>;

export interface GeneratedScript {
  source: string;
  strategy: ExecStrategy;
  description: string;
}

export interface TaskFilter {
  project?: string | null; // null = inbox
  tag?: string | string[];
  tagMode?: 'any' | 'all' | 'none';
  flagged?: boolean;
  completed?: boolean;
  available?: boolean;
  blocked?: boolean;
  search?: string;
  dueBefore?: string;
  dueAfter?: string;
  deferBefore?: string;
  deferAfter?: string;
  plannedBefore?: string;
  plannedAfter?: string;
  since?: string;
  limit?: number;
  offset?: number;
  sort?: { field: string; direction: 'asc' | 'desc' };
  fields?: string[];
  countTotal?: boolean;
}

export interface TaskCreateData {
  name: string;
  note?: string;
  flagged?: boolean;
  dueDate?: string;
  deferDate?: string;
  plannedDate?: string;
  estimatedMinutes?: number;
  project?: string;
  tags?: string[];
}

export interface TaskUpdateChanges {
  name?: string;
  note?: string;
  flagged?: boolean;
  dueDate?: string | null;
  deferDate?: string | null;
  plannedDate?: string | null;
  estimatedMinutes?: number | null;
  completed?: boolean;
  tags?: string[];
  addTags?: string[];
  removeTags?: string[];
  repetitionRule?: string | null;
}

export interface ProjectFilter {
  status?: 'active' | 'done' | 'dropped' | 'all';
  folder?: string;
  flagged?: boolean;
  limit?: number;
  fields?: string[];
}

export interface ProductivityStatsParams {
  dateRange?: { start: string; end: string };
  groupBy?: 'day' | 'week' | 'month';
}
