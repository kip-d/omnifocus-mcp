import { BaseTool } from '../base.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { WriteSchema, type WriteInput } from './schemas/write-schema.js';
import { MutationCompiler, type CompiledMutation } from './compilers/MutationCompiler.js';
import { ManageTaskTool } from '../tasks/ManageTaskTool.js';
import { ProjectsTool } from '../projects/ProjectsTool.js';
import { BatchCreateTool } from '../batch/BatchCreateTool.js';
import { TagsTool } from '../tags/TagsTool.js';
import { createSuccessResponseV2, OperationTimerV2 } from '../../utils/response-format.js';
import { TaskId, ProjectId } from '../../utils/branded-types.js';

// Convert string IDs to branded types for type safety (compile-time only, no runtime validation)
const convertToTaskId = (id: string): TaskId => id as TaskId;
const convertToProjectId = (id: string): ProjectId => id as ProjectId;

export class OmniFocusWriteTool extends BaseTool<typeof WriteSchema, unknown> {
  name = 'omnifocus_write';
  description = `Create, update, complete, or delete OmniFocus tasks and projects.

OPERATIONS:
- create: New task/project with data
- update: Modify existing (provide id + changes)
- complete: Mark done (provide id)
- delete: Remove permanently (provide id)
- batch: Multiple operations in one call
- bulk_delete: Delete multiple items by IDs
- tag_manage: Manage tag hierarchy (create, rename, delete, merge, nest, unnest, reparent)

BATCH OPERATIONS:
- tempId: Optional for each item (auto-generated if not provided)
- parentTempId: Reference parent by tempId for hierarchies
- createSequentially: true (respects dependencies)
- returnMapping: true (returns tempId → realId map)

TAG OPERATIONS:
- tags: [...] - Replace all tags
- addTags: [...] - Add to existing
- removeTags: [...] - Remove from existing
- Nested tags use " : " path syntax: "Parent : Child : Leaf" (creates hierarchy, assigns leaf)

TAG MANAGEMENT (tag_manage operation):
- create: Create new tag (tagName required). Supports " : " path syntax for nested hierarchies.
- rename: Rename tag (tagName + newName required)
- delete: Delete tag (tagName required)
- merge: Merge source into target (tagName + targetTag required)
- nest: Move tag under parent (tagName + parentTag required)
- unnest: Move tag to root level (tagName required)
- reparent: Move tag to different parent (tagName + parentTag required)

DATE FORMATS:
- Date only: "YYYY-MM-DD" (defaults: due=5pm, defer=8am, planned=8am)
- Date+time: "YYYY-MM-DD HH:mm" (local time)
- Clear date: null or clearDueDate/clearDeferDate/clearPlannedDate: true

MOVE TO INBOX: Set project: null

SAFETY:
- Delete is permanent - confirm with user first
- Batch supports up to 100 operations`;

  schema = WriteSchema;
  meta = {
    category: 'Task Management' as const,
    stability: 'stable' as const,
    complexity: 'moderate' as const,
    performanceClass: 'fast' as const,
    tags: ['unified', 'write', 'mutations', 'tags'],
    capabilities: ['create', 'update', 'complete', 'delete', 'batch', 'tag_manage'],
  };

  annotations = {
    title: 'Manage OmniFocus Tasks',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  };

  private compiler: MutationCompiler;
  private manageTaskTool: ManageTaskTool;
  private projectsTool: ProjectsTool;
  private batchTool: BatchCreateTool;
  private tagsTool: TagsTool;

  constructor(cache: CacheManager) {
    super(cache);
    this.compiler = new MutationCompiler();
    this.manageTaskTool = new ManageTaskTool(cache);
    this.projectsTool = new ProjectsTool(cache);
    this.batchTool = new BatchCreateTool(cache);
    this.tagsTool = new TagsTool(cache);
  }

