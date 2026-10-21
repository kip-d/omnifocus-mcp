/**
 * parse_meeting_notes duplicate detection (OmniFocusAnalyzeTool.readScopedIncompleteTasks).
 *
 * Build a JXA→OmniJS script that reads incomplete (not completed/dropped) tasks
 * from ONE project's own subtree (`project.flattenedTasks`), resolving the project
 * name case-insensitively (status-aware: prefer a non-dropped/done match). Returns
 * raw `{ tasks: [{ name, project }] }` for execJson to wrap. The program crosses
 * the JXA→OmniJS boundary as a single JSON.stringify'd string (no nested template /
 * hand-rolled escaper — closes the OMN-111/113 injection class).
 */
export function buildProjectScopedDedupScript(projectName: string): string {
  const program =
    '(() => {' +
    `var target = ${JSON.stringify(projectName)};` +
    'var lower = target.toLowerCase();' +
    'var named = flattenedProjects.filter(function(p){ return p.name.toLowerCase() === lower; });' +
    'var live = named.filter(function(p){ return p.status !== Project.Status.Dropped && p.status !== Project.Status.Done; });' +
    // OmniFocus does not enforce unique project names: aggregate across ALL matching
    // live projects (fall back to any match only if none are live) so a duplicate in
    // a second same-named project is not missed — matching the old whole-DB read,
    // which keyed candidates by project NAME, not a single project object.
    'var matches = live.length > 0 ? live : named;' +
    'var out = [];' +
    'matches.forEach(function(p){ p.flattenedTasks.forEach(function(t){ if (t.taskStatus !== Task.Status.Completed && t.taskStatus !== Task.Status.Dropped) { out.push({ name: t.name, project: p.name }); } }); });' +
    'return JSON.stringify({ tasks: out });' +
    '})()';
  return `(() => { const app = Application('OmniFocus'); return app.evaluateJavascript(${JSON.stringify(program)}); })()`;
}
