import { z } from 'zod';
import { BaseTool } from '../base.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { WriteSchema, type WriteInput } from './schemas/write-schema.js';
import { MutationCompiler } from './compilers/MutationCompiler.js';
import { ManageTaskTool } from '../tasks/ManageTaskTool.js';
import { BatchCreateTool } from '../batch/BatchCreateTool.js';

export class OmniFocusWriteTool extends BaseTool<typeof WriteSchema, any> {
  name = 'omnifocus_write';
  description = `Create, update, complete, or delete OmniFocus tasks and projects.

OPERATIONS:
- create: New task/project with data
- update: Modify existing (provide id + changes)
- complete: Mark done (provide id)
- delete: Remove permanently (provide id)
- batch: Multiple operations in one call

TAG OPERATIONS:
- tags: [...] - Replace all tags
- addTags: [...] - Add to existing
- removeTags: [...] - Remove from existing

DATE FORMATS:
- Date only: "YYYY-MM-DD" (defaults: due=5pm, defer=8am)
- Date+time: "YYYY-MM-DD HH:mm" (local time)
- Clear date: null

MOVE TO INBOX: Set project: null

SAFETY:
- Delete is permanent - confirm with user first
- Batch supports up to 100 operations
- Tags handled automatically via bridge`;

  schema = WriteSchema;

  private compiler: MutationCompiler;
  private manageTaskTool: ManageTaskTool;
  private batchTool: BatchCreateTool;

  constructor(cache: CacheManager) {
    super(cache);
    this.compiler = new MutationCompiler();
    this.manageTaskTool = new ManageTaskTool(cache);
    this.batchTool = new BatchCreateTool(cache);
  }

  async executeValidated(args: WriteInput): Promise<any> {
    const compiled = this.compiler.compile(args);

    // Route to batch tool if batch operation
    if (compiled.operation === 'batch') {
      return this.routeToBatch(compiled);
    }

    // Otherwise route to manage_task
    return this.routeToManageTask(compiled);
  }

  private async routeToManageTask(compiled: any): Promise<any> {
    const manageArgs: any = {
      operation: compiled.operation,
    };

    // Add ID for update/complete/delete
    if (compiled.taskId) {
      manageArgs.taskId = compiled.taskId;
    }

    // Note: projectId not used by ManageTaskTool (it uses 'project' parameter instead)

    // Add data for create - spread all fields
    if (compiled.data) {
      // Spread data fields directly (name, tags, project, dueDate, etc.)
      Object.assign(manageArgs, compiled.data);
    }

    // Add changes for update - spread all fields
    if (compiled.changes) {
      Object.assign(manageArgs, compiled.changes);
    }

    return this.manageTaskTool.execute(manageArgs);
  }

  private async routeToBatch(compiled: any): Promise<any> {
    if (!compiled.operations) {
      throw new Error('Batch operation requires operations array');
    }

    // Convert builder batch format to existing batch tool format
    const batchArgs: any = {
      items: compiled.operations.map((op: any) => ({
        type: op.target,
        name: op.data?.name,
        ...op.data,
      }))
    };

    return this.batchTool.execute(batchArgs);
  }
}
