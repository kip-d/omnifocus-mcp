import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { coerceBoolean, coerceNumber } from '../../../../src/tools/schemas/coercion-helpers.js';
import { CreateDataSchema, UpdateChangesSchema } from '../../../../src/tools/unified/schemas/write-schema.js';

// OMN-329: unrecognized values must be REJECTED, not coerced. The old fallback
// `Boolean(String(val))` turned null / "null" / "unflag" into true, so
// `flagged:null` flagged a task and `clearDueDate:null` cleared its due date.

describe('coerceBoolean', () => {
  const schema = coerceBoolean();

  it.each([
    [true, true],
    [false, false],
    ['true', true],
    ['false', false],
    ['TRUE', true],
    [' False ', false],
    ['yes', true],
    ['no', false],
    ['1', true],
    ['0', false],
    [1, true],
    [0, false],
    ['', false],
  ])('accepts %j as %j', (input, expected) => {
    expect(schema.parse(input)).toBe(expected);
  });

  it.each([null, 'null', 'undefined', 'unflag', 'off', 'no thanks', 2, '2', -1, {}, []].map((v) => [v]))(
    'rejects %j',
    (input) => {
      expect(schema.safeParse(input).success).toBe(false);
    },
  );

  it('rejects a missing required key instead of defaulting to true', () => {
    expect(z.object({ b: coerceBoolean() }).safeParse({}).success).toBe(false);
  });

  it('leaves a missing optional key absent', () => {
    expect(z.object({ b: coerceBoolean().optional() }).parse({})).toEqual({});
  });
});

describe('coerceNumber', () => {
  it.each([
    [5, 5],
    ['5', 5],
    [' 25 ', 25],
    ['2.5', 2.5],
    [0, 0],
  ])('accepts %j as %j', (input, expected) => {
    expect(coerceNumber().parse(input)).toBe(expected);
  });

  it.each([null, '', '   ', true, false, 'abc', {}, []].map((v) => [v]))(
    'rejects %j instead of coercing to a number',
    (input) => {
      expect(coerceNumber().safeParse(input).success).toBe(false);
    },
  );

  it('applies the bounds of the inner schema', () => {
    const limit = coerceNumber(z.number().min(1).max(500));
    expect(limit.parse('500')).toBe(500);
    expect(limit.safeParse('0').success).toBe(false);
    expect(limit.safeParse(501).success).toBe(false);
  });
});

describe('write schemas reject null on boolean fields (OMN-329)', () => {
  it.each(['flagged', 'clearDueDate', 'clearDeferDate', 'clearPlannedDate', 'clearEstimatedMinutes', 'sequential'])(
    'update changes.%s: null is a validation error',
    (field) => {
      expect(UpdateChangesSchema.safeParse({ [field]: null }).success).toBe(false);
    },
  );

  it('update changes.flagged: "unflag" is a validation error', () => {
    expect(UpdateChangesSchema.safeParse({ flagged: 'unflag' }).success).toBe(false);
  });

  it('create data.flagged: null is a validation error', () => {
    expect(CreateDataSchema.safeParse({ name: 'x', flagged: null }).success).toBe(false);
  });

  it('still accepts the bridge-stringified forms', () => {
    expect(UpdateChangesSchema.parse({ flagged: 'false', clearDueDate: 'true' })).toMatchObject({
      flagged: false,
      clearDueDate: true,
    });
  });
});
