import type { WriteInput } from '../schemas/write-schema.js';

// Type definitions for mutation data structures
interface RepetitionRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  daysOfWeek?: number[];
  endDate?: string;
}

interface CreateData {
  name: string;
  note?: string;
  project?: string | null;
  tags?: string[];
  dueDate?: string;
  deferDate?: string;
  flagged?: boolean;
  estimatedMinutes?: number;
  repetitionRule?: RepetitionRule;
  // Project-specific
  folder?: string;
  sequential?: boolean;
  status?: 'active' | 'on_hold' | 'completed' | 'dropped';
}

interface UpdateChanges {
  name?: string;
  note?: string;
  tags?: string[];
  addTags?: string[];
  removeTags?: string[];
  dueDate?: string | null;
  deferDate?: string | null;
  flagged?: boolean;
  status?: 'completed' | 'dropped';
  project?: string | null;
  estimatedMinutes?: number;
  // Allow passthrough of additional fields
  [key: string]: unknown;
}

interface BatchOperation {
  operation: 'create' | 'update';
  target: 'task' | 'project';
  data?: CreateData;
  id?: string;
  changes?: UpdateChanges;
}

// Discriminated union for compiled mutations
export type CompiledMutation =
  | {
      operation: 'create';
      target: 'task' | 'project';
      data: CreateData;
    }
  | {
      operation: 'update';
      target: 'task' | 'project';
      taskId?: string;
      projectId?: string;
      changes: UpdateChanges;
    }
  | {
      operation: 'complete';
      target: 'task' | 'project';
      taskId?: string;
      projectId?: string;
    }
  | {
      operation: 'delete';
      target: 'task' | 'project';
      taskId?: string;
      projectId?: string;
    }
  | {
      operation: 'batch';
      target: 'task' | 'project';
      operations: BatchOperation[];
    };

export class MutationCompiler {
  compile(input: WriteInput): CompiledMutation {
    const { mutation } = input;

    // Build the compiled result based on operation (discriminated union requires type-specific handling)
    switch (mutation.operation) {
      case 'create':
        return {
          operation: 'create',
          target: mutation.target,
          data: mutation.data as CreateData,
        };

      case 'update': {
        const result: Extract<CompiledMutation, { operation: 'update' }> = {
          operation: 'update',
          target: mutation.target,
          changes: mutation.changes as UpdateChanges,
        };
        // Map ID to taskId or projectId based on target
        if (mutation.target === 'task') {
          result.taskId = mutation.id;
        } else {
          result.projectId = mutation.id;
        }
        return result;
      }

      case 'complete': {
        const result: Extract<CompiledMutation, { operation: 'complete' }> = {
          operation: 'complete',
          target: mutation.target,
        };
        // Map ID to taskId or projectId based on target
        if (mutation.target === 'task') {
          result.taskId = mutation.id;
        } else {
          result.projectId = mutation.id;
        }
        return result;
      }

      case 'delete': {
        const result: Extract<CompiledMutation, { operation: 'delete' }> = {
          operation: 'delete',
          target: mutation.target,
        };
        // Map ID to taskId or projectId based on target
        if (mutation.target === 'task') {
          result.taskId = mutation.id;
        } else {
          result.projectId = mutation.id;
        }
        return result;
      }

      case 'batch':
        return {
          operation: 'batch',
          target: mutation.target,
          operations: mutation.operations as BatchOperation[],
        };

      default: {
        // Exhaustiveness check
        const _exhaustive: never = mutation;
        throw new Error(`Unknown mutation operation: ${String(_exhaustive)}`);
      }
    }
  }
}
