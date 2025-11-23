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

BATCH OPERATIONS:
- tempId: Optional for each item (auto-generated if not provided)
- parentTempId: Reference parent by tempId for hierarchies
- createSequentially: true (respects dependencies)
- returnMapping: true (returns tempId → realId map)

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
    stability: 'stable' as const,
    complexity: 'moderate' as const,
    performanceClass: 'fast' as const,
    tags: ['unified', 'write', 'mutations'],
    capabilities: ['create', 'update', 'complete', 'delete', 'batch'],
  };

  annotations = {
    title: "Manage OmniFocus Tasks",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true
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

    // Route bulk_delete to ManageTaskTool's existing bulk_delete
    if (compiled.operation === 'bulk_delete') {
      return this.routeToBulkDelete(compiled);
    }

    // Otherwise route to manage_task
    return this.routeToManageTask(compiled);
  }

  private async routeToManageTask(
    compiled: Exclude<CompiledMutation, { operation: 'batch' }>,
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
    compiled: Extract<CompiledMutation, { operation: 'batch' }>,
  ): Promise<unknown> {
    // Convert builder batch format to existing batch tool format
    // Auto-generate tempIds for items that don't have them
    let autoTempIdCounter = 0;
    const batchArgs: Record<string, unknown> = {
      items: compiled.operations
        .filter(op => op.operation === 'create')
        .map(op => {
          const item = {
            type: op.target,
            ...op.data,
          };

          // Ensure tempId exists (required by BatchCreateTool for dependency graph)
          if (!item.tempId) {
            item.tempId = `auto_temp_${++autoTempIdCounter}`;
          }

          return item;
        }),
      createSequentially: compiled.createSequentially ?? true,
      atomicOperation: compiled.atomicOperation ?? false,
      returnMapping: compiled.returnMapping ?? true,
      stopOnError: compiled.stopOnError ?? true,
    };

    return this.batchTool.execute(batchArgs);
  }

  private async routeToBulkDelete(
    compiled: Extract<CompiledMutation, { operation: 'bulk_delete' }>
  ): Promise<unknown> {
    // Route to ManageTaskTool's existing bulk_delete functionality
    const manageArgs: Record<string, unknown> = {
      operation: 'bulk_delete',
    };

    // Map to taskIds or projectIds based on target
    if (compiled.target === 'task') {
      manageArgs.taskIds = compiled.ids;
    } else {
      manageArgs.projectIds = compiled.ids;
    }

    return this.manageTaskTool.execute(manageArgs);
  }
}
