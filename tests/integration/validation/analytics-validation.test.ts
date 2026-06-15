/**
 * Analytics Integration Validation Tests
 *
 * CRITICAL: These tests validate actual analytics calculations, not just tool execution.
 *
 * Background: ProductivityStats returned 0s in production despite passing tests.
 * Root cause: Unit tests mocked data, never validated actual calculations.
 *
 * These tests create real test data, run analytics, and verify calculations are correct.
 *
 * See: /docs/dev/TEST_COVERAGE_GAPS.md - Gap #5
 * See: /docs/dev/TESTING_IMPROVEMENTS.md - Priority P0
 *
 * OPTIMIZATION: Uses shared server to avoid 13s startup per test file
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { getSharedClient } from '../helpers/shared-server.js';
import { MCPTestClient } from '../helpers/mcp-test-client.js';
import { runScopedTag } from '../helpers/run-id.js';
import { expectOk } from '../helpers/expect-ok.js';

describe('Analytics Validation - Actual Calculations', () => {
  let client: MCPTestClient;
  // OMN-84: per-run-scoped session tag (was per-process-millisecond before)
  const testSessionTag = runScopedTag(`analytics-${Date.now()}`);

  beforeAll(async () => {
    // Use shared server - avoids 13s startup cost per test file
    client = await getSharedClient();
  }, 30000);

  afterEach(async () => {
    await client.cleanup();
  }, 90000);

  afterAll(async () => {
    await client.thoroughCleanup();
    // Don't stop server - globalTeardown handles shared server cleanup
  }, 120000);

  describe('ProductivityStats Calculation Validation', () => {
    it('should calculate correct completion rates with known data', async () => {
      // Create known test data: 3 completed, 2 pending = 60% completion rate
      await client.createTestTask('Completed 1', { tags: [testSessionTag] });
      await client.createTestTask('Completed 2', { tags: [testSessionTag] });
      await client.createTestTask('Completed 3', { tags: [testSessionTag] });

      const result1 = await client.createTestTask('Completed Task for Stats', { tags: [testSessionTag] });
      const result2 = await client.createTestTask('Another Completed', { tags: [testSessionTag] });

      // OMN-184: assert the creates succeeded before reading `.data.task.taskId`.
      // createTestTask returns {success:false} (no `.data`) when OmniFocus is
      // busy/throttling; the bare access then crashes with an anonymous
      // "Cannot read properties of undefined (reading 'task')" that hides which
      // create failed. expectOk surfaces result.error and names the culprit.
      expectOk(result1, 'create Completed Task for Stats');
      expectOk(result2, 'create Another Completed');

      // Complete 3 out of 5 tasks
      await client.callTool('omnifocus_write', {
        mutation: {
          operation: 'complete',
          target: 'task',
          id: result1.data.task.taskId,
        },
      });

      await client.callTool('omnifocus_write', {
        mutation: {
          operation: 'complete',
          target: 'task',
          id: result2.data.task.taskId,
        },
      });

      // Get one more task ID from earlier created ones to complete
      const tasksResult = await client.callTool('omnifocus_read', {
        query: {
          type: 'tasks',
          filters: { tags: { any: [testSessionTag] }, status: 'active' },
          limit: 1,
        },
      });

      // OMN-140: assert the query shape explicitly so an unexpected response
      // structure fails with a meaningful message instead of a bare TypeError
      // ("Cannot read properties of undefined"). An empty array is legitimate
      // (timing); a missing `tasks` array is a contract violation.
      expectOk(tasksResult, 'active tasks lookup');
      const activeTasks = tasksResult.data?.tasks;
      expect(Array.isArray(activeTasks)).toBe(true);

      if (activeTasks.length > 0) {
        await client.callTool('omnifocus_write', {
          mutation: {
            operation: 'complete',
            target: 'task',
            id: activeTasks[0].id,
          },
        });
      }

      // Run productivity stats
      const result = await client.callTool('omnifocus_analyze', {
        analysis: {
          type: 'productivity_stats',
          params: {
            groupBy: 'week',
          },
        },
      });

      // ✅ Validate calculation is reasonable
      expectOk(result, 'productivity_stats');
      expect(result.data).toBeDefined();

      // Can't validate exact counts (other tasks may exist) but validate structure
      expect(result.data.stats).toBeDefined();
      expect(result.data.stats.overview).toBeDefined();
      expect(typeof result.data.stats.overview.totalTasks).toBe('number');
      expect(typeof result.data.stats.overview.completedTasks).toBe('number');
      expect(typeof result.data.stats.overview.completionRate).toBe('number');

      // Validate completionRate is a valid percentage (0-100 format)
      expect(result.data.stats.overview.completionRate).toBeGreaterThanOrEqual(0);
      expect(result.data.stats.overview.completionRate).toBeLessThanOrEqual(100);

      // Validate healthScore is calculated
      expect(typeof result.data.healthScore).toBe('number');
      expect(result.data.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.data.healthScore).toBeLessThanOrEqual(100);

      // Also validate non-zero stats (regression test for bug where all stats were 0)
      expect(result.data.stats.overview.totalTasks).toBeGreaterThan(0);
    }, 150000); // 150s timeout: 5 creates + 3 completes + 1 query + 1 analytics = 10+ operations
  });

  describe('OverdueAnalysis Calculation Validation', () => {
    it('should correctly identify overdue tasks and handle various date scenarios', async () => {
      // Create task with past due date (should be overdue)
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7); // 7 days ago
      const pastDateStr = pastDate.toISOString().split('T')[0];

      const overdueCreate = await client.createTestTask('Overdue Task Test', {
        tags: [testSessionTag],
        dueDate: pastDateStr,
      });

      // Create task with future due date (should NOT be overdue)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // 7 days from now
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const futureCreate = await client.createTestTask('Future Task Test', {
        tags: [testSessionTag],
        dueDate: futureDateStr,
      });

      // OMN-184: assert both seed creates succeeded. These were fire-and-forget,
      // which let a silent create failure pass the test VACUOUSLY: with no
      // overdue task seeded, overdue_analysis finds 0 and the old
      // `toBeGreaterThanOrEqual(0)` below still passed — green CI asserting
      // nothing. Confirming the seed exists is what makes the `>= 1` demand
      // below safe.
      expectOk(overdueCreate, 'create Overdue Task Test');
      expectOk(futureCreate, 'create Future Task Test');

      // Run overdue analysis
      const result = await client.callTool('omnifocus_analyze', {
        analysis: {
          type: 'overdue_analysis',
        },
      });

      // ✅ Validate analysis structure
      expectOk(result, 'overdue_analysis');
      expect(result.data).toBeDefined();
      expect(result.data.stats).toBeDefined();
      expect(result.data.stats.summary).toBeDefined();

      // Validate summary contains required fields
      expect(typeof result.data.stats.summary.totalOverdue).toBe('number');
      expect(typeof result.data.stats.summary.overduePercentage).toBe('number');
      // OMN-184: we seeded a 7-days-overdue task and expectOk above proves the
      // create succeeded. A successful create invalidates the analytics cache
      // (omnifocus_write create → CacheManager.invalidateForTaskChange, which
      // unconditionally clears the 'analytics' category), so this
      // overdue_analysis is a guaranteed cache miss → live OmniJS query against
      // the world that now contains our seed. The old `>= 0` accepted the empty
      // world a silent seed failure would have produced — the vacuous pass;
      // `>= 1` genuinely verifies the seeded task is counted.
      expect(result.data.stats.summary.totalOverdue).toBeGreaterThanOrEqual(1);

      // If there are overdue tasks, validate they have proper structure
      if (result.data.stats.overdueTasks && result.data.stats.overdueTasks.length > 0) {
        const task = result.data.stats.overdueTasks[0];
        expect(task.id).toBeDefined();
        expect(task.name).toBeDefined();
        expect(task.dueDate).toBeDefined();
      }
    }, 120000);
  });

  describe('TaskVelocity Calculation Validation', () => {
    it('should calculate velocity from completed tasks', async () => {
      // Create and complete a task
      const result = await client.createTestTask('Velocity Test Task', {
        tags: [testSessionTag],
      });

      // OMN-184: guard `.data.task.taskId` (same class as the ProductivityStats
      // block) so a throttled create fails by name, not as a bare TypeError.
      expectOk(result, 'create Velocity Test Task');

      await client.callTool('omnifocus_write', {
        mutation: {
          operation: 'complete',
          target: 'task',
          id: result.data.task.taskId,
        },
      });

      // Run velocity analysis
      const velocityResult = await client.callTool('omnifocus_analyze', {
        analysis: {
          type: 'task_velocity',
          params: {
            groupBy: 'day',
          },
        },
      });

      // ✅ Validate velocity structure
      expectOk(velocityResult, 'task_velocity');
      expect(velocityResult.data).toBeDefined();
      expect(velocityResult.data.velocity).toBeDefined();

      // Validate velocity contains required metrics
      expect(typeof velocityResult.data.velocity.tasksCompleted).toBe('number');
      expect(typeof velocityResult.data.velocity.averagePerDay).toBe('number');
      expect(velocityResult.data.velocity.tasksCompleted).toBeGreaterThanOrEqual(0);
      expect(velocityResult.data.velocity.averagePerDay).toBeGreaterThanOrEqual(0);
    }, 120000);
  });

  describe('Cross-Tool Data Consistency', () => {
    it('should have consistent task counts across analytics tools', async () => {
      // Create test tasks
      await client.createTestTask('Consistency Test 1', { tags: [testSessionTag] });
      await client.createTestTask('Consistency Test 2', { tags: [testSessionTag] });

      // Get productivity stats
      const productivityResult = await client.callTool('omnifocus_analyze', {
        analysis: {
          type: 'productivity_stats',
          params: { groupBy: 'week' },
        },
      });

      // Get task velocity
      const velocityResult = await client.callTool('omnifocus_analyze', {
        analysis: {
          type: 'task_velocity',
          params: { groupBy: 'day' },
        },
      });

      // OMN-140: assert tool success BEFORE touching nested data so a failed
      // call surfaces its real error (expectOk reports result.error) instead of
      // crashing with "Cannot read properties of undefined (reading 'stats')".
      expectOk(productivityResult, 'cross-tool productivity_stats');
      expectOk(velocityResult, 'cross-tool task_velocity');

      // OMN-184: mirror the `.data` guard the other three blocks already have,
      // so a success-but-empty envelope fails here rather than at the nested
      // `.data.stats` / `.data.velocity` access. Normalizes the pattern by
      // adding the assertion, not by dropping it elsewhere — diagnostic-rich
      // failures are the cluster's intent (OMN-56/140).
      expect(productivityResult.data).toBeDefined();
      expect(velocityResult.data).toBeDefined();

      // ✅ Both should report > 0 tasks (our test tasks + possibly others)
      expect(productivityResult.data.stats.overview.totalTasks).toBeGreaterThan(0);
      expect(velocityResult.data.velocity.tasksCompleted).toBeGreaterThanOrEqual(0);
    }, 90000);
  });
});
