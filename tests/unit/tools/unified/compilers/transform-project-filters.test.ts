import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  transformProjectFilters,
  PROJECT_KEY_DISPOSITION,
} from '../../../../../src/tools/unified/compilers/transform-project-filters.js';

const reject = (input: unknown) => expect(() => transformProjectFilters(input as never)).toThrowError(z.ZodError);
const msgOf = (input: unknown): string => {
  try {
    transformProjectFilters(input as never);
  } catch (e) {
    if (!(e instanceof z.ZodError)) throw e;
    return (e as z.ZodError).issues.map((i) => i.message).join(' | ');
  }
  throw new Error('expected throw');
};

describe('transformProjectFilters — maps', () => {
  it('status maps through STATUS_TO_PROJECT', () => {
    expect(transformProjectFilters({ status: 'on_hold' })).toEqual({ status: ['onHold'] });
  });
  it('folder string → folderName; folder null → topLevelOnly', () => {
    expect(transformProjectFilters({ folder: 'Work' })).toEqual({ folderName: 'Work' });
    expect(transformProjectFilters({ folder: null })).toEqual({ topLevelOnly: true });
  });
  it('name/text map with operators', () => {
    expect(transformProjectFilters({ name: { matches: 'a|b' } })).toEqual({ name: 'a|b', nameOperator: 'MATCHES' });
    expect(transformProjectFilters({ text: { contains: 'x' } })).toEqual({ text: 'x', textOperator: 'CONTAINS' });
  });
  it('flagged maps (V7 — was silently dropped)', () => {
    expect(transformProjectFilters({ flagged: true })).toEqual({ flagged: true });
  });
  it('id alone maps', () => {
    expect(transformProjectFilters({ id: 'abc' })).toEqual({ id: 'abc' });
  });
});

describe('transformProjectFilters — completed mapping (decision record)', () => {
  it('completed:true → status [done]', () => {
    expect(transformProjectFilters({ completed: true })).toEqual({ status: ['done'] });
  });
  it('completed:false → status [active, onHold] — dropped EXCLUDED (GTD/parity reading)', () => {
    expect(transformProjectFilters({ completed: false })).toEqual({ status: ['active', 'onHold'] });
  });
  it('compatible status+completed intersect: {status:active, completed:false} → [active]', () => {
    expect(transformProjectFilters({ status: 'active', completed: false })).toEqual({ status: ['active'] });
  });
  it('disjoint status+completed reject: {completed:false, status:"dropped"} steers to status alone', () => {
    expect(msgOf({ completed: false, status: 'dropped' })).toMatch(/status: ?'dropped'|status:'dropped'/);
  });
  it('disjoint status+completed reject: {completed:true, status:"active"}', () => {
    reject({ completed: true, status: 'active' });
  });
});

describe('transformProjectFilters — id exclusivity', () => {
  it('id + any other filter key rejects with steering', () => {
    expect(msgOf({ id: 'abc', flagged: true })).toMatch(/exact lookup/i);
  });
  it('id inside AND with other conditions rejects (merge happens first)', () => {
    reject({ AND: [{ id: 'abc' }, { name: { contains: 'x' } }] });
  });
});

describe('transformProjectFilters — AND input-space merge', () => {
  it('merges supported keys across AND conditions and top level', () => {
    expect(transformProjectFilters({ flagged: true, AND: [{ status: 'active' }, { folder: 'Work' }] })).toEqual({
      flagged: true,
      status: ['active'],
      folderName: 'Work',
    });
  });
  it('AND: [] rejects', () => reject({ AND: [] }));
  it('same input key, different values across AND rejects', () => {
    reject({ AND: [{ folder: 'Work' }, { folder: 'Home' }] });
  });
  it('deep-equal duplicates merge silently', () => {
    expect(transformProjectFilters({ AND: [{ flagged: true }, { flagged: true }] })).toEqual({ flagged: true });
  });
});

describe('transformProjectFilters — rejects (P1/P3: never silently drop)', () => {
  it('OR rejects with steering naming working alternatives (OMN-156 / C18)', () => {
    const m = msgOf({ OR: [{ name: { contains: 'a' } }, { name: { contains: 'b' } }] });
    expect(m).toMatch(/not supported on projects/i);
    expect(m).toMatch(/filters\.name|filters\.text|filters\.status/);
    expect(m).toMatch(/one query per alternative/i);
  });
  it('NOT rejects with steering', () => {
    expect(msgOf({ NOT: { status: 'completed' } })).toMatch(/not supported on projects/i);
  });
  it.each([
    ['tags', { tags: { any: ['x'] } }],
    ['dueDate', { dueDate: { before: '2026-01-01' } }],
    ['deferDate', { deferDate: { after: '2026-01-01' } }],
    ['plannedDate', { plannedDate: { before: '2026-01-01' } }],
    ['completionDate', { completionDate: { before: '2026-01-01' } }],
    ['added', { added: { after: '2026-01-01' } }],
    ['estimatedMinutes', { estimatedMinutes: { lessThan: 30 } }],
    ['project', { project: 'X' }],
    ['projectId', { projectId: 'abc' }],
    ['parentTaskId', { parentTaskId: 'abc' }],
    ['inInbox', { inInbox: true }],
    ['available', { available: true }],
    ['blocked', { blocked: false }],
  ])('unsupported key %s rejects naming the key', (key, input) => {
    expect(msgOf(input)).toContain(key);
  });
  it('multiple unsupported keys are all named in one error', () => {
    const m = msgOf({ tags: { any: ['x'] }, inInbox: true });
    expect(m).toContain('tags');
    expect(m).toContain('inInbox');
  });
  it('empty filters object compiles to empty ProjectFilter (bare browse unchanged)', () => {
    expect(transformProjectFilters({})).toEqual({});
  });
  it('unknown status value rejects instead of silently widening (defense-in-depth — schema rejects upstream)', () => {
    reject({ status: 'bogus' });
  });
});

// OMN-161 F7: projects must reject empty AND items (symmetric with tasks)
describe('OMN-161 F7: projects reject empty AND items (symmetric with tasks)', () => {
  it('rejects AND:[{}] (empty item) symmetrically with tasks (OMN-161 F7)', () => {
    expect(() => transformProjectFilters({ AND: [{}] } as any)).toThrow(z.ZodError);
  });
  it('rejects an AND item with only undefined values (OMN-161 F7)', () => {
    expect(() => transformProjectFilters({ AND: [{ flagged: undefined }] } as any)).toThrow(z.ZodError);
  });
  it('still accepts a non-empty AND item', () => {
    expect(transformProjectFilters({ AND: [{ flagged: true }] } as any)).toEqual({ flagged: true });
  });
});

describe('disposition parity — every map key actually maps (MUTATION_DEFS pattern)', () => {
  const MAP_KEY_PROBES: Record<string, unknown> = {
    id: { id: 'abc' },
    status: { status: 'active' },
    completed: { completed: true },
    flagged: { flagged: true },
    folder: { folder: 'Work' },
    text: { text: { contains: 'x' } },
    name: { name: { contains: 'x' } },
  };
  const mapKeys = Object.entries(PROJECT_KEY_DISPOSITION)
    .filter(([, d]) => d === 'map')
    .map(([k]) => k);
  it('probe table covers exactly the map keys', () => {
    expect(Object.keys(MAP_KEY_PROBES).sort()).toEqual(mapKeys.sort());
  });
  it.each(mapKeys)('map key %s produces non-empty ProjectFilter output', (key) => {
    const result = transformProjectFilters(MAP_KEY_PROBES[key] as never);
    expect(Object.keys(result).length).toBeGreaterThan(0);
  });
});
