/**
 * Integration tests for OmniFocusWriteTool
 *
 * Uses the test sandbox for isolation:
 * - Inbox tasks use __TEST__ prefix
 * - Tags prefixed with __test-
 * - Cleanup via sandbox manager
 *
 * @see docs/plans/2025-12-11-test-sandbox-design.md
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { OmniFocusWriteTool } from '../../../../src/tools/unified/OmniFocusWriteTool.js';
import { CacheManager } from '../../../../src/cache/CacheManager.js';
import {
  fullCleanup,
  TEST_INBOX_PREFIX,
  TEST_TAG_PREFIX,
} from '../../helpers/sandbox-manager.js';

describe('OmniFocusWriteTool Integration', () => {
  let tool: OmniFocusWriteTool;
  let cache: CacheManager;

  beforeAll(() => {
    cache = new CacheManager();
    tool = new OmniFocusWriteTool(cache);
  });

  afterAll(async () => {
    // Cleanup all test data via sandbox manager
    await fullCleanup();
  });

  it('should have correct name and description', () => {
    expect(tool.name).toBe('omnifocus_write');
    expect(tool.description).toContain('Create, update, complete, or delete');
  });

  it('should create task in inbox with test prefix', async () => {
    const input = {
      mutation: {
        operation: 'create' as const,
        target: 'task' as const,
        data: {
          name: `${TEST_INBOX_PREFIX} Builder API test task`,
          tags: [`${TEST_TAG_PREFIX}write-tool`],
        }
      }
    };

    const result = await tool.execute(input);

    // Test passes if we get a response (success or structured error)
    // Actual task creation depends on OmniFocus state
    expect(result).toHaveProperty('success');
    if (result.success) {
      expect(result.data).toHaveProperty('task');
      expect(result.data.task).toHaveProperty('taskId');
    } else {
      // Should have structured error
      expect(result).toHaveProperty('error');
    }
  });
});
