import { describe, it, expect } from 'vitest';
import {
  screenClarifyCandidates,
  CLARIFY_CANDIDATE_CAP,
  type CandidateTaskInput,
} from '../../../src/omnifocus/scripts/analytics/clarify-candidates-analyzer.js';

const mkTask = (over: Partial<CandidateTaskInput> & { id: string; name: string }): CandidateTaskInput => ({
  completed: false,
  tags: [],
  estimatedMinutes: null,
  children: 0,
  ...over,
});

describe('screenClarifyCandidates', () => {
  it('passes clear action tasks and flags vague ones with per-candidate screen reasons', () => {
    const result = screenClarifyCandidates(
      [
        mkTask({ id: 't1', name: 'Call dentist about appointment' }),
        mkTask({ id: 't2', name: 'stuff' }),
        mkTask({ id: 't3', name: 'Website' }),
      ],
      new Map(),
    );

    const ids = result.candidates.map((c) => c.id);
    expect(ids).not.toContain('t1');
    expect(ids).toContain('t2');
    expect(ids).toContain('t3');

    const t2 = result.candidates.find((c) => c.id === 't2')!;
    expect(t2.screen_reasons).toEqual(expect.arrayContaining(['vague_keyword', 'no_action_verb', 'single_word']));
    const t3 = result.candidates.find((c) => c.id === 't3')!;
    expect(t3.screen_reasons).toEqual(expect.arrayContaining(['no_action_verb', 'single_word']));
    expect(t3.screen_reasons).not.toContain('vague_keyword');
  });

  it('carries the full evidence bundle per candidate (ids, note, placement, dates, children)', () => {
    const result = screenClarifyCandidates(
      [
        mkTask({
          id: 't1',
          name: 'misc follow-ups',
          noteHead: 'Ask Ryan about LDAP schema',
          project: 'Infra',
          projectId: 'p1',
          tags: ['@work'],
          estimatedMinutes: 30,
          deferDate: '2026-08-01T08:00:00.000Z',
          dueDate: '2026-08-15T17:00:00.000Z',
          children: 2,
        }),
      ],
      new Map([['p1', 'Work : IT']]),
    );

    expect(result.candidates).toHaveLength(1);
    const c = result.candidates[0];
    expect(c).toMatchObject({
      id: 't1',
      name: 'misc follow-ups',
      note_head: 'Ask Ryan about LDAP schema',
      note_empty: false,
      project: 'Infra',
      project_id: 'p1',
      folder_path: 'Work : IT',
      tags: ['@work'],
      estimated_minutes: 30,
      defer_date: '2026-08-01T08:00:00.000Z',
      due_date: '2026-08-15T17:00:00.000Z',
      has_children: true,
    });
    // No verdict fields anywhere on a candidate
    expect((c as unknown as Record<string, unknown>).score).toBeUndefined();
    expect((c as unknown as Record<string, unknown>).suggestion).toBeUndefined();
  });

  it('skips completed tasks and reports screened_total honestly', () => {
    const result = screenClarifyCandidates(
      [mkTask({ id: 't1', name: 'stuff', completed: true }), mkTask({ id: 't2', name: 'things' })],
      new Map(),
    );
    expect(result.screened_total).toBe(1);
    expect(result.candidates.map((c) => c.id)).toEqual(['t2']);
  });

  it('flags empty notes — vague name AND empty note sorts ahead of vague name with a note', () => {
    const result = screenClarifyCandidates(
      [
        mkTask({ id: 'noted', name: 'stuff', noteHead: 'See meeting notes 7/1' }),
        mkTask({ id: 'bare', name: 'things' }),
      ],
      new Map(),
    );
    expect(result.candidates.map((c) => c.id)).toEqual(['bare', 'noted']);
    expect(result.candidates[0].note_empty).toBe(true);
    expect(result.candidates[1].note_empty).toBe(false);
  });

  it('caps candidates loudly — capped flag, cap value, and totals all reported', () => {
    const tasks = Array.from({ length: CLARIFY_CANDIDATE_CAP + 10 }, (_, i) =>
      mkTask({ id: `t${i}`, name: `thing${i}` }),
    );
    const result = screenClarifyCandidates(tasks, new Map());

    expect(result.candidates_total).toBe(CLARIFY_CANDIDATE_CAP + 10);
    expect(result.candidates_returned).toBe(CLARIFY_CANDIDATE_CAP);
    expect(result.candidates).toHaveLength(CLARIFY_CANDIDATE_CAP);
    expect(result.candidates_capped).toBe(true);
    expect(result.candidate_cap).toBe(CLARIFY_CANDIDATE_CAP);
  });
});
