/**
 * OMN-167 — buildAST() FILTER_DEFS entries for the tasks-side folder filter.
 *
 *   folder: "<path>"      → comparison('task.folderMatch', '==', '<path>')
 *   folderTopLevel: true  → comparison('task.folderTopLevel', '==', true)
 */

import { describe, it, expect } from 'vitest';
import { buildAST } from '../../../../src/contracts/ast/builder.js';
import type { TaskFilter } from '../../../../src/contracts/filters.js';

describe('OMN-167: buildAST folder filter', () => {
  it('builds task.folderMatch for a folder path string', () => {
    const ast = buildAST({ folder: 'Development : Web' } as TaskFilter);
    expect(ast).toEqual({
      type: 'comparison',
      field: 'task.folderMatch',
      operator: '==',
      value: 'Development : Web',
    });
  });

  it('builds task.folderTopLevel for folderTopLevel: true', () => {
    const ast = buildAST({ folderTopLevel: true } as TaskFilter);
    expect(ast).toEqual({
      type: 'comparison',
      field: 'task.folderTopLevel',
      operator: '==',
      value: true,
    });
  });

  it('does not emit a folder condition when neither key is present', () => {
    const ast = buildAST({} as TaskFilter);
    expect(ast).toEqual({ type: 'literal', value: true });
  });

  it('does not emit folderTopLevel when it is false (absent intent)', () => {
    const ast = buildAST({ folderTopLevel: false } as TaskFilter);
    expect(ast).toEqual({ type: 'literal', value: true });
  });
});
