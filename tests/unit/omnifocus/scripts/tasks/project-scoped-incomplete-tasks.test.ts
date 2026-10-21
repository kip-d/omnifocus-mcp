import { describe, it, expect } from 'vitest';
import { buildProjectScopedDedupScript } from '../../../../../src/omnifocus/scripts/tasks/project-scoped-incomplete-tasks.js';

// Unwrap the JXA wrapper: the OmniJS program crosses the bridge as one JSON string literal.
function omniJsProgram(script: string): string {
  const m = script.match(/app\.evaluateJavascript\((".*")\);/s);
  expect(m).not.toBeNull();
  return JSON.parse(m![1]) as string;
}

describe('buildProjectScopedDedupScript', () => {
  it('reads incomplete tasks from the matched projects own subtree', () => {
    const program = omniJsProgram(buildProjectScopedDedupScript('Hardware'));
    expect(program).toContain('p.flattenedTasks');
    expect(program).toContain('Task.Status.Completed');
    expect(program).toContain('Task.Status.Dropped');
  });

  it('round-trips a hostile project name as data, not code (OMN-111/113)', () => {
    const name = 'O\'Brien "quoted" \\ ${x} `tick` </script>\n';
    const program = omniJsProgram(buildProjectScopedDedupScript(name));
    const m = program.match(/var target = (".*?");var lower/s);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1])).toBe(name);
  });
});
