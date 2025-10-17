import { describe, it, expect } from 'vitest';
import {
  LocalDateTimeSchema,
  createDateField,
  createClearDateField,
  dateSchemaHelpers
} from '../../../../src/tools/schemas/date-schemas';

describe('Date Schemas', () => {
  describe('LocalDateTimeSchema', () => {
    it('should validate YYYY-MM-DD format', () => {
      const result = LocalDateTimeSchema.safeParse('2025-03-15');
      expect(result.success).toBe(true);
    });

    it('should validate YYYY-MM-DD HH:mm format', () => {
      const result = LocalDateTimeSchema.safeParse('2025-03-15 14:30');
      expect(result.success).toBe(true);
    });

    it('should validate YYYY-MM-DDTHH:mm:ss format', () => {
      const result = LocalDateTimeSchema.safeParse('2025-03-15T14:30:00');
      expect(result.success).toBe(true);
    });

    it('should reject invalid formats', () => {
      const result = LocalDateTimeSchema.safeParse('not-a-date');
      expect(result.success).toBe(false);
    });

    it('should reject null', () => {
      const result = LocalDateTimeSchema.safeParse(null);
      expect(result.success).toBe(false);
    });
  });

  describe('createDateField', () => {
    it('should create optional date field', () => {
      const field = createDateField('dueDate', 'When the task is due');
      const result = field.safeParse('2025-03-15');
      expect(result.success).toBe(true);
    });

    it('should allow undefined for created field', () => {
      const field = createDateField('dueDate', 'When the task is due');
      const result = field.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it('should reject invalid date for created field', () => {
      const field = createDateField('dueDate', 'When the task is due');
      const result = field.safeParse('not-a-valid-date-format');
      expect(result.success).toBe(false);
    });
  });

  describe('createClearDateField', () => {
    it('should create boolean flag for true', () => {
      const field = createClearDateField('dueDate');
      const result = field.safeParse(true);
      expect(result.success).toBe(true);
    });

    it('should create boolean flag for false', () => {
      const field = createClearDateField('dueDate');
      const result = field.safeParse(false);
      expect(result.success).toBe(true);
    });

    it('should allow undefined', () => {
      const field = createClearDateField('dueDate');
      const result = field.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it('should reject non-boolean values', () => {
      const field = createClearDateField('dueDate');
      const result = field.safeParse('true');
      expect(result.success).toBe(false);
    });
  });

  describe('dateSchemaHelpers namespace', () => {
    it('should export LocalDateTimeSchema', () => {
      expect(dateSchemaHelpers.LocalDateTimeSchema).toBeDefined();
    });

    it('should export createDateField', () => {
      expect(typeof dateSchemaHelpers.createDateField).toBe('function');
    });

    it('should export createClearDateField', () => {
      expect(typeof dateSchemaHelpers.createClearDateField).toBe('function');
    });
  });
});
