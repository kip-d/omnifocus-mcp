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
