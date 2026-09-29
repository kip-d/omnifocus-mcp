import type { WriteInput } from '../schemas/write-schema.js';
import type { FolderCreateData } from '../../../contracts/mutations.js';

// OMN-362: these were hand-redeclared copies of the Zod output types, cast
// into with no key guard, so a new write field had to be added in both places
// (and silently vanished from the compiled mutation when it wasn't). They are
// now DERIVED from WriteInput (= z.infer<typeof WriteSchema>), so the compiled
// mutation carries exactly what the schema validated.
type Mutation = WriteInput['mutation'];
type CreateData = Extract<Mutation, { operation: 'create' }>['data'];
type UpdateChanges = NonNullable<Extract<Mutation, { operation: 'update' }>['changes']>;
type BatchOperation = Extract<Mutation, { operation: 'batch' }>['operations'][number];

// The derived BatchOperation is a real discriminated union. The old flat
// interface made `data`/`id` optional on every op, which let batch code read
// them without narrowing. Consumers split ops with these instead.
export type CompiledBatchCreateOp = Extract<BatchOperation, { operation: 'create' }>;
export type CompiledBatchFollowupOp = Exclude<BatchOperation, { operation: 'create' }>;

// Discriminated union for compiled mutations
export type CompiledMutation =
  | {
      operation: 'create';
      target: 'task' | 'project';
      data: CreateData;
      minimalResponse?: boolean; // Bug #21: Reduce response size
    }
  | {
      operation: 'create_folder';
      data: FolderCreateData;
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
      target?: 'task' | 'project';
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
          data: mutation.data,
          minimalResponse: mutation.minimalResponse, // Bug #21
        };

      case 'create_folder':
        return {
          operation: 'create_folder',
          data: mutation.data,
        };

      case 'update': {
        // OMN-75: target defaults to 'task' (schema applies it post-parse;
        // also defended here so a missing target never silently routes to
        // projectId if compile() is handed unparsed input).
        const updateTarget = mutation.target ?? 'task';
        // OMN-75: `data` is an accepted alias for `changes`. WriteSchema's
        // superRefine guarantees at least one is present; the types can't see
        // that, so fail loudly rather than cast (OMN-362) or compile an empty update.
        const changes = mutation.changes ?? mutation.data;
        if (!changes) {
          throw new Error('update requires `changes` (or its `data` alias)');
        }
        const result: Extract<CompiledMutation, { operation: 'update' }> = {
          operation: 'update',
          target: updateTarget,
          changes,
          minimalResponse: mutation.minimalResponse, // Bug #21
        };
        // Map ID to taskId or projectId based on target
        if (updateTarget === 'task') {
          result.taskId = mutation.id;
        } else {
          result.projectId = mutation.id;
        }
        return result;
      }

      case 'complete': {
        const completeTarget = mutation.target ?? 'task'; // OMN-75: see update
        const result: Extract<CompiledMutation, { operation: 'complete' }> = {
          operation: 'complete',
          target: completeTarget,
          completionDate: mutation.completionDate, // Bug #20
          minimalResponse: mutation.minimalResponse, // Bug #21
        };
        // Map ID to taskId or projectId based on target
        if (completeTarget === 'task') {
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
        // OMN-71: `target_id` is an accepted alias for `id`. WriteSchema's
        // superRefine guarantees at least one is present.
        const deleteId = mutation.id ?? mutation.target_id;
        // Map ID to taskId or projectId based on target
        if (mutation.target === 'task') {
          result.taskId = deleteId;
        } else {
          result.projectId = deleteId;
        }
        return result;
      }

      case 'batch':
        return {
          operation: 'batch',
          target: mutation.target,
          operations: mutation.operations,
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
