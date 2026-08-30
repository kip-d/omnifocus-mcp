import { describe, it, expect } from 'vitest';
import { GuidedReviewPrompt, QUEUES_BY_MODE, DECISION_OUTCOMES } from '../../../src/prompts/gtd/GuidedReviewPrompt.js';
import { PromptArgumentError } from '../../../src/prompts/base.js';

const textOf = (p: GuidedReviewPrompt, args: Record<string, unknown>) =>
  p
    .generateMessages(args)
    .map((m) => (m.content.type === 'text' ? m.content.text : ''))
    .join('\n');

describe('GuidedReviewPrompt', () => {
  const prompt = new GuidedReviewPrompt();

  it('is named guided_review and takes only an optional mode argument', () => {
    expect(prompt.name).toBe('guided_review');
    expect(prompt.arguments).toEqual([
      { name: 'mode', description: expect.stringContaining('quick'), required: false },
    ]);
  });

  it('defaults to quick mode and lists the quick queues in order', () => {
    const text = textOf(prompt, {});
    expect(text).toContain('Mode: quick');
    const order = QUEUES_BY_MODE.quick.map((q) => text.indexOf(q));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(text).not.toContain('clarify_candidates');
  });

  it('standard and deep are supersets in the spec order', () => {
    expect(QUEUES_BY_MODE.standard.slice(0, 3)).toEqual(QUEUES_BY_MODE.quick);
    expect(QUEUES_BY_MODE.deep.slice(0, QUEUES_BY_MODE.standard.length)).toEqual(QUEUES_BY_MODE.standard);
    expect(QUEUES_BY_MODE.deep).toEqual([
      'missing_next_actions',
      'deadline_health',
      'waiting_for',
      'dormant_projects',
      'on_hold_projects',
      'wip_limits',
      'clarify_candidates',
      'review_gaps',
      'productivity_check',
    ]);
  });

  it('rejects an unknown mode loudly rather than silently falling back', () => {
    expect(() => prompt.generateMessages({ mode: 'weekly' })).toThrow(/mode must be one of quick, standard, deep/);
  });

  it('rejects an unknown mode with a PromptArgumentError so the MCP layer can map it to InvalidParams', () => {
    expect(() => prompt.generateMessages({ mode: 'weekly' })).toThrow(PromptArgumentError);
  });

  it('excludes non-detector queues from the pattern_analysis insights array but keeps them in Queue order', () => {
    for (const mode of ['standard', 'deep'] as const) {
      const text = textOf(prompt, { mode });
      const match = text.match(/insights: (\[.*?\])/);
      expect(match).not.toBeNull();
      const insights = JSON.parse(match![1]);
      expect(insights).not.toContain('on_hold_projects');
      expect(insights).not.toContain('productivity_check');

      const queueOrderLine = text.split('\n').find((l) => l.startsWith('Queue order:'));
      expect(queueOrderLine).toContain('on_hold_projects');
      if (mode === 'deep') {
        expect(queueOrderLine).toContain('productivity_check');
      }
    }
  });

  it('states the fixed decision-outcome vocabulary and that nothing scans task text', () => {
    const text = textOf(prompt, { mode: 'deep' });
    for (const o of DECISION_OUTCOMES) expect(text).toContain(`\`${o}\``);
    expect(DECISION_OUTCOMES).toEqual(['define', 'hold', 'handoff', 'drop', 'done', 'skip']);
    expect(text).toMatch(/output vocabulary/i);
    expect(text).toMatch(/one (item|decision) at a time/i);
    expect(text).toContain('GTD/Review Log.md');
  });
});
