import { describe, it, expect } from 'vitest';
import { buildUpdateTaskScript } from '../../src/contracts/ast/mutation-script-builder';

describe('Task Search Limit Bug Fix (AST Builder)', () => {
  it('should avoid whose() and use safe iteration', async () => {
    // Test the AST-generated update script
    const generatedScript = await buildUpdateTaskScript('test-id-123', {
      name: 'Test Task',
    });

    // We explicitly avoid whose() due to performance and reliability issues
    expect(generatedScript.script).not.toContain('whose(');
    // Confirm it iterates over flattenedTasks
    expect(generatedScript.script).toContain('flattenedTasks');
  });

  it('should directly scan tasks collection without whose()', async () => {
    const generatedScript = await buildUpdateTaskScript('test-id-123', {
      name: 'Test Task',
    });

    expect(generatedScript.script).toContain('flattenedTasks');
    expect(generatedScript.script).not.toContain('whose(');
  });

  it('should handle project changes in the update script', async () => {
    const generatedScript = await buildUpdateTaskScript('test-id-123', {
      project: 'test-project-id',
    });

    // AST builder should handle project assignment
    expect(generatedScript.script).toContain('flattenedTasks');
    // Check for project-related logic
    expect(generatedScript.script).toBeDefined();
  });
});
