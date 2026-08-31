import { describe, it, expect } from 'vitest';
import { GuidedReviewPrompt, QUEUES_BY_MODE, DECISION_OUTCOMES } from '../../../src/prompts/gtd/GuidedReviewPrompt.js';
import { KNOWN_PATTERNS } from '../../../src/tools/unified/OmniFocusAnalyzeTool.js';

// Queues that are NOT pattern_analysis detectors (fetched via separate calls).
const NON_DETECTOR_QUEUES = ['on_hold_projects', 'productivity_check'];
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
      'onhold_reactivation',
      'sequential_blocked_far',
      'wip_limits',
      'clarify_candidates',
      'review_gaps',
      'productivity_check',
    ]);
  });

  it('rejects an unknown mode loudly with a PromptArgumentError so the MCP layer maps it to InvalidParams', () => {
    expect(() => prompt.generateMessages({ mode: 'weekly' })).toThrow(PromptArgumentError);
    expect(() => prompt.generateMessages({ mode: 'weekly' })).toThrow(/mode must be one of quick, standard, deep/);
  });

  it('excludes non-detector queues from the pattern_analysis insights array but keeps them in Queue order', () => {
    for (const mode of ['standard', 'deep'] as const) {
      const text = textOf(prompt, { mode });
      const match = text.match(/insights: (\[.*?\])/);
      expect(match).not.toBeNull();
      const insights = JSON.parse(match![1]);
      expect(insights).not.toContain('productivity_check');
      expect(insights).toContain('onhold_reactivation');
      expect(insights).toContain('sequential_blocked_far');

      const queueOrderLine = text.split('\n').find((l) => l.startsWith('Queue order:'));
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

describe('detector vocabulary drift guard (OMN-313 high-gate finding 3)', () => {
  it('every detector name in QUEUES_BY_MODE exists in the analyze tool KNOWN_PATTERNS', () => {
    // The retired next_actions -> clarify_candidates rename once broke callers
    // silently; this turns the next rename into a red test instead.
    for (const queues of Object.values(QUEUES_BY_MODE)) {
      for (const q of queues) {
        if (NON_DETECTOR_QUEUES.includes(q)) continue;
        expect(KNOWN_PATTERNS).toContain(q);
      }
    }
  });
});
