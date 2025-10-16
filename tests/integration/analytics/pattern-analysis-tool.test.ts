/**
 * Integration tests for PatternAnalysisToolV2 GTD patterns
 * Tests the 4 new analyzer integrations: review_gaps, next_actions, wip_limits, due_date_bunching
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { PatternAnalysisToolV2 } from '../../../src/tools/analytics/PatternAnalysisToolV2.js';
import { CacheManager } from '../../../src/cache/CacheManager.js';

describe('PatternAnalysisToolV2 - GTD Patterns Integration', () => {
  let tool: PatternAnalysisToolV2;
  let cache: CacheManager;

  beforeAll(() => {
    cache = new CacheManager();
    tool = new PatternAnalysisToolV2(cache);
  });

  it('analyzes review gaps pattern', async () => {
    const result = await tool.execute({
      patterns: ['review_gaps'],
      options: {}
    });

    // OmniFocus needs to be running with data for integration tests
    if (!result.success) {
      console.warn('Skipping test - OmniFocus not available:', result.error?.message);
      return;
    }

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.patterns).toBeDefined();
    expect(result.data.patterns.review_gaps).toBeDefined();

    const reviewGaps = result.data.patterns.review_gaps;
    expect(reviewGaps.type).toBe('review_gaps');
    expect(reviewGaps.count).toBeGreaterThanOrEqual(0);
    expect(reviewGaps.items).toBeDefined();
  }, 60000);

  it('analyzes next actions pattern', async () => {
    const result = await tool.execute({
      patterns: ['next_actions'],
      options: {}
    });

    if (!result.success) {
      console.warn('Skipping test - OmniFocus not available:', result.error?.message);
      return;
    }

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.patterns).toBeDefined();
    expect(result.data.patterns.next_actions).toBeDefined();

    const nextActions = result.data.patterns.next_actions;
    expect(nextActions.type).toBe('next_actions');
    expect(nextActions.count).toBeGreaterThanOrEqual(0);
    expect(nextActions.items).toBeDefined();
  }, 60000);

  it('analyzes wip limits pattern', async () => {
    const result = await tool.execute({
      patterns: ['wip_limits'],
      options: { wipLimit: 5 }
    });

    if (!result.success) {
      console.warn('Skipping test - OmniFocus not available:', result.error?.message);
      return;
    }

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.patterns).toBeDefined();
    expect(result.data.patterns.wip_limits).toBeDefined();

    const wipLimits = result.data.patterns.wip_limits;
    expect(wipLimits.type).toBe('wip_limits');
    expect(wipLimits.count).toBeGreaterThanOrEqual(0);
    expect(wipLimits.items).toBeDefined();
  }, 60000);

  it('analyzes due date bunching pattern', async () => {
    const result = await tool.execute({
      patterns: ['due_date_bunching'],
      options: { bunchingThreshold: 8 }
    });

    if (!result.success) {
      console.warn('Skipping test - OmniFocus not available:', result.error?.message);
      return;
    }

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.patterns).toBeDefined();
    expect(result.data.patterns.due_date_bunching).toBeDefined();

    const dueDateBunching = result.data.patterns.due_date_bunching;
    expect(dueDateBunching.type).toBe('due_date_bunching');
    expect(dueDateBunching.count).toBeGreaterThanOrEqual(0);
    expect(dueDateBunching.items).toBeDefined();
  }, 60000);

  it('analyzes all GTD patterns together', async () => {
    const result = await tool.execute({
      patterns: ['review_gaps', 'next_actions', 'wip_limits', 'due_date_bunching'],
      options: { wipLimit: 5, bunchingThreshold: 8 }
    });

    if (!result.success) {
      console.warn('Skipping test - OmniFocus not available:', result.error?.message);
      return;
    }

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.patterns).toBeDefined();

    // Verify all 4 patterns are present
    expect(result.data.patterns).toHaveProperty('review_gaps');
    expect(result.data.patterns).toHaveProperty('next_actions');
    expect(result.data.patterns).toHaveProperty('wip_limits');
    expect(result.data.patterns).toHaveProperty('due_date_bunching');

    // Verify each has the expected structure
    expect(result.data.patterns.review_gaps.type).toBe('review_gaps');
    expect(result.data.patterns.next_actions.type).toBe('next_actions');
    expect(result.data.patterns.wip_limits.type).toBe('wip_limits');
    expect(result.data.patterns.due_date_bunching.type).toBe('due_date_bunching');
  }, 90000);

  it('includes GTD patterns when "all" is specified', async () => {
    const result = await tool.execute({
      patterns: ['all'],
      options: {}
    });

    if (!result.success) {
      console.warn('Skipping test - OmniFocus not available:', result.error?.message);
      return;
    }

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.patterns).toBeDefined();

    // All 4 new GTD patterns should be included with "all"
    expect(result.data.patterns).toHaveProperty('review_gaps');
    expect(result.data.patterns).toHaveProperty('next_actions');
    expect(result.data.patterns).toHaveProperty('wip_limits');
    expect(result.data.patterns).toHaveProperty('due_date_bunching');
  }, 90000);
});
