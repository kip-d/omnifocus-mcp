import { describe, it, expect } from 'vitest';
import { WriteSchema } from '../../../../../src/tools/unified/schemas/write-schema.js';

/**
 * OMN-343 (slice 2): target-mismatch rejection (spec F3-F7).
 *
 * One `CreateDataSchema` / `UpdateChangesSchema` serves both task and project
 * targets, so a field settable only on one target previously validated for
 * BOTH and was then silently dropped by the handler that doesn't read it.
 * This table drives every (field, target, op) mismatch across every route a
 * write can take: single create, single update via `changes`, single update
 * via the `data` alias, a defaulted-target update, and each batch-item shape.
 * Every mismatch must produce a VALIDATION_ERROR naming the field AND the
 * target; every legal combination must still validate.
 *
 * Field ownership here is read off the compile-time exhaustiveness guards in
 * src/contracts/ast/mutation/defs.ts (`_exhaustive: Record<keyof T, true>`
 * for TaskCreateData/ProjectCreateData/TaskUpdateData/ProjectUpdateData) —
 * the ground truth for what each builder actually consumes, not just the
 * contract interfaces (which can themselves drift, as the old inline
 * "Project-specific" schema comment did for `sequential`/`status`).
 */

type Mismatch = {
  field: string;
  value: unknown;
  createOwner: 'task' | 'project' | null;
  updateOwner: 'task' | 'project' | null;
};

// createOwner/updateOwner: the target that LEGALLY accepts this field for
// that operation, or null if the field doesn't exist on that operation at
// all for either target (not applicable — skip that op's cases).
const MISMATCHES: Mismatch[] = [
  { field: 'parentTaskId', value: 'parent-1', createOwner: 'task', updateOwner: 'task' },
  { field: 'estimatedMinutes', value: 30, createOwner: 'task', updateOwner: 'task' },
  { field: 'repetitionRule', value: { frequency: 'daily' }, createOwner: 'task', updateOwner: 'task' },
  { field: 'project', value: 'Some Project', createOwner: 'task', updateOwner: 'task' },
  { field: 'folder', value: 'Some Folder', createOwner: 'project', updateOwner: 'project' },
  { field: 'reviewInterval', value: 14, createOwner: 'project', updateOwner: 'project' },
  // clearEstimatedMinutes and status exist only on update / only on create
  // respectively for one target — see per-field notes below.
];

const otherTarget = (owner: 'task' | 'project'): 'task' | 'project' => (owner === 'task' ? 'project' : 'task');

