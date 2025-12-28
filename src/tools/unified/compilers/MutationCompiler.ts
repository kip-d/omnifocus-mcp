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
  parentTaskId?: string; // Bug #17: Enable subtask creation
  tags?: string[];
  dueDate?: string;
  deferDate?: string;
  plannedDate?: string;
  flagged?: boolean;
  estimatedMinutes?: number;
  repetitionRule?: RepetitionRule;
  // Project-specific
  folder?: string;
  sequential?: boolean;
  status?: 'active' | 'on_hold' | 'completed' | 'dropped';
  // Batch-specific
  tempId?: string;
  parentTempId?: string;
  reviewInterval?: number;
}

interface UpdateChanges {
  name?: string;
  note?: string;
  tags?: string[];
  addTags?: string[];
  removeTags?: string[];
  dueDate?: string | null;
  deferDate?: string | null;
  plannedDate?: string | null;
  clearDueDate?: boolean;
  clearDeferDate?: boolean;
  clearPlannedDate?: boolean;
  flagged?: boolean;
  status?: 'completed' | 'dropped';
  project?: string | null;
  parentTaskId?: string | null; // Bug OMN-5: Update parent task relationship
  estimatedMinutes?: number;
  clearEstimatedMinutes?: boolean; // Bug #18: Clear estimated time
  clearRepeatRule?: boolean; // Bug #19: Clear repetition rule
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
      minimalResponse?: boolean; // Bug #21: Reduce response size
    }
  | {
      operation: 'update';
      target: 'task' | 'project';
      taskId?: string;
      projectId?: string;
      changes: UpdateChanges;
      minimalResponse?: boolean; // Bug #21: Reduce response size
    }
  | {
      operation: 'complete';
      target: 'task' | 'project';
      taskId?: string;
      projectId?: string;
      completionDate?: string; // Bug #20: Allow custom completion date
      minimalResponse?: boolean; // Bug #21: Reduce response size
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
      createSequentially?: boolean;
      atomicOperation?: boolean;
      returnMapping?: boolean;
      stopOnError?: boolean;
      dryRun?: boolean;
    }
  | {
      operation: 'bulk_delete';
      target: 'task' | 'project';
      ids: string[];
      dryRun?: boolean;
    }
  | {
      operation: 'tag_manage';
      action: 'create' | 'rename' | 'delete' | 'merge' | 'nest' | 'unnest' | 'reparent';
      tagName: string;
      newName?: string;
      targetTag?: string;
      parentTag?: string;
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
          minimalResponse: mutation.minimalResponse, // Bug #21
        };

      case 'update': {
        const result: Extract<CompiledMutation, { operation: 'update' }> = {
          operation: 'update',
          target: mutation.target,
          changes: mutation.changes as UpdateChanges,
          minimalResponse: mutation.minimalResponse, // Bug #21
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
          completionDate: mutation.completionDate, // Bug #20
          minimalResponse: mutation.minimalResponse, // Bug #21
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
          createSequentially: mutation.createSequentially,
          atomicOperation: mutation.atomicOperation,
          returnMapping: mutation.returnMapping,
          stopOnError: mutation.stopOnError,
          dryRun: mutation.dryRun,
        };

      case 'bulk_delete':
        return {
          operation: 'bulk_delete',
          target: mutation.target,
          ids: mutation.ids,
          dryRun: mutation.dryRun,
        };

      case 'tag_manage':
        return {
          operation: 'tag_manage',
          action: mutation.action,
          tagName: mutation.tagName,
          newName: mutation.newName,
          targetTag: mutation.targetTag,
          parentTag: mutation.parentTag,
        };

      default: {
        // Exhaustiveness check
        const _exhaustive: never = mutation;
        throw new Error(`Unknown mutation operation: ${String(_exhaustive)}`);
      }
    }
  }
}
