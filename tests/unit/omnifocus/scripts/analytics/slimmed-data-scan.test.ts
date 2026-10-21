import { describe, it, expect } from 'vitest';
import { buildSlimmedDataScript } from '../../../../../src/omnifocus/scripts/analytics/slimmed-data-scan.js';

// Unwrap the JXA wrapper: the OmniJS program crosses the bridge as one JSON string literal.
function omniJsProgram(script: string): string {
  const m = script.match(/app\.evaluateJavascript\((".*")\);/s);
  expect(m).not.toBeNull();
  return JSON.parse(m![1]) as string;
}

describe('buildSlimmedDataScript', () => {
  it('interpolates the task cap and completed filter', () => {
    const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 0, includeCompleted: true }));
    expect(program).toContain('const maxTasks = 0;');
    expect(program).toContain('const includeCompleted = true;');
  });

  it('skips project root rows in both the capped loop and the availability pass (OMN-338)', () => {
    const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 3000, includeCompleted: false }));
    expect(program).toContain('if (task.project) continue;');
    expect(program).toContain('if (t.project) return;');
  });

  it('splices the shared actionable-status and project-status definitions', () => {
    const program = omniJsProgram(buildSlimmedDataScript({ maxTasks: 3000, includeCompleted: false }));
    expect(program).toContain('const ACTIONABLE = [');
    expect(program).toContain('function projectStatusString(');
    expect(program).toContain('return JSON.stringify({ tasks: tasks, projects: projects, tags: tags });');
  });
});