describe('WriteSchema target-mismatch rejection (OMN-343 slice 2)', () => {
  describe('create: single operation', () => {
    for (const { field, value, createOwner } of MISMATCHES) {
      if (!createOwner) continue;
      const wrongTarget = otherTarget(createOwner);
      it(`rejects "${field}" on create target "${wrongTarget}" (owned by ${createOwner})`, () => {
        const result = WriteSchema.safeParse({
          mutation: { operation: 'create', target: wrongTarget, data: { name: 'X', [field]: value } },
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          const msg = result.error.issues.map((i) => i.message).join(' | ');
          expect(msg).toContain(`"${field}"`);
          expect(msg).toMatch(wrongTarget === 'task' ? /project-only/ : /task-only/);
        }
      });

      it(`accepts "${field}" on create target "${createOwner}" (its own target)`, () => {
        const result = WriteSchema.safeParse({
          mutation: { operation: 'create', target: createOwner, data: { name: 'X', [field]: value } },
        });
        expect(result.success).toBe(true);
      });
    }

    it('rejects "status" on task create (project-only at create time)', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'create', target: 'task', data: { name: 'X', status: 'completed' } },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = result.error.issues.map((i) => i.message).join(' | ');
        expect(msg).toContain('"status"');
        expect(msg).toMatch(/project-only/);
      }
    });

    it('accepts "status" on project create', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'create', target: 'project', data: { name: 'X', status: 'on_hold' } },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('update: single operation via `changes`', () => {
    for (const { field, value, updateOwner } of MISMATCHES) {
      if (!updateOwner) continue;
      const wrongTarget = otherTarget(updateOwner);
      it(`rejects "${field}" on update target "${wrongTarget}" via changes`, () => {
        const result = WriteSchema.safeParse({
          mutation: { operation: 'update', target: wrongTarget, id: 'id-1', changes: { [field]: value } },
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          const msg = result.error.issues.map((i) => i.message).join(' | ');
          expect(msg).toContain(`"${field}"`);
          expect(msg).toMatch(wrongTarget === 'task' ? /project-only/ : /task-only/);
        }
      });

      it(`accepts "${field}" on update target "${updateOwner}" via changes (its own target)`, () => {
        const result = WriteSchema.safeParse({
          mutation: { operation: 'update', target: updateOwner, id: 'id-1', changes: { [field]: value } },
        });
        expect(result.success).toBe(true);
      });
    }

    it('rejects "clearEstimatedMinutes" on project update (task-only)', () => {
      const result = WriteSchema.safeParse({
        mutation: {
          operation: 'update',
          target: 'project',
          id: 'id-1',
          changes: { clearEstimatedMinutes: true },
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = result.error.issues.map((i) => i.message).join(' | ');
        expect(msg).toContain('"clearEstimatedMinutes"');
        expect(msg).toMatch(/task-only/);
      }
    });

    it('accepts "clearEstimatedMinutes" on task update', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'update', target: 'task', id: 'id-1', changes: { clearEstimatedMinutes: true } },
      });
      expect(result.success).toBe(true);
    });

    // status is legal on both targets at update time (different enums); the
    // on_hold-specific rejection (OMN-377) is covered elsewhere, not here.
    it('still accepts status on BOTH targets at update time (not in the mismatch table)', () => {
      expect(
        WriteSchema.safeParse({
          mutation: { operation: 'update', target: 'task', id: 'id-1', changes: { status: 'dropped' } },
        }).success,
      ).toBe(true);
      expect(
        WriteSchema.safeParse({
          mutation: { operation: 'update', target: 'project', id: 'id-1', changes: { status: 'on_hold' } },
        }).success,
      ).toBe(true);
    });
  });

  describe('update: single operation via the `data` alias (OMN-75)', () => {
    it('rejects a target-mismatched field reaching update through `data` instead of `changes`', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'update', target: 'project', id: 'id-1', data: { estimatedMinutes: 10 } },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = result.error.issues.map((i) => i.message).join(' | ');
        expect(msg).toContain('"estimatedMinutes"');
        expect(msg).toMatch(/task-only/);
      }
    });

    it('accepts a legally-owned field reaching update through `data`', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'update', target: 'project', id: 'id-1', data: { folder: 'Work' } },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('update: defaulted target (OMN-75 — target omitted, defaults to "task")', () => {
    it('rejects a project-only field on an update with no target (defaults to task)', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'update', id: 'id-1', changes: { folder: 'Work' } },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const msg = result.error.issues.map((i) => i.message).join(' | ');
        expect(msg).toContain('"folder"');
        expect(msg).toMatch(/project-only/);
      }
    });
  });

  describe('batch: create sub-ops', () => {
    it('rejects a target-mismatched field on a batch create item', () => {
      const result = WriteSchema.safeParse({
        mutation: {
          operation: 'batch',
          operations: [{ operation: 'create', target: 'project', data: { name: 'P', parentTaskId: 't1' } }],
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.join('.') === 'mutation.operations.0.data.parentTaskId');
        expect(issue).toBeDefined();
        expect(issue?.message).toContain('"parentTaskId"');
        expect(issue?.message).toMatch(/task-only/);
      }
    });

    it('accepts a legal batch create item', () => {
      const result = WriteSchema.safeParse({
        mutation: {
          operation: 'batch',
          operations: [{ operation: 'create', target: 'project', data: { name: 'P', folder: 'Work' } }],
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects mismatches independently per batch item (names the right index)', () => {
      const result = WriteSchema.safeParse({
        mutation: {
          operation: 'batch',
          operations: [
            { operation: 'create', target: 'task', data: { name: 'T', folder: 'Work' } },
            { operation: 'create', target: 'project', data: { name: 'P', estimatedMinutes: 5 } },
          ],
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('mutation.operations.0.data.folder');
        expect(paths).toContain('mutation.operations.1.data.estimatedMinutes');
      }
    });
  });

  describe('batch: update sub-ops', () => {
    it('rejects a target-mismatched field on a batch update item', () => {
      const result = WriteSchema.safeParse({
        mutation: {
          operation: 'batch',
          operations: [{ operation: 'update', target: 'task', id: 't1', changes: { reviewInterval: 7 } }],
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find(
          (i) => i.path.join('.') === 'mutation.operations.0.changes.reviewInterval',
        );
        expect(issue).toBeDefined();
        expect(issue?.message).toContain('"reviewInterval"');
        expect(issue?.message).toMatch(/project-only/);
      }
    });

    it('accepts a legal batch update item', () => {
      const result = WriteSchema.safeParse({
        mutation: {
          operation: 'batch',
          operations: [{ operation: 'update', target: 'task', id: 't1', changes: { flagged: true } }],
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('fields common to both targets stay legal (no false positives)', () => {
    const commonCreateFields: Record<string, unknown> = {
      name: 'X',
      note: 'n',
      tags: ['a'],
      dueDate: '2026-06-01',
      deferDate: '2026-05-25',
      plannedDate: '2026-05-20',
      flagged: true,
      sequential: true,
    };
    it('accepts every common field on task create', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'create', target: 'task', data: commonCreateFields },
      });
      expect(result.success).toBe(true);
    });
    it('accepts every common field on project create', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'create', target: 'project', data: commonCreateFields },
      });
      expect(result.success).toBe(true);
    });

    const commonUpdateFields: Record<string, unknown> = {
      name: 'X',
      note: 'n',
      tags: ['a'],
      addTags: ['b'],
      removeTags: ['c'],
      dueDate: '2026-06-01',
      clearDeferDate: true,
      flagged: true,
      sequential: true,
    };
    it('accepts every common field on task update', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'update', target: 'task', id: 'id-1', changes: commonUpdateFields },
      });
      expect(result.success).toBe(true);
    });
    it('accepts every common field on project update', () => {
      const result = WriteSchema.safeParse({
        mutation: { operation: 'update', target: 'project', id: 'id-1', changes: commonUpdateFields },
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('WriteSchema reviewInterval union-collapse fix (OMN-343 slice 2)', () => {
  it('surfaces the unit enum message at reviewInterval.unit, not a generic union error', () => {
    const result = WriteSchema.safeParse({
      mutation: {
        operation: 'update',
        target: 'project',
        id: 'id-1',
        changes: { reviewInterval: { steps: 1, unit: 'quarter' } },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'mutation.changes.reviewInterval.unit');
      expect(issue).toBeDefined();
      expect(issue?.message).toMatch(/unit must be one of/);
      expect(issue?.message).not.toBe('Invalid input'); // the old union-collapse message
    }
  });

  it('still rejects an invalid reviewInterval on create with the same nested message', () => {
    const result = WriteSchema.safeParse({
      mutation: {
        operation: 'create',
        target: 'project',
        data: { name: 'P', reviewInterval: { steps: 1, unit: 'fortnight' } },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'mutation.data.reviewInterval.unit');
      expect(issue?.message).toMatch(/unit must be one of/);
    }
  });

  it('still accepts a valid object-form reviewInterval', () => {
    const result = WriteSchema.safeParse({
      mutation: {
        operation: 'update',
        target: 'project',
        id: 'id-1',
        changes: { reviewInterval: { steps: 2, unit: 'weeks' } },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const changes = (result.data.mutation as { changes: Record<string, unknown> }).changes;
      expect(changes.reviewInterval).toBe(14);
    }
  });

  it('still accepts a plain numeric reviewInterval', () => {
    const result = WriteSchema.safeParse({
      mutation: { operation: 'update', target: 'project', id: 'id-1', changes: { reviewInterval: 30 } },
    });
    expect(result.success).toBe(true);
  });

  it('still rejects a non-numeric, non-object reviewInterval', () => {
    const result = WriteSchema.safeParse({
      mutation: { operation: 'update', target: 'project', id: 'id-1', changes: { reviewInterval: true } },
    });
    expect(result.success).toBe(false);
  });
});
