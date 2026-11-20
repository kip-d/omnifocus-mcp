// tests/unit/omnifocus/scripts/analytics/overdue-no-dead-bottleneck-arrays.test.ts
// OMN-340 slice 3 tidy-up: analyze-overdue-v3.ts built a per-tag bottleneck
// accumulator (tagBottlenecks) and a per-task name list on each project
// bottleneck (projectBottlenecks[name].tasks), neither of which anything
// downstream ever read — projectList (the only consumer of projectBottlenecks)
// reads only count/blockedCount/totalDaysOverdue, and no response field,
// schema, or TS type ever carried tagBottlenecks or a project's task-name
// list (verified by grep through the script, OmniFocusAnalyzeTool.ts, and
// src/omnifocus/response-schemas/analyze.ts before deleting). This pins the
// removal so it isn't silently reintroduced.
import { describe, it, expect } from 'vitest';
import { ANALYZE_OVERDUE_V3 } from '../../../../../src/omnifocus/scripts/analytics/analyze-overdue-v3.js';

describe('analyze-overdue-v3 dead bottleneck arrays removed (OMN-340 slice 3)', () => {
  it('no longer builds tagBottlenecks', () => {
    expect(ANALYZE_OVERDUE_V3).not.toContain('tagBottlenecks');
  });

  it('no longer pushes a per-task name list onto a bottleneck bucket', () => {
    expect(ANALYZE_OVERDUE_V3).not.toContain('.tasks.push(');
    expect(ANALYZE_OVERDUE_V3).not.toContain('tasks: []');
  });

  it('still emits the fields projectList actually reads (count, blockedCount, totalDaysOverdue)', () => {
    expect(ANALYZE_OVERDUE_V3).toContain('count: 0');
    expect(ANALYZE_OVERDUE_V3).toContain('totalDaysOverdue: 0');
    expect(ANALYZE_OVERDUE_V3).toContain('blockedCount: 0');
  });
});
