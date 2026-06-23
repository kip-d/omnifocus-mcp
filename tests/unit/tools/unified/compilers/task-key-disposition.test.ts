import { describe, it, expect } from 'vitest';
import {
  TASK_KEY_DISPOSITION,
  ON_HOLD_TASKS_REJECTION,
} from '../../../../../src/tools/unified/compilers/task-key-disposition.js';
import { FILTER_FIELD_NAMES } from '../../../../../src/tools/unified/schemas/read-schema.js';

describe('TASK_KEY_DISPOSITION parity (OMN-162; OMN-156 pattern)', () => {
  it('covers every schema filter key plus AND/OR/NOT — no more, no less', () => {
    const expected = [...FILTER_FIELD_NAMES, 'AND', 'OR', 'NOT'].sort();
    expect(Object.keys(TASK_KEY_DISPOSITION).sort()).toEqual(expected);
  });
  it('AND/OR/NOT are compose (handled structurally, never rejected as keys)', () => {
    expect(TASK_KEY_DISPOSITION.AND).toBe('compose');
    expect(TASK_KEY_DISPOSITION.OR).toBe('compose');
    expect(TASK_KEY_DISPOSITION.NOT).toBe('compose');
  });
  it('OMN-167: folder is now map (implemented); every flat key is map', () => {
    expect(TASK_KEY_DISPOSITION.folder).toBe('map');
    const nonMap = Object.entries(TASK_KEY_DISPOSITION)
      .filter(([k, d]) => d !== 'map' && !['AND', 'OR', 'NOT'].includes(k))
      .map(([k]) => k);
    expect(nonMap).toEqual([]); // no reject keys remain on tasks
  });
  it('the on_hold rejection message names the working alternative', () => {
    expect(ON_HOLD_TASKS_REJECTION).toMatch(/status:'on_hold'/);
    expect(ON_HOLD_TASKS_REJECTION).toMatch(/projectId/);
  });
});
