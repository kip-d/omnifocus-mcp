// tests/unit/omnifocus/scripts/analytics/run-analytics-script.ts
// Shared harness for the two-layer JXA→OmniJS analytics scripts: the outer JXA
// layer calls Application().evaluateJavascript(src), which we replay in a second
// vm context holding the fake OmniJS globals (flattenedTasks, Task.Status, …).
// Keep this file BYTE-IDENTICAL across PR branches that add it — identical
// add/add resolves cleanly at merge time.
import vm from 'node:vm';

export interface FakeDatabase {
  flattenedTasks?: unknown[];
  flattenedProjects?: unknown[];
  flattenedTags?: unknown[];
}

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
    Task: { Status: { Blocked: 'blocked', Completed: 'completed', Dropped: 'dropped' } },
    Project: { Status: { Active: 'active' } },
    JSON,
  };
  const outer = {
    Application: () => ({ evaluateJavascript: (src: string) => vm.runInNewContext(src, inner) }),
    JSON,
  };
  return JSON.parse(vm.runInNewContext(script, outer) as string);
}
