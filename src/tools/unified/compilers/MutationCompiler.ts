import type { WriteInput } from '../schemas/write-schema.js';

export interface CompiledMutation {
  operation: 'create' | 'update' | 'complete' | 'delete' | 'batch';
  target: 'task' | 'project';
  data?: Record<string, any>;
  taskId?: string;
  projectId?: string;
  changes?: Record<string, any>;
  operations?: Array<any>;
}

export class MutationCompiler {
  compile(input: WriteInput): CompiledMutation {
    const { mutation } = input;

    const compiled: CompiledMutation = {
      operation: mutation.operation,
      target: mutation.target,
    };

    // Map data for create
    if (mutation.operation === 'create' && 'data' in mutation) {
      compiled.data = mutation.data;
    }

    // Map ID for update/complete/delete
    if ('id' in mutation && mutation.id) {
      if (mutation.target === 'task') {
        compiled.taskId = mutation.id;
      } else {
        compiled.projectId = mutation.id;
      }
    }

    // Map changes for update
    if (mutation.operation === 'update' && 'changes' in mutation) {
      compiled.changes = mutation.changes;
    }

    // Map operations for batch
    if (mutation.operation === 'batch' && 'operations' in mutation) {
      compiled.operations = mutation.operations;
    }

    return compiled;
  }
}
