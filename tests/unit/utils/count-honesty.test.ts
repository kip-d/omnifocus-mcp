/**
 * OMN-154: applyCountHonesty — the one envelope seam where population counts
 * land. R1 (total_count = population), R2 (truncated iff offset + returned <
 * population), R3 (summary headline counts + insight line), R5 (one truncated
 * flag), R9 (no-population fallback preserves current behavior).
 */
import { describe, it, expect } from 'vitest';
import { createTaskResponseV2, createListResponseV2 } from '../../../src/utils/response-format.js';

const task = (name: string) => ({ id: `id-${name}`, name, flagged: false, completed: false });

describe('OMN-154 applyCountHonesty via createTaskResponseV2', () => {
  it('R1: total_count = population, returned_count = rows', () => {
    const r = createTaskResponseV2('tasks', [task('a'), task('b')], {}, { population: 48 });
    expect(r.metadata.total_count).toBe(48);
    expect(r.metadata.returned_count).toBe(2);
  });

  it('R2: truncated true when offset + returned < population', () => {
    const r = createTaskResponseV2('tasks', [task('a'), task('b')], {}, { population: 48 });
    expect(r.metadata.truncated).toBe(true);
  });

  it('R2: complete response has NO truncated key (absent, not false)', () => {
    const r = createTaskResponseV2('tasks', [task('a'), task('b')], {}, { population: 2 });
    expect(r.metadata.total_count).toBe(2);
    expect('truncated' in r.metadata).toBe(false);
  });

  it('R2: last page of a paginated walk reads complete (offset participates)', () => {
    // population 10, offset 8, returned 2 → 8 + 2 = 10 → complete
    const r = createTaskResponseV2('tasks', [task('a'), task('b')], {}, { population: 10, offset: 8 });
    expect('truncated' in r.metadata).toBe(false);
  });

  it('R2: offset past the end reads complete', () => {
    // population 10, offset 50, returned 0 → 50 + 0 >= 10 → complete
    const r = createTaskResponseV2('tasks', [], {}, { population: 10, offset: 50 });
    expect('truncated' in r.metadata).toBe(false);
  });

  it('R2: middle page reads truncated', () => {
    const r = createTaskResponseV2('tasks', [task('a'), task('b')], {}, { population: 10, offset: 2 });
    expect(r.metadata.truncated).toBe(true);
  });

  it('R3: summary.total_count = population; returned_count stays rows; insight line present', () => {
    const r = createTaskResponseV2('tasks', [task('a'), task('b')], {}, { population: 48 });
    expect(r.summary?.total_count).toBe(48);
    expect(r.summary?.returned_count).toBe(2);
    const insights = r.summary?.key_insights as string[] | undefined;
    expect(insights?.[0]).toBe('Showing 2 of 48 matching tasks (truncated)');
  });

  it('R3: complete response gets no insight line', () => {
    const r = createTaskResponseV2('tasks', [task('a'), task('b')], {}, { population: 2 });
    expect(r.summary?.key_insights ?? []).not.toContain('Showing 2 of 2 matching tasks (truncated)');
  });

  it('R9: no counts argument → exact current behavior (echo, no truncated)', () => {
    const r = createTaskResponseV2('tasks', [task('a'), task('b')]);
    expect(r.metadata.total_count).toBe(2);
    expect('truncated' in r.metadata).toBe(false);
  });

  it('R9: population wins over caller-supplied metadata total_count', () => {
    // countOnly injects total_count via the metadata spread; when a population
    // is ALSO supplied, the population is authoritative.
    const r = createTaskResponseV2('tasks', [], { total_count: 7 }, { population: 9 });
    expect(r.metadata.total_count).toBe(9);
  });

  it('R9: metadata spread still wins when no population (countOnly path)', () => {
    const r = createTaskResponseV2('tasks', [], { total_count: 42 });
    expect(r.metadata.total_count).toBe(42);
  });
});

describe('OMN-154 applyCountHonesty via createListResponseV2 (projects)', () => {
  const project = (name: string) => ({ id: `id-${name}`, name, status: 'active' });

  it('R1/R3: total_count and summary.total_projects = population', () => {
    const r = createListResponseV2('projects', [project('p1'), project('p2')], 'projects', {}, { population: 160 });
    expect(r.metadata.total_count).toBe(160);
    expect(r.metadata.returned_count).toBe(2);
    expect(r.metadata.truncated).toBe(true);
    expect((r.summary as Record<string, unknown>).total_projects).toBe(160);
  });

  it('R3: projects key_insight gets the truncation notice prepended', () => {
    const r = createListResponseV2('projects', [project('p1'), project('p2')], 'projects', {}, { population: 160 });
    const insight = (r.summary as Record<string, unknown>).key_insight as string;
    expect(insight.startsWith('Showing 2 of 160 matching projects (truncated)')).toBe(true);
  });

  it('R2: complete projects response has no truncated key', () => {
    const r = createListResponseV2('projects', [project('p1')], 'projects', {}, { population: 1 });
    expect('truncated' in r.metadata).toBe(false);
  });

  it('R9: no counts → echo behavior unchanged', () => {
    const r = createListResponseV2('projects', [project('p1')], 'projects');
    expect(r.metadata.total_count).toBe(1);
    expect('truncated' in r.metadata).toBe(false);
  });
});
