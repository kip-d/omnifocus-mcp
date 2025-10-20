import { describe, it, expect } from 'vitest';
import {
  mapAnchorIntentToOmniFocus,
  translateRepeatIntent,
  type RepeatUserIntent
} from '../../../../src/omnifocus/scripts/shared/repeat-translation';

describe('Repeat Translation Layer', () => {
  describe('mapAnchorIntentToOmniFocus', () => {
    it('should map when-due to DueDate + Regularly', () => {
      const result = mapAnchorIntentToOmniFocus('when-due');
      expect(result.anchorDateKey).toBe('DueDate');
      expect(result.method).toBe('Fixed');
      expect(result.scheduleType).toBe('Regularly');
    });

    it('should map when-deferred to DeferDate + FromCompletion', () => {
      const result = mapAnchorIntentToOmniFocus('when-deferred');
      expect(result.anchorDateKey).toBe('DeferDate');
      expect(result.method).toBe('DeferUntilDate');
      expect(result.scheduleType).toBe('FromCompletion');
    });

    it('should map when-marked-done to FromCompletion', () => {
      const result = mapAnchorIntentToOmniFocus('when-marked-done');
      expect(result.scheduleType).toBe('FromCompletion');
      expect(result.method).toBe('DueDate');
    });

    it('should map planned-date to PlannedDate anchor', () => {
      const result = mapAnchorIntentToOmniFocus('planned-date');
      expect(result.anchorDateKey).toBe('PlannedDate');
      expect(result.scheduleType).toBe('Regularly');
    });
  });

  describe('translateRepeatIntent', () => {
    it('should convert user intent to OmniFocus params', () => {
      const intent: RepeatUserIntent = {
        frequency: 'FREQ=DAILY;INTERVAL=3',
        anchorTo: 'when-due',
        skipMissed: false
      };
      const result = translateRepeatIntent(intent);
      expect(result.ruleString).toBe('FREQ=DAILY;INTERVAL=3');
      expect(result.anchorDateKey).toBe('DueDate');
      expect(result.catchUpAutomatically).toBe(false);
      expect(result._source).toBe('user-intent');
    });

    it('should set catchUpAutomatically from skipMissed', () => {
      const intent: RepeatUserIntent = {
        frequency: 'FREQ=DAILY',
        anchorTo: 'when-due',
        skipMissed: true
      };
      const result = translateRepeatIntent(intent);
      expect(result.catchUpAutomatically).toBe(true);
    });

    it('should default skipMissed to false', () => {
      const intent: RepeatUserIntent = {
        frequency: 'FREQ=WEEKLY',
        anchorTo: 'when-due',
        skipMissed: false
      };
      const result = translateRepeatIntent(intent);
      expect(result.catchUpAutomatically).toBe(false);
    });

    it('should translate when-marked-done intent correctly', () => {
      const intent: RepeatUserIntent = {
        frequency: 'FREQ=DAILY;INTERVAL=2',
        anchorTo: 'when-marked-done',
        skipMissed: true
      };
      const result = translateRepeatIntent(intent);
      expect(result.scheduleType).toBe('FromCompletion');
      expect(result.method).toBe('DueDate');
      expect(result.catchUpAutomatically).toBe(true);
    });

    it('should preserve all RRULE details', () => {
      const intent: RepeatUserIntent = {
        frequency: 'FREQ=MONTHLY;BYDAY=1MO;INTERVAL=1',
        anchorTo: 'when-due',
        skipMissed: false
      };
      const result = translateRepeatIntent(intent);
      expect(result.ruleString).toBe('FREQ=MONTHLY;BYDAY=1MO;INTERVAL=1');
    });
  });

});