  async executeValidated(args: WriteInput): Promise<unknown> {
    const compiled = this.compiler.compile(args);

    // Route tag_manage operations to TagsTool
    if (compiled.operation === 'tag_manage') {
      return this.routeToTagsTool(compiled);
    }

    // Handle dry-run for batch operations
    if (compiled.operation === 'batch' && compiled.dryRun) {
      return this.previewBatch(compiled);
    }

    // Handle dry-run for bulk_delete
    if (compiled.operation === 'bulk_delete' && compiled.dryRun) {
      return this.previewBulkDelete(compiled);
    }

    // Route to batch tool if batch operation
    if (compiled.operation === 'batch') {
      return this.routeToBatch(compiled);
    }

    // Route bulk_delete based on target
    if (compiled.operation === 'bulk_delete') {
      return this.routeToBulkDelete(compiled);
    }

    // Route based on target: task vs project
    if (compiled.target === 'project') {
      return this.routeToProjectsTool(compiled);
    }

    // Default: route tasks to manage_task
    return this.routeToManageTask(compiled);
  }

  private async routeToManageTask(compiled: Exclude<CompiledMutation, { operation: 'batch' }>): Promise<unknown> {
    const manageArgs: Record<string, unknown> = {
      operation: compiled.operation,
    };

    // Add ID for update/complete/delete with branded type safety
    if ('taskId' in compiled && compiled.taskId) {
      manageArgs.taskId = convertToTaskId(compiled.taskId);
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

  private async routeToProjectsTool(
    compiled: Exclude<CompiledMutation, { operation: 'batch' | 'bulk_delete' }>,
  ): Promise<unknown> {
    // Map compiled mutation to ProjectsTool parameters
    const projectArgs: Record<string, unknown> = {
      operation: compiled.operation,
    };

    // Add projectId for update/complete/delete operations with branded type safety
    if ('projectId' in compiled && compiled.projectId) {
      projectArgs.projectId = convertToProjectId(compiled.projectId);
    }

    // Add data for create - spread all fields (name, tags, dueDate, etc.)
    if ('data' in compiled && compiled.data) {
      Object.assign(projectArgs, compiled.data);
    }

    // Add changes for update - spread all fields
    if ('changes' in compiled && compiled.changes) {
      Object.assign(projectArgs, compiled.changes);
    }

    return this.projectsTool.execute(projectArgs);
  }

  private async routeToBatch(compiled: Extract<CompiledMutation, { operation: 'batch' }>): Promise<unknown> {
    // Convert builder batch format to existing batch tool format
    // Auto-generate tempIds for items that don't have them
    let autoTempIdCounter = 0;
    const batchArgs: Record<string, unknown> = {
      items: compiled.operations
        .filter((op) => op.operation === 'create')
        .map((op) => {
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

  private async routeToTagsTool(compiled: Extract<CompiledMutation, { operation: 'tag_manage' }>): Promise<unknown> {
    // Map unified API action to TagsTool action
    // 'unnest' in unified API maps to 'unparent' in TagsTool
    const tagsAction = compiled.action === 'unnest' ? 'unparent' : compiled.action;

    const tagsArgs: Record<string, unknown> = {
      operation: 'manage',
      action: tagsAction,
      tagName: compiled.tagName,
    };

    // Add optional parameters based on action
    if (compiled.newName) {
      tagsArgs.newName = compiled.newName;
    }
    if (compiled.targetTag) {
      tagsArgs.targetTag = compiled.targetTag;
    }
    if (compiled.parentTag) {
      tagsArgs.parentTagName = compiled.parentTag;
    }

    return this.tagsTool.execute(tagsArgs);
  }

  private async routeToBulkDelete(compiled: Extract<CompiledMutation, { operation: 'bulk_delete' }>): Promise<unknown> {
    // Route to ManageTaskTool's existing bulk_delete functionality
    const manageArgs: Record<string, unknown> = {
      operation: 'bulk_delete',
    };

    // Map to taskIds or projectIds based on target with branded type safety
    if (compiled.target === 'task') {
      manageArgs.taskIds = compiled.ids.map((id) => convertToTaskId(id));
    } else {
      manageArgs.projectIds = compiled.ids.map((id) => convertToProjectId(id));
    }

    return this.manageTaskTool.execute(manageArgs);
  }

  /**
   * Preview batch operation without executing
   * Returns what would be created, with validation results
   */
  private previewBatch(compiled: Extract<CompiledMutation, { operation: 'batch' }>): unknown {
    const timer = new OperationTimerV2();

    // Extract create operations for preview
    const createOps = compiled.operations.filter((op) => op.operation === 'create');
    const updateOps = compiled.operations.filter((op) => op.operation === 'update');

    // Build preview items
    const previewItems = createOps.map((op, index) => ({
      tempId: op.data?.tempId || `auto_temp_${index + 1}`,
      type: compiled.target,
      name: op.data?.name || 'Unnamed',
      action: 'create' as const,
      details: {
        project: op.data?.project,
        tags: op.data?.tags,
        dueDate: op.data?.dueDate,
        deferDate: op.data?.deferDate,
        flagged: op.data?.flagged,
        parentTempId: op.data?.parentTempId,
      },
    }));

    // Add update operations to preview
    const updatePreviewItems = updateOps.map((op) => ({
      id: op.id,
      type: compiled.target,
      name: op.changes?.name || `[Update to ${op.id}]`,
      action: 'update' as const,
      details: op.changes,
    }));

    // Validation checks
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for duplicate tempIds
    const tempIds = previewItems.map((item) => item.tempId);
    const duplicates = tempIds.filter((id, idx) => tempIds.indexOf(id) !== idx);
    if (duplicates.length > 0) {
      errors.push(`Duplicate tempIds found: ${duplicates.join(', ')}`);
    }

    // Check for orphan parentTempIds
    const parentRefs = previewItems
      .filter((item) => item.details.parentTempId)
      .map((item) => item.details.parentTempId);
    const orphanRefs = parentRefs.filter((ref) => !tempIds.includes(ref as string));
    if (orphanRefs.length > 0) {
      errors.push(`Parent references not found in batch: ${orphanRefs.join(', ')}`);
    }

    // Warning for large batches
    if (createOps.length > 50) {
      warnings.push(`Large batch (${createOps.length} items) may take 30+ seconds to execute`);
    }

    return createSuccessResponseV2(
      'omnifocus_write',
      {
        dryRun: true,
        operation: 'batch',
        wouldAffect: {
          count: createOps.length + updateOps.length,
          creates: previewItems.length,
          updates: updatePreviewItems.length,
          items: [...previewItems, ...updatePreviewItems],
        },
        validation: {
          passed: errors.length === 0,
          errors: errors.length > 0 ? errors : undefined,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
      },
      undefined,
      {
        ...timer.toMetadata(),
        message: `DRY RUN: No changes made. ${createOps.length} items would be created, ${updateOps.length} updated.`,
      },
    );
  }

  /**
   * Preview bulk delete operation without executing
   * Returns the IDs that would be deleted
   *
   * Note: Does not verify if IDs exist (that would require expensive lookups).
   * Verification happens at execution time.
   */
  private previewBulkDelete(compiled: Extract<CompiledMutation, { operation: 'bulk_delete' }>): unknown {
    const timer = new OperationTimerV2();

    // Build preview items from the IDs provided
    const previewItems = compiled.ids.map((id) => ({
      id,
      action: 'delete' as const,
    }));

    const warnings: string[] = [];

    // Warning for large deletes
    if (compiled.ids.length > 20) {
      warnings.push(`Large bulk delete (${compiled.ids.length} items). Double-check IDs before executing.`);
    }

    return createSuccessResponseV2(
      'omnifocus_write',
      {
        dryRun: true,
        operation: 'bulk_delete',
        target: compiled.target,
        wouldAffect: {
          count: compiled.ids.length,
          items: previewItems,
        },
        validation: {
          passed: true,
          warnings: warnings.length > 0 ? warnings : undefined,
          note: 'ID existence not verified in dry-run. Invalid IDs will fail silently at execution.',
        },
      },
      undefined,
      {
        ...timer.toMetadata(),
        message: `DRY RUN: No changes made. ${compiled.ids.length} ${compiled.target}(s) would be permanently deleted.`,
      },
    );
  }
}
