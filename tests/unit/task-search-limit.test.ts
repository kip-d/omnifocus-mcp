import { describe, it, expect } from 'vitest';
import { buildUpdateTaskScript } from '../../src/contracts/ast/mutation-script-builder';

describe('Task Search Limit Bug Fix (AST Builder)', () => {
  it('should avoid whose() and use O(1) Task.byIdentifier lookup', async () => {
    // Test the AST-generated update script
    const generatedScript = await buildUpdateTaskScript('test-id-123', {
      name: 'Test Task',
    });

    // We explicitly avoid whose() due to performance and reliability issues
    expect(generatedScript.script).not.toContain('whose(');
    // Confirm it uses O(1) lookup via Task.byIdentifier (not slow flattenedTasks scan)
    expect(generatedScript.script).toContain('Task.byIdentifier');
  });

  it('should use O(1) lookup instead of linear scan', async () => {
    const generatedScript = await buildUpdateTaskScript('test-id-123', {
      name: 'Test Task',
    });

    // Uses Task.byIdentifier for O(1) lookup
    expect(generatedScript.script).toContain('Task.byIdentifier');
    expect(generatedScript.script).not.toContain('whose(');
  });

  it('should handle project changes in the update script', async () => {
    const generatedScript = await buildUpdateTaskScript('test-id-123', {
      project: 'test-project-id',
    });

    // AST builder should handle project assignment via bridge
    expect(generatedScript.script).toContain('Task.byIdentifier');
    // Check for project-related logic (uses Project.byIdentifier for project lookup)
    expect(generatedScript.script).toContain('Project.byIdentifier');
  });
});
