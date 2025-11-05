import { BaseTool } from '../base.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { WriteSchema, type WriteInput } from './schemas/write-schema.js';
import { MutationCompiler, type CompiledMutation } from './compilers/MutationCompiler.js';
import { ManageTaskTool } from '../tasks/ManageTaskTool.js';
import { BatchCreateTool } from '../batch/BatchCreateTool.js';

export class OmniFocusWriteTool extends BaseTool<typeof WriteSchema, unknown> {
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
  meta = {
    category: 'Task Management' as const,
    stability: 'experimental' as const,
    complexity: 'moderate' as const,
    performanceClass: 'fast' as const,
    tags: ['unified', 'builder', 'write', 'mutations'],
    capabilities: ['create', 'update', 'complete', 'delete', 'batch'],
  };

  private compiler: MutationCompiler;
  private manageTaskTool: ManageTaskTool;
  private batchTool: BatchCreateTool;

  constructor(cache: CacheManager) {
    super(cache);
    this.compiler = new MutationCompiler();
    this.manageTaskTool = new ManageTaskTool(cache);
    this.batchTool = new BatchCreateTool(cache);
  }

  async executeValidated(args: WriteInput): Promise<unknown> {
    const compiled = this.compiler.compile(args);

    // Route to batch tool if batch operation
    if (compiled.operation === 'batch') {
      return this.routeToBatch(compiled);
    }

    // Otherwise route to manage_task
    return this.routeToManageTask(compiled);
  }

  private async routeToManageTask(
    compiled: Exclude<CompiledMutation, { operation: 'batch' }>
  ): Promise<unknown> {
    const manageArgs: Record<string, unknown> = {
      operation: compiled.operation,
    };

    // Add ID for update/complete/delete
    if ('taskId' in compiled && compiled.taskId) {
      manageArgs.taskId = compiled.taskId;
    }

    // Note: projectId not used by ManageTaskTool (it uses 'project' parameter instead)

    // Add data for create - spread all fields
    if ('data' in compiled && compiled.data) {
      // Spread data fields directly (name, tags, project, dueDate, etc.)
      Object.assign(manageArgs, compiled.data);
    }

    // Add changes for update - spread all fields
    if ('changes' in compiled && compiled.changes) {
      Object.assign(manageArgs, compiled.changes);
    }

    return this.manageTaskTool.execute(manageArgs);
  }

  private async routeToBatch(
    compiled: Extract<CompiledMutation, { operation: 'batch' }>
  ): Promise<unknown> {
    // Convert builder batch format to existing batch tool format
    const batchArgs: Record<string, unknown> = {
      items: compiled.operations.map(op => ({
        type: op.target,
        name: op.data?.name,
        ...op.data,
      }))
    };

    return this.batchTool.execute(batchArgs);
  }
}
