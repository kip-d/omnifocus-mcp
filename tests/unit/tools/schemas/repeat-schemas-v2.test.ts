import { describe, it, expect } from 'vitest';
import {
  RepeatAnchorIntentSchema,
  RepeatEndConditionSchema,
  RepeatRuleUserIntentSchema,
  RepeatRuleResponseSchema,
} from '../../../../src/tools/schemas/repeat-schemas';

describe('Repeat Schemas - LLM-Optimized (4.7+ support)', () => {
  describe('RepeatAnchorIntentSchema', () => {
    it('should accept when-due', () => {
      const result = RepeatAnchorIntentSchema.safeParse('when-due');
      expect(result.success).toBe(true);
    });

    it('should accept when-deferred', () => {
      const result = RepeatAnchorIntentSchema.safeParse('when-deferred');
      expect(result.success).toBe(true);
    });

    it('should accept when-marked-done (4.7+)', () => {
      const result = RepeatAnchorIntentSchema.safeParse('when-marked-done');
      expect(result.success).toBe(true);
    });

    it('should accept planned-date (4.7+)', () => {
      const result = RepeatAnchorIntentSchema.safeParse('planned-date');
      expect(result.success).toBe(true);
    });

    it('should default to when-due', () => {
      const result = RepeatAnchorIntentSchema.safeParse(undefined);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('when-due');
      }
    });

    it('should reject invalid anchor values', () => {
      const result = RepeatAnchorIntentSchema.safeParse('invalid-anchor');
      expect(result.success).toBe(false);
    });
  });

  describe('RepeatEndConditionSchema', () => {
    it('should accept never type', () => {
      const input = { type: 'never' };
      const result = RepeatEndConditionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept afterDate type with valid date', () => {
      const input = {
        type: 'afterDate',
        date: '2025-12-31',
      };
      const result = RepeatEndConditionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept afterDate with time', () => {
      const input = {
        type: 'afterDate',
        date: '2025-12-31 23:59',
      };
      const result = RepeatEndConditionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept afterOccurrences with count', () => {
      const input = {
        type: 'afterOccurrences',
        count: 10,
      };
      const result = RepeatEndConditionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should coerce count to number', () => {
      const input = {
        type: 'afterOccurrences',
        count: '10',
      };
      const result = RepeatEndConditionSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.count).toBe(10);
      }
    });

    it('should allow undefined (optional)', () => {
      const result = RepeatEndConditionSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it('should reject invalid type', () => {
      const input = { type: 'invalid' };
      const result = RepeatEndConditionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject afterDate without date', () => {
      const input = { type: 'afterDate' };
      const result = RepeatEndConditionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject afterOccurrences without count', () => {
      const input = { type: 'afterOccurrences' };
      const result = RepeatEndConditionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('RepeatRuleUserIntentSchema', () => {
    it('should validate basic daily repeat', () => {
      const input = {
        frequency: 'daily',
        anchorTo: 'when-due',
        skipMissed: false,
      };
      const result = RepeatRuleUserIntentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should use default anchorTo', () => {
      const input = {
        frequency: 'every 3 days',
      };
      const result = RepeatRuleUserIntentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.anchorTo).toBe('when-due');
      }
    });

    it('should use default skipMissed', () => {
      const input = {
        frequency: 'weekly',
      };
      const result = RepeatRuleUserIntentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.skipMissed).toBe(false);
      }
    });

    it('should coerce skipMissed to boolean', () => {
      const input = {
        frequency: 'daily',
        skipMissed: 'true',
      };
      const result = RepeatRuleUserIntentSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.skipMissed).toBe(true);
      }
    });

    it('should accept end condition', () => {
      const input = {
        frequency: 'daily',
        endCondition: {
          type: 'afterOccurrences',
          count: 30,
        },
      };
      const result = RepeatRuleUserIntentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept when-marked-done anchor (4.7+)', () => {
      const input = {
        frequency: 'every 2 days',
        anchorTo: 'when-marked-done',
        skipMissed: true,
      };
      const result = RepeatRuleUserIntentSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject missing frequency', () => {
      const input = {
        anchorTo: 'when-due',
      };
      const result = RepeatRuleUserIntentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid anchorTo', () => {
      const input = {
        frequency: 'daily',
        anchorTo: 'invalid-anchor',
      };
      const result = RepeatRuleUserIntentSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('RepeatRuleResponseSchema', () => {
    it('should include user-friendly fields', () => {
      const response = {
        frequency: 'daily',
        anchorTo: 'when-due',
        skipMissed: false,
      };
      const result = RepeatRuleResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should optionally include technical details', () => {
      const response = {
        frequency: 'daily',
        anchorTo: 'when-due',
        skipMissed: false,
        _details: {
          ruleString: 'FREQ=DAILY',
          method: 'Fixed',
          scheduleType: 'Regularly',
          anchorDateKey: 'DueDate',
          catchUpAutomatically: false,
        },
      };
      const result = RepeatRuleResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should allow partial technical details', () => {
      const response = {
        frequency: 'daily',
        anchorTo: 'when-due',
        skipMissed: false,
        _details: {
          ruleString: 'FREQ=DAILY',
        },
      };
      const result = RepeatRuleResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should allow undefined technical details', () => {
      const response = {
        frequency: 'daily',
        anchorTo: 'when-due',
        skipMissed: false,
      };
      const result = RepeatRuleResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });
});
