// tests/unit/omnifocus/scripts/analytics/run-analytics-script.ts
// Shared harness for the two-layer JXA→OmniJS analytics scripts: the outer JXA
// layer calls Application().evaluateJavascript(src), which we replay in a second
// vm context holding the fake OmniJS globals (flattenedTasks, Task.Status, …).
// Established on main (OMN-250/OMN-254) — edit normally; the earlier
// "keep byte-identical" note only applied while #209/#213 were both adding
// this file concurrently and no longer holds now that it's a shared file.
import vm from 'node:vm';

export interface FakeDatabase {
  flattenedTasks?: unknown[];
  flattenedProjects?: unknown[];
  flattenedTags?: unknown[];
}

/** Live-faithful Project.Status fakes (OMN-272): real OmniJS enum values are
 * objects whose String() form is `[object Project.Status: Active]` — NOT the
 * lowercase word. Faking them as bare strings hid a dead `.replace(' status')`
 * that shipped the raw object tag to clients. Compare by identity (as the
 * scripts do) and never rely on their string form. */
export const FAKE_PROJECT_STATUS = Object.fromEntries(
  (['Active', 'OnHold', 'Done', 'Dropped'] as const).map((name) => [
    name,
    { toString: () => `[object Project.Status: ${name}]` },
  ]),
) as Record<'Active' | 'OnHold' | 'Done' | 'Dropped', { toString(): string }>;

/** Execute a `{{options}}`-templated analytics script against a fake database
 * and parse its JSON envelope. */
export function runAnalyticsScript(
  scriptTemplate: string,
  options: Record<string, unknown>,
  db: FakeDatabase = {},
): unknown {
  const script = scriptTemplate.replace('{{options}}', JSON.stringify(options));
  const inner = {
    flattenedTasks: db.flattenedTasks ?? [],
    flattenedProjects: db.flattenedProjects ?? [],
    flattenedTags: db.flattenedTags ?? [],
    Task: {
      Status: {
        Available: 'available',
        Blocked: 'blocked',
        Completed: 'completed',
        Dropped: 'dropped',
        Next: 'next',
        DueSoon: 'dueSoon',
        Overdue: 'overdue',
      },
    },
    Project: { Status: FAKE_PROJECT_STATUS },
    JSON,
  };
  const outer = {
    Application: () => ({ evaluateJavascript: (src: string) => vm.runInNewContext(src, inner) }),
    JSON,
  };
  return JSON.parse(vm.runInNewContext(script, outer) as string);
}
