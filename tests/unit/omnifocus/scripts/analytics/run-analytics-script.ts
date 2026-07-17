// tests/unit/omnifocus/scripts/analytics/run-analytics-script.ts
// Shared harness for the two-layer JXA→OmniJS analytics scripts: the outer JXA
// layer calls Application().evaluateJavascript(src), which we replay in a second
// vm context holding the fake OmniJS globals (flattenedTasks, Task.Status, …).
// Established on main (OMN-250/OMN-254) — edit normally; the earlier
// "keep byte-identical" note only applied while #209/#213 were both adding
// this file concurrently and no longer holds now that it's a shared file.
import vm from 'node:vm';
import { Task as FixtureTask, Project as FixtureProject } from '../../../contracts/ast/omnijs-vm-fixture.js';

export interface FakeDatabase {
  flattenedTasks?: unknown[];
  flattenedProjects?: unknown[];
  flattenedTags?: unknown[];
}

/** Live-faithful enum fakes (OMN-272): real OmniJS enum values are objects
 * whose String() form is the object tag (`[object Project.Status: Active]`),
 * NOT a friendly word — bare-string fakes hid a dead `.replace(' status')`
 * that shipped the raw tag to clients. The definitions live in the shared
 * single-source fixture (tests/unit/contracts/ast/omnijs-vm-fixture.ts,
 * "Extend HERE, not per-file"); these are aliases so fixture files reference
 * them by role. Compare by identity, never by string form. */
export const FAKE_PROJECT_STATUS = FixtureProject.Status;
export const FAKE_TASK_STATUS = FixtureTask.Status;

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
    Task: { Status: FAKE_TASK_STATUS },
    Project: { Status: FAKE_PROJECT_STATUS },
    JSON,
  };
  const outer = {
    Application: () => ({ evaluateJavascript: (src: string) => vm.runInNewContext(src, inner) }),
    JSON,
  };
  return JSON.parse(vm.runInNewContext(script, outer) as string);
}
