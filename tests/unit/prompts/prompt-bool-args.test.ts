import { describe, it, expect } from 'vitest';
import { PromptArgumentError, parsePromptBool, parsePromptInt } from '../../../src/prompts/base.js';
import type { BasePrompt } from '../../../src/prompts/base.js';
import { InboxProcessingPrompt } from '../../../src/prompts/gtd/InboxProcessingPrompt.js';
import { EisenhowerMatrixPrompt } from '../../../src/prompts/gtd/eisenhower-matrix.js';
import { WeeklyReviewPrompt } from '../../../src/prompts/gtd/WeeklyReviewPrompt.js';

// OMN-357: MCP prompts/get delivers every argument as a STRING (the SDK
// validates arguments as Record<string, string>), but the prompts compared
// against boolean literals. "true" never enabled an opt-in flag, "false" never
// disabled a default-on flag, and quick_mode's branch was unreachable.

const textOf = (p: BasePrompt, args: Record<string, unknown>) =>
  p
    .toGetPromptResult(args)
    .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
    .join('\n');

describe('parsePromptBool (OMN-357)', () => {
  it.each([
    ['true', false, true],
    ['TRUE', false, true],
    [' false ', true, false],
    [true, false, true],
    [false, true, false],
    [undefined, true, true],
    [undefined, false, false],
    ['', true, true],
    [null, false, false],
  ] as const)('%j (default %j) -> %j', (raw, fallback, expected) => {
    expect(parsePromptBool(raw, fallback, 'flag', 'p')).toBe(expected);
  });

  it('anything else is a PromptArgumentError naming the prompt and argument', () => {
    expect(() => parsePromptBool('maybe', false, 'quick_mode', 'inbox_processing')).toThrow(PromptArgumentError);
    expect(() => parsePromptBool('maybe', false, 'quick_mode', 'inbox_processing')).toThrow(
      /inbox_processing: quick_mode must be "true" or "false" \(got maybe\)/,
    );
  });
});

describe('string flags reach the prompts (OMN-357)', () => {
  it('inbox_processing: quick_mode "true" returns the quick branch', () => {
    const p = new InboxProcessingPrompt();
    expect(textOf(p, { quick_mode: 'true' })).toContain('quickly process my OmniFocus inbox');
    expect(textOf(p, { quick_mode: 'false' })).not.toContain('quickly process my OmniFocus inbox');
  });

  it('inbox_processing: "false" disables the default-on flags', () => {
    const p = new InboxProcessingPrompt();
    const text = textOf(p, { auto_create_projects: 'false', suggest_contexts: 'false' });
    expect(text).toContain('Flag as project and define next actions');
    expect(text).not.toContain('Suggest appropriate context tags');
  });

  it('inbox_processing: an invalid flag is rejected, not silently defaulted', () => {
    expect(() => textOf(new InboxProcessingPrompt(), { quick_mode: 'maybe' })).toThrow(PromptArgumentError);
  });

  it('eisenhower_matrix: "false" disables process_all; "true" enables auto_flag and create_projects', () => {
    const p = new EisenhowerMatrixPrompt();
    expect(textOf(p, { process_all: 'false' })).toContain('unprocessed inbox items');
    const opted = textOf(p, { auto_flag: 'true', create_projects: 'true' });
    expect(opted).toContain("I'll automatically flag these");
    expect(opted).toContain('Create projects for multi-step items');
  });

  it('weekly_review: include_someday_maybe "false" drops the someday/maybe section', () => {
    const p = new WeeklyReviewPrompt();
    const on = textOf(p, {});
    const off = textOf(p, { include_someday_maybe: 'false' });
    expect(off.length).toBeLessThan(on.length);
  });
});

// The same stringification hits the numeric arguments: `(args.batch_size as number) || 5` stored the
// string "10" in a variable typed number, and a non-numeric value like "abc" went into the prompt text.
describe('parsePromptInt (OMN-357)', () => {
  it.each([
    ['10', 5, 10],
    [' 14 ', 7, 14],
    [3, 5, 3],
    [undefined, 5, 5],
    ['', 7, 7],
    [null, 30, 30],
  ] as const)('%j (default %j) -> %j', (raw, fallback, expected) => {
    expect(parsePromptInt(raw, fallback, 'n', 'p')).toBe(expected);
  });

  it.each(['abc', '0', '-3', '2.5', '1e2', 0, -1, 2.5, true])(
    '%j is a PromptArgumentError (positive whole numbers only)',
    (raw) => {
      expect(() => parsePromptInt(raw, 5, 'batch_size', 'inbox_processing')).toThrow(PromptArgumentError);
    },
  );

  it('the error names the prompt and the argument', () => {
    expect(() => parsePromptInt('abc', 5, 'batch_size', 'inbox_processing')).toThrow(
      /inbox_processing: batch_size must be a positive whole number \(got abc\)/,
    );
  });
});

describe('string numbers reach the prompts (OMN-357)', () => {
  it('inbox_processing: batch_size "10" sets the batch limit', () => {
    expect(textOf(new InboxProcessingPrompt(), { batch_size: '10' })).toContain('the first 10 items');
    expect(textOf(new InboxProcessingPrompt(), { batch_size: '10', quick_mode: 'true' })).toContain('limit 10');
  });

  it('inbox_processing: a non-numeric batch_size is rejected, not pasted into the prompt', () => {
    expect(() => textOf(new InboxProcessingPrompt(), { batch_size: 'abc' })).toThrow(PromptArgumentError);
  });

  it('weekly_review: review_days and stale_project_days strings reach the text', () => {
    const text = textOf(new WeeklyReviewPrompt(), { review_days: '14', stale_project_days: '60' });
    expect(text).toContain('in the last 14 days');
    expect(text).toContain('in over 60 days');
  });

  it('weekly_review: a non-numeric review_days is rejected', () => {
    expect(() => textOf(new WeeklyReviewPrompt(), { review_days: 'two weeks' })).toThrow(PromptArgumentError);
  });
});
