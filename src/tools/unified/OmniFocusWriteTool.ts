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

/** Response shape from BatchCreateTool.execute() — success or validation error */
interface BatchCreateResponse {
  success: boolean;
  data: {
    created?: number;
    mapping?: Record<string, string>;
  };
}

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
- operations: Array of create, update, complete, and delete operations
- Execution order: creates first, then updates, completes, deletes last
- tempId: Optional for creates (auto-generated if not provided)
- parentTempId: Reference parent by tempId for hierarchies
- Updates/completes can reference tempIds from creates in the same batch
- createSequentially: true (respects dependencies)
- returnMapping: true (returns tempId → realId map)
- stopOnError: true (halt on first failure)

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
    // Partition operations by type
    const createOps = compiled.operations.filter((op) => op.operation === 'create');
    const updateOps = compiled.operations.filter((op) => op.operation === 'update');
    const completeOps = compiled.operations.filter((op) => op.operation === 'complete');
    const deleteOps = compiled.operations.filter((op) => op.operation === 'delete');

    const results: {
      created: unknown[];
      updated: unknown[];
      completed: unknown[];
      deleted: unknown[];
      errors: unknown[];
    } = { created: [], updated: [], completed: [], deleted: [], errors: [] };

    let tempIdMapping: Record<string, string> = {};
    let hadError = false;

    // Phase 1: Creates (via BatchCreateTool for hierarchy support)
    if (createOps.length > 0 && !hadError) {
      try {
        let autoTempIdCounter = 0;
        const batchArgs: Record<string, unknown> = {
          items: createOps.map((op) => {
            const item = { type: op.target, ...op.data };
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

        const createResult = (await this.batchTool.execute(batchArgs)) as BatchCreateResponse;

        // Check if BatchCreateTool returned a validation error (e.g., circular deps, unknown parentTempId)
        if (createResult?.success === false) {
          results.errors.push(createResult);
          if (compiled.stopOnError) hadError = true;
        } else {
          results.created.push(createResult);

          // Extract tempId mapping for subsequent operations
          // BatchCreateTool stores mapping in data.mapping (via TempIdResolver)
          if (createResult?.data?.mapping) {
            tempIdMapping = createResult.data.mapping;
          }
        }
      } catch (err) {
        results.errors.push({ phase: 'create', error: String(err) });
        if (compiled.stopOnError) hadError = true;
      }
    }

    // Phase 2-4: Updates, completes, deletes — route through existing single-item handlers
    const phases: Array<{
      name: string;
      ops: typeof updateOps;
      resultKey: 'updated' | 'completed' | 'deleted';
    }> = [
      { name: 'update', ops: updateOps, resultKey: 'updated' },
      { name: 'complete', ops: completeOps, resultKey: 'completed' },
      { name: 'delete', ops: deleteOps, resultKey: 'deleted' },
    ];

    for (const phase of phases) {
      if (hadError || phase.ops.length === 0) continue;

      for (const op of phase.ops) {
        try {
          // Resolve tempId references if the id matches a tempId from creates
          const resolvedId = op.id && tempIdMapping[op.id] ? tempIdMapping[op.id] : op.id;

          // Build args for routing through existing single-item handlers
          const routeArgs: Record<string, unknown> = {
            operation: op.operation,
          };

          if (op.target === 'task') {
            routeArgs.taskId = resolvedId;
          } else {
            routeArgs.projectId = resolvedId;
          }

          // Add changes for update operations
          if (op.changes) {
            Object.assign(routeArgs, op.changes);
          }

          // Add completionDate for complete operations
          if (op.completionDate) {
            routeArgs.completionDate = op.completionDate;
          }

          let result: unknown;
          if (op.target === 'project') {
            result = await this.projectsTool.execute(routeArgs);
          } else {
            result = await this.manageTaskTool.execute(routeArgs);
          }
          results[phase.resultKey].push(result);
        } catch (err) {
          results.errors.push({ phase: phase.name, id: op.id, error: String(err) });
          if (compiled.stopOnError) {
            hadError = true;
            break;
          }
        }
      }
    }

    return {
      success: results.errors.length === 0,
      data: {
        operation: 'batch',
        summary: {
          created: results.created.reduce(
            (sum: number, r: unknown) => sum + ((r as BatchCreateResponse)?.data?.created ?? 0),
            0,
          ),
          updated: results.updated.length,
          completed: results.completed.length,
          deleted: results.deleted.length,
          errors: results.errors.length,
        },
        results,
        ...(Object.keys(tempIdMapping).length > 0 ? { tempIdMapping } : {}),
      },
      metadata: {
        operation: 'batch',
        timestamp: new Date().toISOString(),
        ...(Object.keys(tempIdMapping).length > 0 ? { tempIdMapping } : {}),
      },
    };
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

    // Partition operations
    const createOps = compiled.operations.filter((op) => op.operation === 'create');
    const updateOps = compiled.operations.filter((op) => op.operation === 'update');
    const completeOps = compiled.operations.filter((op) => op.operation === 'complete');
    const deleteOps = compiled.operations.filter((op) => op.operation === 'delete');

    // Build preview items for each type
    const createPreviewItems = createOps.map((op, index) => ({
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

    const updatePreviewItems = updateOps.map((op) => ({
      id: op.id,
      type: compiled.target,
      name: op.changes?.name || `[Update to ${op.id}]`,
      action: 'update' as const,
      details: op.changes,
    }));

    const completePreviewItems = completeOps.map((op) => ({
      id: op.id,
      type: compiled.target,
      action: 'complete' as const,
      details: { completionDate: op.completionDate },
    }));

    const deletePreviewItems = deleteOps.map((op) => ({
      id: op.id,
      type: compiled.target,
      action: 'delete' as const,
    }));

    // Validation checks
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for duplicate tempIds
    const tempIds = createPreviewItems.map((item) => item.tempId);
    const duplicates = tempIds.filter((id, idx) => tempIds.indexOf(id) !== idx);
    if (duplicates.length > 0) {
      errors.push(`Duplicate tempIds found: ${duplicates.join(', ')}`);
    }

    // Check for orphan parentTempIds
    const parentRefs = createPreviewItems
      .filter((item) => item.details.parentTempId)
      .map((item) => item.details.parentTempId);
    const orphanRefs = parentRefs.filter((ref) => !tempIds.includes(ref as string));
    if (orphanRefs.length > 0) {
      errors.push(`Parent references not found in batch: ${orphanRefs.join(', ')}`);
    }

    // Warning for large batches
    const totalOps = createOps.length + updateOps.length + completeOps.length + deleteOps.length;
    if (totalOps > 50) {
      warnings.push(`Large batch (${totalOps} operations) may take 30+ seconds to execute`);
    }

    // Warning for deletes
    if (deleteOps.length > 0) {
      warnings.push(`${deleteOps.length} item(s) will be permanently deleted`);
    }

    return createSuccessResponseV2(
      'omnifocus_write',
      {
        dryRun: true,
        operation: 'batch',
        wouldAffect: {
          count: totalOps,
          creates: createPreviewItems.length,
          updates: updatePreviewItems.length,
          completes: completePreviewItems.length,
          deletes: deletePreviewItems.length,
          items: [...createPreviewItems, ...updatePreviewItems, ...completePreviewItems, ...deletePreviewItems],
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
        message: `DRY RUN: No changes made. ${createOps.length} create, ${updateOps.length} update, ${completeOps.length} complete, ${deleteOps.length} delete.`,
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
