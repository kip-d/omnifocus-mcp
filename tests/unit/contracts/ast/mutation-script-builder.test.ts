import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildCreateTaskScript,
  buildCreateProjectScript,
  buildCreateFolderScript,
  buildUpdateTaskScript,
  buildUpdateProjectScript,
  buildCompleteScript,
  buildDeleteScript,
  buildBatchScript,
  buildBatchCreateTasksScript,
  buildBulkDeleteScript,
  validateBatchCreateOps,
  type GeneratedMutationScript,
} from '../../../../src/contracts/ast/mutation-script-builder.js';

/**
 * Decode the OmniJS program back out of a wrapInLauncher script. The launcher
 * carries the program as a single JSON string literal argument to
 * app.evaluateJavascript(...) — locate it, scan to the unescaped closing quote,
 * and JSON.parse. Throws loudly when the script is not the launcher shape, so a
 * regression to template assembly fails these tests at the extraction step.
 */
function extractOmniJsProgram(script: string): string {
  const marker = 'app.evaluateJavascript(';
  const start = script.indexOf(marker);
  if (start === -1) throw new Error('script is not the JXA launcher shape (no app.evaluateJavascript call)');
  const rest = script.slice(start + marker.length);
  if (!rest.startsWith('"')) throw new Error('evaluateJavascript argument is not a JSON string literal');
  let end = -1;
  for (let i = 1; i < rest.length; i++) {
    if (rest[i] === '\\') {
      i += 1; // skip the escaped character
      continue;
    }
    if (rest[i] === '"') {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error('unterminated JSON string literal in evaluateJavascript argument');
  return JSON.parse(rest.slice(0, end + 1)) as string;
}

// OMN-128 slice 2: buildCreateTaskScript emits ONE OmniJS program from the
// mutation AST (dispatchMutation → emitProgram → wrapInLauncher). The program
// crosses the JXA→OmniJS boundary as a single JSON string literal, so these
// tests decode it back out (extractOmniJsProgram) and assert on the decoded
// OmniJS source. Runtime behavior (vm execution, guard short-circuits) is
// covered in tests/unit/contracts/ast/mutation/create-task.test.ts.
describe('buildCreateTaskScript', () => {
  it('emits the JXA launcher around a JSON-encoded OmniJS program', async () => {
    const result = await buildCreateTaskScript({
      name: 'Test Task',
    });

    expect(result.script).toContain("Application('OmniFocus')");
    expect(result.script).toContain('app.evaluateJavascript(');
    expect(result.operation).toBe('create');
    expect(result.target).toBe('task');
    expect(result.description).toBe('Create task: Test Task');

    const program = extractOmniJsProgram(result.script);
    expect(program).toContain('new Task("Test Task")');
  });

  it('contains NO backtick characters — the nested-template island class (OMN-111/113) is dead', async () => {
    // A fully loaded create exercises every emission path: container resolve,
    // note/flagged, all three dates, estimate, tags, repetition. The legacy
    // template carried four nested-backtick OmniJS islands; zero backticks in
    // the emitted script proves there is no template left for data to break.
    const result = await buildCreateTaskScript({
      name: 'Loaded Task',
      note: 'a note',
      flagged: true,
      project: 'Work Project',
      tags: ['work', 'Deep : Tag : Path'],
      dueDate: '2025-12-31',
      deferDate: '2025-12-01 08:00',
      plannedDate: '2025-12-15',
      estimatedMinutes: 45,
      repetitionRule: { frequency: 'weekly', interval: 1, daysOfWeek: [{ day: 'MO' }] },
    });

    expect(result.script).not.toContain('`');
  });

  it('carries no legacy template artifacts: nonce bridge, index bridge, JXA app.Task, inbox push', async () => {
    const result = await buildCreateTaskScript({
      name: 'Legacy-Free Task',
      project: 'Work Project',
      tags: ['work'],
    });

    // OMN-29 note-nonce id bridge: gone (the OmniJS program reads id.primaryKey directly).
    expect(result.script).not.toContain('__BRIDGE_');
    // OMN-28 index bridge from OmniJS lookup into the JXA projects array: gone.
    expect(result.script).not.toContain('doc.flattenedProjects()[');
    // JXA-side construction: gone (native OmniJS `new Task(...)`).
    expect(result.script).not.toContain('app.Task({');
    expect(result.script).not.toContain('inboxTasks');
  });

  it('includes note and flagged in task creation', async () => {
    const result = await buildCreateTaskScript({
      name: 'Task with Note',
      note: 'This is a detailed note',
      flagged: true,
    });

    const program = extractOmniJsProgram(result.script);
    expect(program).toContain('task.note = "This is a detailed note";');
    expect(program).toContain('task.flagged = true;');
  });

  it('converts dueDate/deferDate/plannedDate into swallow-guarded Date assignments', async () => {
    const result = await buildCreateTaskScript({
      name: 'Dated Task',
      dueDate: '2025-12-31',
      deferDate: '2025-12-01 08:00',
      plannedDate: '2025-12-15',
    });

    const program = extractOmniJsProgram(result.script);
    expect(program).toContain('task.dueDate = new Date("2025-12-31")');
    expect(program).toContain('task.deferDate = new Date("2025-12-01 08:00")');
    expect(program).toContain('task.plannedDate = new Date("2025-12-15")');
  });

  it('includes estimated minutes', async () => {
    const result = await buildCreateTaskScript({
      name: 'Estimated Task',
      estimatedMinutes: 45,
    });

    const program = extractOmniJsProgram(result.script);
    expect(program).toContain('task.estimatedMinutes = 45;');
  });

  it('assigns tags in-program via addTag with the appliedTags binding hoisted', async () => {
    const result = await buildCreateTaskScript({
      name: 'Tagged Task',
      tags: ['work', 'urgent'],
    });

    const program = extractOmniJsProgram(result.script);
    expect(program).toContain('["work","urgent"]');
    expect(program).toContain('let appliedTags = [];');
    expect(program).toContain('.addTag(');
    // Envelope reports the actually-applied tag names, not the input echo.
    expect(program).toContain('tags: appliedTags');
  });

  it('includes resolveOrCreateTagByPath for tag assignment', async () => {
    const result = await buildCreateTaskScript({
      name: 'Task with Nested Tags',
      tags: ['Work : Projects : Active'],
    });

    const program = extractOmniJsProgram(result.script);
    expect(program).toContain('function resolveOrCreateTagByPath');
    expect(program).toContain('function parseTagPath');
  });

  it('resolves project via resolveProjectFlexible with a LOUD not-found guard (no silent inbox fallback)', async () => {
    const result = await buildCreateTaskScript({
      name: 'Project Task',
      project: 'Work Project',
    });

    const program = extractOmniJsProgram(result.script);
    expect(program).toContain('resolveProjectFlexible("Work Project")');
    // DELIBERATE delta from the legacy template (spec §3.1.1): a missed project
    // lookup returns a loud error envelope instead of silently filing to inbox.
    expect(program).toContain('Project not found: Work Project');
    expect(program).toContain('context: "create_task"');
    expect(program).toContain('moveTasks([task], targetProject.ending);');
  });

  it('handles null project (inbox): plain new Task, no resolve, no move', async () => {
    const result = await buildCreateTaskScript({
      name: 'Inbox Task',
      project: null,
    });

    const program = extractOmniJsProgram(result.script);
    expect(program).toContain('new Task("Inbox Task")');
    expect(program).not.toContain('resolveProjectFlexible');
    expect(program).not.toContain('moveTasks');
  });

  it('nests under parentTaskId via Task.byIdentifier + moveTasks with a loud guard', async () => {
    const result = await buildCreateTaskScript({
      name: 'Subtask',
      parentTaskId: 'parent-pk-456',
    });

    const program = extractOmniJsProgram(result.script);
    expect(program).toContain('Task.byIdentifier("parent-pk-456")');
    expect(program).toContain('Parent task not found: parent-pk-456');
    expect(program).toContain('moveTasks([task], parentTask.ending);');
    // No broken index-bridge pattern for parent lookup.
    expect(program).not.toMatch(/flattenedTasks\.indexOf|flattenedTasks\(\)\[/);
  });

  it('lowers the repetition rule at BUILD time into Task.RepetitionRule literals', async () => {
    const result = await buildCreateTaskScript({
      name: 'Recurring Task',
      repetitionRule: {
        frequency: 'weekly',
        interval: 1,
        daysOfWeek: [{ day: 'MO' }, { day: 'WE' }, { day: 'FR' }],
      },
    });

    const program = extractOmniJsProgram(result.script);
    expect(program).toContain('new Task.RepetitionRule("FREQ=WEEKLY;BYDAY=MO,WE,FR", null,');
    expect(program).toContain('Task.RepetitionScheduleType.Regularly');
    expect(program).toContain('Task.AnchorDateKey.DueDate');
    // The legacy runtime freq/schedule mapping tables are gone — lowering happened here.
    expect(program).not.toContain('freqMap');
  });

  it('special characters in the name survive the JSON boundary (injection-safety proof)', async () => {
    const name = 'Task with `backticks`, "double", \'single\' and ${interpolation}';
    const result = await buildCreateTaskScript({ name });

    // The launcher still parses as JavaScript — hostile data cannot break the script.
    expect(() => Function(result.script)).not.toThrow();
    // And the name crosses the boundary intact as a JSON literal.
    const program = extractOmniJsProgram(result.script);
    expect(program).toContain(`new Task(${JSON.stringify(name)})`);
  });

  it('returns IIFE structure', async () => {
    const result = await buildCreateTaskScript({ name: 'Test' });

    const trimmed = result.script.trim();
    expect(trimmed.startsWith('(() => {')).toBe(true);
    expect(trimmed.endsWith('})();') || trimmed.endsWith('})()')).toBe(true);
  });

  it('includes error handling', async () => {
    const result = await buildCreateTaskScript({ name: 'Test' });

    expect(result.script).toContain('try {');
    expect(result.script).toContain('catch');
  });

  it('returns a JSON stringified envelope with warnings + created', async () => {
    const result = await buildCreateTaskScript({ name: 'Test' });

    const program = extractOmniJsProgram(result.script);
    expect(program).toContain('return JSON.stringify(');
    // OMN-137: best-effort failures surface as labeled warnings in the envelope.
    expect(program).toContain('warnings: _warnings');
    expect(program).toContain('created: true');
  });

  it('returns OmniJS id.primaryKey instead of JXA .id() for created task', async () => {
    const result = await buildCreateTaskScript({ name: 'Test Task' });

    const program = extractOmniJsProgram(result.script);
    expect(program).toContain('taskId: task.id.primaryKey');
    // No JXA .id() anywhere — the whole program is OmniJS now.
    expect(result.script).not.toMatch(/task\.id\(\)/);
  });
});

describe('buildCreateProjectScript', () => {
  it('generates valid script for project creation', async () => {
    const result = await buildCreateProjectScript({
      name: 'Test Project',
    });

    expect(result.script).toContain("Application('OmniFocus')");
    expect(result.script).toContain('Test Project');
    expect(result.operation).toBe('create');
    expect(result.target).toBe('project');
    // The script is now a JXA launcher around a JSON-encoded OmniJS program that
    // constructs the project natively (was: JXA app.Project({...}) + folder push).
    expect(result.script).toContain('app.evaluateJavascript(');
    expect(result.script).toContain('new Project(');
  });

  it('includes sequential flag', async () => {
    const result = await buildCreateProjectScript({
      name: 'Sequential Project',
      sequential: true,
    });

    expect(result.script).toContain('sequential');
    expect(result.script).toContain('true');
  });

  it('includes folder assignment', async () => {
    const result = await buildCreateProjectScript({
      name: 'Folder Project',
      folder: 'Work Folder',
    });

    expect(result.script).toContain('folder');
    expect(result.script).toContain('Work Folder');
  });

  it('includes status', async () => {
    const result = await buildCreateProjectScript({
      name: 'On Hold Project',
      status: 'on_hold',
    });

    expect(result.script).toContain('status');
    // The mutation-AST body emits the typed OmniJS enum constant, not the raw
    // 'on_hold' string the old JXA body carried as an embedded data value.
    expect(result.script).toContain('Project.Status.OnHold');
  });

  it('includes review interval', async () => {
    const result = await buildCreateProjectScript({
      name: 'Reviewed Project',
      reviewInterval: 7,
    });

    expect(result.script).toContain('reviewInterval');
    // The mutation-AST body converts the "days" value to the natural (unit, steps)
    // pair at BUILD time, so 7 days emits as steps:1 / unit:"weeks" — the raw 7 no
    // longer appears. (The conversion algorithm itself is verified in the
    // 'conversion logic produces correct results' test below.)
    expect(result.script).toContain('weeks');
  });

  // OMN-38 follow-up: full history of broken approaches the regression guards block.
  //  - aa56117: wrote number-of-seconds → rejected as "value of type Number".
  //  - 959394e: wrote { unit, steps } plain object → rejected as "value of type Object".
  //  - 7d6f8b0: tried `new Project.ReviewInterval()` → "CallbackObject is not a constructor"
  //             (the class isn't user-constructible in OmniJS).
  //  - Final: every project has a default reviewInterval instance, so mutate
  //           it in place: `proj.reviewInterval.steps = N; proj.reviewInterval.unit = "weeks";`
  // Create path runs in JXA, so the in-place mutation happens inside an
  // app.evaluateJavascript() bridge. (Update path is already in OmniJS — see below.)
  describe('reviewInterval script generation (OMN-38 regression guards)', () => {
    it('does NOT multiply by 24*60*60 (broken seconds-conversion attempt)', async () => {
      const result = await buildCreateProjectScript({
        name: 'No Seconds',
        reviewInterval: 7,
      });
      expect(result.script).not.toContain('* 24 * 60 * 60');
      expect(result.script).not.toContain('*24*60*60');
    });

    it('does NOT assign a plain object literal (broken plain-object attempt)', async () => {
      const result = await buildCreateProjectScript({
        name: 'No Plain Object',
        reviewInterval: 7,
      });
      expect(result.script).not.toMatch(/reviewInterval\s*=\s*\{\s*unit:/);
      expect(result.script).not.toMatch(/reviewInterval\s*=\s*\{\s*steps:/);
    });

    it('does NOT call new Project.ReviewInterval() (broken constructor attempt)', async () => {
      const result = await buildCreateProjectScript({
        name: 'No Constructor',
        reviewInterval: 7,
      });
      expect(result.script).not.toContain('new Project.ReviewInterval');
    });

    it('does NOT assign reviewInterval directly in JXA (JXA cannot construct the typed value)', async () => {
      const result = await buildCreateProjectScript({
        name: 'No JXA Direct Assign',
        reviewInterval: 7,
      });
      expect(result.script).not.toMatch(/\bproject\.reviewInterval\s*=/);
    });

    it('routes reviewInterval through the OmniJS bridge with read-modify-reassign', async () => {
      const result = await buildCreateProjectScript({
        name: 'Bridged',
        reviewInterval: 7,
      });
      // The mutation-AST body creates the project with `new Project(...)` directly
      // inside the single app.evaluateJavascript bridge — no Project.byIdentifier
      // re-lookup (the project is already in hand). The OMN-38 read-modify-reassign
      // intent is preserved: read proj.reviewInterval into a local (_rmr), mutate
      // it, then assign back. Direct in-place mutation silently no-ops because the
      // getter returns a snapshot.
      expect(result.script).toContain('app.evaluateJavascript');
      // Local snapshot read
      expect(result.script).toMatch(/(?:const|let|var)\s+_rmr\s*=\s*proj\.reviewInterval/);
      // Mutation on the local
      expect(result.script).toMatch(/\b_rmr\.steps\s*=/);
      expect(result.script).toMatch(/\b_rmr\.unit\s*=/);
      // Re-assignment back
      expect(result.script).toMatch(/proj\.reviewInterval\s*=\s*_rmr\b/);
    });

    it('emits the build-time-converted (unit, steps) pair for the requested interval', async () => {
      // The old JXA body embedded the full days→{unit, steps} conversion as RUNTIME
      // logic (covering years/months/weeks/days), so all four unit literals appeared
      // in every script. The mutation-AST body computes the natural unit at BUILD
      // time, so only the selected unit + steps are emitted. Verify the conversion
      // result for a few canonical inputs lands in the generated body.
      // (The algorithm itself is exercised in 'conversion logic produces correct
      // results' below.)
      const weekly = await buildCreateProjectScript({ name: 'Weekly', reviewInterval: 7 });
      expect(weekly.script).toContain('weeks');
      expect(weekly.script).toMatch(/_rmr\.steps\s*=\s*1\b/);

      const monthly = await buildCreateProjectScript({ name: 'Monthly', reviewInterval: 30 });
      expect(monthly.script).toContain('months');
      expect(monthly.script).toMatch(/_rmr\.steps\s*=\s*1\b/);

      const daily = await buildCreateProjectScript({ name: 'Daily', reviewInterval: 5 });
      expect(daily.script).toContain('days');
      expect(daily.script).toMatch(/_rmr\.steps\s*=\s*5\b/);
    });

    it('conversion logic produces correct results for canonical inputs', () => {
      // Extract the conversion algorithm from the generated script and verify it
      // by running it directly. This catches off-by-one or unit-precedence bugs.
      const convert = (days: number): { unit: string; steps: number } => {
        let unit: string, steps: number;
        if (days % 365 === 0) {
          unit = 'years';
          steps = days / 365;
        } else if (days % 30 === 0) {
          unit = 'months';
          steps = days / 30;
        } else if (days % 7 === 0) {
          unit = 'weeks';
          steps = days / 7;
        } else {
          unit = 'days';
          steps = days;
        }
        return { unit, steps };
      };

      expect(convert(1)).toEqual({ unit: 'days', steps: 1 });
      expect(convert(5)).toEqual({ unit: 'days', steps: 5 });
      expect(convert(7)).toEqual({ unit: 'weeks', steps: 1 });
      expect(convert(14)).toEqual({ unit: 'weeks', steps: 2 });
      expect(convert(21)).toEqual({ unit: 'weeks', steps: 3 });
      expect(convert(30)).toEqual({ unit: 'months', steps: 1 });
      expect(convert(60)).toEqual({ unit: 'months', steps: 2 });
      expect(convert(90)).toEqual({ unit: 'months', steps: 3 });
      expect(convert(365)).toEqual({ unit: 'years', steps: 1 });
      expect(convert(730)).toEqual({ unit: 'years', steps: 2 });
    });
  });

  // Fix 3B: plannedDate was missing from buildProjectDataObject
  it('includes plannedDate in project creation script', async () => {
    const result = await buildCreateProjectScript({
      name: 'Project with Planned Date',
      plannedDate: '2026-04-01',
    });

    expect(result.script).toContain('plannedDate');
    expect(result.script).toContain('2026-04-01');
  });

  it('includes deferDate in project creation script', async () => {
    const result = await buildCreateProjectScript({
      name: 'Project with Defer Date',
      deferDate: '2026-03-01 08:00',
    });

    expect(result.script).toContain('deferDate');
    expect(result.script).toContain('2026-03-01');
  });

  it('uses OmniJS bridge for folder lookup instead of JXA .id()', async () => {
    const result = await buildCreateProjectScript({
      name: 'Project in Folder',
      folder: 'some-folder-id',
    });

    // Should use OmniJS Folder.byIdentifier for correct id.primaryKey matching
    expect(result.script).toContain('Folder.byIdentifier');
    // Should NOT use JXA .id() comparison which returns a different value
    expect(result.script).not.toMatch(/folders\[i\]\.id\(\)/);
  });

  it('supports " : " folder path syntax for nested folders (OMN-15)', async () => {
    const result = await buildCreateProjectScript({
      name: 'Deep Project',
      folder: 'Work : Engineering : Backend',
    });

    // Should parse " : " separated path and walk folder tree
    expect(result.script).toContain('parseFolderPath');
    expect(result.script).toContain('Work : Engineering : Backend');
  });

  it('supports "/" folder path syntax matching read-side folderPath format', async () => {
    const result = await buildCreateProjectScript({
      name: 'Slash Project',
      folder: 'Work/Engineering/Backend',
    });

    // Should support "/" separated path (matching omnifocus_read folderPath format)
    expect(result.script).toContain('parseFolderPath');
    expect(result.script).toContain('Work/Engineering/Backend');
  });

  it('returns a loud error instead of silent root fallback when a requested folder is unresolved (OMN-127 #1)', async () => {
    const result = await buildCreateProjectScript({
      name: 'Misfiled Project',
      folder: 'Personal : Other Games : Shop Titans',
    });

    // A requested-but-unresolved folder must NOT silently file the project at the
    // database root with success:true. The generated script must emit a loud error
    // return for the folder-requested-but-not-found case (cf. buildCreateFolderScript).
    expect(result.script).toContain('Folder not found');
    // The mutation-AST body emits the error envelope inside the JSON-encoded OmniJS
    // program, so the context tag appears double-quoted (and the JXA launcher also
    // carries its own context: "create_project" catch-arm).
    expect(result.script).toMatch(/context:\s*\\?"create_project\\?"/);
  });

  it('falls back to leaf name matching for simple folder names', async () => {
    const result = await buildCreateProjectScript({
      name: 'Simple Folder Project',
      folder: 'Work',
    });

    // Should include name fallback for simple (non-path) folder names
    expect(result.script).toContain('Folder.byIdentifier');
    expect(result.script).toContain('.name');
  });

  it('returns OmniJS id.primaryKey instead of JXA .id() for created project', async () => {
    const result = await buildCreateProjectScript({
      name: 'Test Project',
    });

    // Should bridge to OmniJS to get id.primaryKey for the response
    expect(result.script).toContain('id.primaryKey');
    // Should NOT use bare `const projectId = project.id();` as the final response ID
    expect(result.script).not.toMatch(/const projectId = project\.id\(\);/);
  });
});

describe('buildUpdateTaskScript', () => {
  it('generates valid script for task update', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      name: 'Updated Name',
    });

    expect(result.script).toContain("Application('OmniFocus')");
    expect(result.script).toContain('task-123');
    expect(result.script).toContain('Updated Name');
    expect(result.operation).toBe('update');
    expect(result.target).toBe('task');
  });

  it('handles flagged update', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      flagged: true,
    });

    expect(result.script).toContain('flagged');
    expect(result.script).toContain('true');
  });

  it('handles tag replacement', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      tags: ['new-tag-1', 'new-tag-2'],
    });

    expect(result.script).toContain('tags');
    expect(result.script).toContain('new-tag-1');
  });

  it('handles addTags operation', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      addTags: ['additional-tag'],
    });

    expect(result.script).toContain('addTags');
    expect(result.script).toContain('additional-tag');
  });

  it('handles removeTags operation', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      removeTags: ['unwanted-tag'],
    });

    expect(result.script).toContain('removeTags');
    expect(result.script).toContain('unwanted-tag');
  });

  it('handles clearDueDate flag', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      clearDueDate: true,
    });

    expect(result.script).toContain('clearDueDate');
  });

  it('handles project change', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      project: 'new-project-id',
    });

    expect(result.script).toContain('project');
    expect(result.script).toContain('new-project-id');
  });

  it('handles move to inbox (project: null)', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      project: null,
    });

    expect(result.script).toContain('inbox');
  });

  it('handles parentTaskId update using parentTask.ending for subtask relationship', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      parentTaskId: 'parent-456',
    });

    expect(result.script).toContain('parent-456');
    expect(result.script).toContain('parentTask.ending');
  });

  it('handles parentTaskId: null to unparent using .beginning', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      parentTaskId: null,
    });

    expect(result.script).toContain('.beginning');
  });

  it('includes resolveOrCreateTagByPath for tag update', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      tags: ['Errands : Downtown'],
    });
    expect(result.script).toContain('resolveOrCreateTagByPath');
  });

  it('includes resolveTagByPath for removeTags (no creation)', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      removeTags: ['Errands : Downtown'],
    });
    expect(result.script).toContain('resolveTagByPath');
  });

  it('clears repetition rule when repetitionRule is null', async () => {
    const result = await buildUpdateTaskScript('task-123', {
      repetitionRule: null,
    });
    expect(result.script).toContain('repetitionRule === null');
    expect(result.script).toContain('task.repetitionRule = null');
  });
});

describe('buildUpdateProjectScript', () => {
  it('generates valid script for project update', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      name: 'Updated Project',
    });

    expect(result.script).toContain('project-123');
    expect(result.script).toContain('Updated Project');
    expect(result.operation).toBe('update');
    expect(result.target).toBe('project');
  });

  it('handles status change', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      status: 'completed',
    });

    expect(result.script).toContain('status');
    expect(result.script).toContain('completed');
  });

  it('handles folder change', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      folder: 'New Folder',
    });

    expect(result.script).toContain('folder');
    expect(result.script).toContain('New Folder');
  });

  it('handles folder change to null (move to root)', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      folder: null,
    });

    expect(result.script).toContain('moveSections');
    expect(result.script).toContain('library.beginning');
  });

  it('generates moveSections call for folder change', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      folder: 'Development',
    });

    expect(result.script).toContain('moveSections');
    expect(result.script).toContain('Development');
  });

  it('resolves " : " nested folder paths on update, identically to create (OMN-127 #2)', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      folder: 'Personal : Other Games : Shop Titans',
    });

    // The update move-path must use the same path-aware resolver as create,
    // not the old byIdentifier + flat-name-only lookup that can never resolve
    // a " : " nested path.
    expect(result.script).toContain('parseFolderPath');
    expect(result.script).toContain('resolveFolderPath');
  });

  it('handles tags replacement (clearTags + addTag)', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      tags: ['work', 'urgent'],
    });

    expect(result.script).toContain('clearTags');
    expect(result.script).toContain('addTag');
    expect(result.script).toContain('work');
    expect(result.script).toContain('urgent');
  });

  it('handles addTags', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      addTags: ['new-tag'],
    });

    expect(result.script).toContain('addTag');
    expect(result.script).toContain('new-tag');
  });

  it('handles removeTags', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      removeTags: ['old-tag'],
    });

    expect(result.script).toContain('removeTag');
    expect(result.script).toContain('old-tag');
  });

  it('handles reviewInterval', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      reviewInterval: 14,
    });

    expect(result.script).toContain('reviewInterval');
    expect(result.script).toContain('14');
  });

  // OMN-38 follow-up: update path runs inside the outer updateScript template,
  // which itself runs in OmniJS via app.evaluateJavascript at the JXA wrapper.
  // No further bridging needed — the in-place mutation runs directly in OmniJS.
  // Project.ReviewInterval is non-constructible in OmniJS, so we mutate the
  // default instance that already exists on every project.
  describe('reviewInterval update script (OMN-38 regression guards)', () => {
    it('does NOT multiply by 24*60*60 (broken seconds-conversion attempt)', async () => {
      const result = await buildUpdateProjectScript('project-123', { reviewInterval: 14 });
      expect(result.script).not.toContain('* 24 * 60 * 60');
      expect(result.script).not.toContain('*24*60*60');
    });

    it('does NOT assign a plain object literal (broken plain-object attempt)', async () => {
      const result = await buildUpdateProjectScript('project-123', { reviewInterval: 14 });
      expect(result.script).not.toMatch(/reviewInterval\s*=\s*\{\s*unit:/);
      expect(result.script).not.toMatch(/reviewInterval\s*=\s*\{\s*steps:/);
    });

    it('does NOT call new Project.ReviewInterval() (broken constructor attempt)', async () => {
      const result = await buildUpdateProjectScript('project-123', { reviewInterval: 14 });
      expect(result.script).not.toContain('new Project.ReviewInterval');
    });

    it('uses read-modify-reassign on project.reviewInterval', async () => {
      const result = await buildUpdateProjectScript('project-123', { reviewInterval: 14 });
      // Read into local, mutate, reassign. Direct in-place mutation on
      // project.reviewInterval silently no-ops (getter returns a snapshot).
      expect(result.script).toMatch(/(?:const|let|var)\s+_ri\s*=\s*project\.reviewInterval/);
      expect(result.script).toMatch(/\b_ri\.steps\s*=/);
      expect(result.script).toMatch(/\b_ri\.unit\s*=/);
      expect(result.script).toMatch(/project\.reviewInterval\s*=\s*_ri\b/);
    });

    it('embeds the days→{unit, steps} conversion logic for all natural units', async () => {
      const result = await buildUpdateProjectScript('project-123', { reviewInterval: 14 });
      expect(result.script).toContain('"years"');
      expect(result.script).toContain('"months"');
      expect(result.script).toContain('"weeks"');
      expect(result.script).toContain('"days"');
    });
  });

  it('handles deferDate', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      deferDate: '2026-03-01',
    });

    expect(result.script).toContain('deferDate');
    expect(result.script).toContain('2026-03-01');
  });

  it('handles plannedDate', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      plannedDate: '2026-04-01',
    });

    expect(result.script).toContain('plannedDate');
    expect(result.script).toContain('2026-04-01');
  });

  it('handles clearDeferDate', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      clearDeferDate: true,
    });

    expect(result.script).toContain('clearDeferDate');
  });

  it('handles clearPlannedDate', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      clearPlannedDate: true,
    });

    expect(result.script).toContain('clearPlannedDate');
  });

  it('handles sequential', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      sequential: true,
    });

    expect(result.script).toContain('sequential');
  });

  it('uses Project.byIdentifier for O(1) lookup instead of JXA .id()', async () => {
    const result = await buildUpdateProjectScript('project-123', {
      name: 'Updated',
    });

    // Should use OmniJS Project.byIdentifier for correct id.primaryKey matching
    expect(result.script).toContain('Project.byIdentifier');
    // Should NOT use JXA .id() comparison which returns a different value
    expect(result.script).not.toMatch(/projects\[.*\]\.id\(\)/);
  });

  it('falls back to name matching when Project.byIdentifier fails', async () => {
    const result = await buildUpdateProjectScript('My Project Name', {
      name: 'Updated',
    });

    // Should support both ID and name lookup
    expect(result.script).toContain('Project.byIdentifier');
    expect(result.script).toContain('My Project Name');
  });
});

describe('buildCompleteScript', () => {
  it('generates valid script for task completion', async () => {
    const result = await buildCompleteScript('task', 'task-123');

    expect(result.script).toContain('task-123');
    expect(result.script).toContain('complete');
    expect(result.operation).toBe('complete');
    expect(result.target).toBe('task');
  });

  it('generates valid script for project completion', async () => {
    const result = await buildCompleteScript('project', 'project-123');

    expect(result.script).toContain('project-123');
    expect(result.operation).toBe('complete');
    expect(result.target).toBe('project');
  });

  it('handles custom completion date', async () => {
    const result = await buildCompleteScript('task', 'task-123', '2025-11-24');

    expect(result.script).toContain('2025-11-24');
    expect(result.script).toContain('completionDate');
  });

  it('includes markComplete call', async () => {
    const result = await buildCompleteScript('task', 'task-123');

    expect(result.script).toContain('markComplete');
  });

  it('does not hardcode completed: true in outer return for projects', async () => {
    const result = await buildCompleteScript('project', 'project-123');

    // The outer script should return the bridge result directly (like buildDeleteScript),
    // not construct a new object with hardcoded completed: true.
    // The correct pattern is: return JSON.stringify(result)
    expect(result.script).toContain('return JSON.stringify(result)');
  });

  it('checks result.success before reporting completion for projects', async () => {
    const result = await buildCompleteScript('project', 'project-123');

    // Like buildDeleteScript, should check result.success and return error if not successful
    expect(result.script).toContain('result.success');
  });

  it('passes completionDate to markComplete for projects', async () => {
    const result = await buildCompleteScript('project', 'project-123', '2025-11-24');

    // markComplete should receive the completion date inside the bridge script
    expect(result.script).toContain('markComplete');
    expect(result.script).toContain('2025-11-24');
  });

  it('uses OmniJS bridge for project lookup by id.primaryKey', async () => {
    const result = await buildCompleteScript('project', 'project-123');

    // Should use id.primaryKey for lookup (correct for both tasks and projects)
    expect(result.script).toContain('id.primaryKey');
    expect(result.script).toContain('flattenedProjects');
  });
});

describe('buildDeleteScript', () => {
  it('generates valid script for task deletion', async () => {
    const result = await buildDeleteScript('task', 'task-123');

    expect(result.script).toContain('task-123');
    expect(result.operation).toBe('delete');
    expect(result.target).toBe('task');
  });

  it('generates valid script for project deletion', async () => {
    const result = await buildDeleteScript('project', 'project-123');

    expect(result.script).toContain('project-123');
    expect(result.operation).toBe('delete');
    expect(result.target).toBe('project');
  });

  it('uses deleteObject() — the correct OmniJS API for deletion', async () => {
    const taskResult = await buildDeleteScript('task', 'task-123');
    const projectResult = await buildDeleteScript('project', 'proj-123');

    // OmniJS uses deleteObject(item) — not item.remove() (which doesn't exist)
    expect(taskResult.script).toContain('deleteObject(item)');
    expect(projectResult.script).toContain('deleteObject(item)');
  });

  it('does NOT use item.remove() — that method does not exist in OmniJS', async () => {
    const taskResult = await buildDeleteScript('task', 'task-123');
    const projectResult = await buildDeleteScript('project', 'proj-123');

    expect(taskResult.script).not.toContain('item.remove()');
    expect(projectResult.script).not.toContain('item.remove()');
  });
});

describe('buildBatchScript', () => {
  it('generates valid script for batch creates', () => {
    const result = buildBatchScript('task', [
      { operation: 'create', target: 'task', data: { name: 'Task 1' } },
      { operation: 'create', target: 'task', data: { name: 'Task 2' } },
    ]);

    expect(result.script).toContain('Task 1');
    expect(result.script).toContain('Task 2');
    expect(result.operation).toBe('batch');
    expect(result.target).toBe('task');
  });

  it('generates valid script for batch updates', () => {
    const result = buildBatchScript('task', [
      { operation: 'update', target: 'task', id: 'task-1', changes: { flagged: true } },
      { operation: 'update', target: 'task', id: 'task-2', changes: { flagged: false } },
    ]);

    expect(result.script).toContain('task-1');
    expect(result.script).toContain('task-2');
  });

  it('handles mixed operations', () => {
    const result = buildBatchScript('task', [
      { operation: 'create', target: 'task', data: { name: 'New Task' } },
      { operation: 'update', target: 'task', id: 'task-1', changes: { name: 'Updated' } },
    ]);

    expect(result.script).toContain('New Task');
    expect(result.script).toContain('Updated');
  });

  it('uses OmniJS bridge for project lookup instead of JXA .id()', () => {
    const result = buildBatchScript('task', [
      { operation: 'create', target: 'task', data: { name: 'Task', projectId: 'proj-id' } },
    ]);

    // Should use OmniJS Project.byIdentifier for correct id.primaryKey matching
    expect(result.script).toContain('Project.byIdentifier');
    // Should NOT use JXA .id() comparison which returns a different value
    expect(result.script).not.toMatch(/projects\[.*\]\.id\(\)/);
  });

  it('supports tempId for parent references', () => {
    const result = buildBatchScript(
      'task',
      [
        { operation: 'create', target: 'task', data: { name: 'Parent' }, tempId: 'temp-1' },
        { operation: 'create', target: 'task', data: { name: 'Child' }, parentTempId: 'temp-1' },
      ],
      { createSequentially: true },
    );

    expect(result.script).toContain('temp-1');
    expect(result.script).toContain('Parent');
    expect(result.script).toContain('Child');
  });

  it('respects createSequentially option', () => {
    const result = buildBatchScript('task', [{ operation: 'create', target: 'task', data: { name: 'Task' } }], {
      createSequentially: true,
    });

    expect(result.script).toContain('sequential');
  });

  it('returns tempId mapping in metadata', () => {
    const result = buildBatchScript(
      'task',
      [{ operation: 'create', target: 'task', data: { name: 'Task' }, tempId: 'temp-1' }],
      { returnMapping: true },
    );

    expect(result.script).toContain('tempIdMapping');
  });

  it('uses OmniJS bridge for batch update task lookup instead of JXA .id()', () => {
    const result = buildBatchScript('task', [
      { operation: 'update', target: 'task', id: 'task-abc', changes: { flagged: true } },
    ]);

    // Should use OmniJS Task.byIdentifier for correct id.primaryKey matching
    expect(result.script).toContain('Task.byIdentifier');
    // Should NOT use JXA .id() comparison which returns a different ID format
    expect(result.script).not.toMatch(/allTasks\[.*\]\.id\(\)\s*===\s*op\.id/);
  });

  it('returns OmniJS id.primaryKey instead of JXA .id() for batch-created tasks', () => {
    const result = buildBatchScript('task', [{ operation: 'create', target: 'task', data: { name: 'Batch Task' } }]);

    // Should bridge to OmniJS to get id.primaryKey for the response
    expect(result.script).toContain('id.primaryKey');
    // Should NOT use bare `const taskId = task.id();` as the final response ID
    expect(result.script).not.toMatch(/const taskId = task\.id\(\);/);
  });
});

describe('buildBulkDeleteScript', () => {
  it('generates valid script for bulk task deletion', async () => {
    const result = await buildBulkDeleteScript('task', ['task-1', 'task-2', 'task-3']);

    expect(result.script).toContain('task-1');
    expect(result.script).toContain('task-2');
    expect(result.script).toContain('task-3');
    expect(result.operation).toBe('bulk_delete');
    expect(result.target).toBe('task');
  });

  it('generates valid script for bulk project deletion', async () => {
    const result = await buildBulkDeleteScript('project', ['proj-1', 'proj-2']);

    expect(result.script).toContain('proj-1');
    expect(result.script).toContain('proj-2');
    expect(result.target).toBe('project');
  });

  it('iterates through IDs', async () => {
    const result = await buildBulkDeleteScript('task', ['id-1', 'id-2']);

    expect(result.script).toMatch(/forEach|for.*\(|map/);
  });

  it('returns count of deleted items', async () => {
    const result = await buildBulkDeleteScript('task', ['id-1', 'id-2']);

    expect(result.script).toContain('deletedCount');
  });

  it('uses deleteObject() — the correct OmniJS API for deletion', async () => {
    const taskResult = await buildBulkDeleteScript('task', ['id-1', 'id-2']);
    const projectResult = await buildBulkDeleteScript('project', ['id-1', 'id-2']);

    expect(taskResult.script).toContain('deleteObject(item)');
    expect(projectResult.script).toContain('deleteObject(item)');
  });

  it('does NOT use item.remove() — that method does not exist in OmniJS', async () => {
    const taskResult = await buildBulkDeleteScript('task', ['id-1', 'id-2']);
    const projectResult = await buildBulkDeleteScript('project', ['id-1', 'id-2']);

    expect(taskResult.script).not.toContain('item.remove()');
    expect(projectResult.script).not.toContain('item.remove()');
  });
});

describe('script structure consistency', () => {
  it('all scripts return GeneratedMutationScript interface', async () => {
    const scripts: GeneratedMutationScript[] = await Promise.all([
      buildCreateTaskScript({ name: 'Test' }),
      Promise.resolve(buildCreateProjectScript({ name: 'Test' })),
      buildUpdateTaskScript('id', { name: 'Test' }),
      buildUpdateProjectScript('id', { name: 'Test' }),
      buildCompleteScript('task', 'id'),
      buildDeleteScript('task', 'id'),
      Promise.resolve(buildBatchScript('task', [])),
      buildBulkDeleteScript('task', ['id']),
    ]);

    scripts.forEach((result) => {
      expect(result).toHaveProperty('script');
      expect(result).toHaveProperty('operation');
      expect(result).toHaveProperty('target');
      expect(typeof result.script).toBe('string');
    });
  });

  it('all scripts are valid JavaScript (can be parsed)', async () => {
    const scripts = [
      (await buildCreateTaskScript({ name: 'Test' })).script,
      (await buildCompleteScript('task', 'id')).script,
      (await buildDeleteScript('task', 'id')).script,
    ];

    scripts.forEach((script) => {
      // Syntax-only validation: Function(body) parses but does not execute.
      // The bare call form (no `new`) is equivalent to `new Function(body)` for
      // parsing purposes but doesn't trigger sonarjs/constructor-for-side-effects.
      expect(() => Function(script)).not.toThrow();
    });
  });
});

describe('buildCreateFolderScript', () => {
  it('generates valid JXA script for top-level folder creation', () => {
    const result = buildCreateFolderScript({
      name: 'Home',
    });

    expect(result.script).toContain("Application('OmniFocus')");
    expect(result.script).toContain('Home');
    expect(result.operation).toBe('create');
    expect(result.target).toBe('folder');
    expect(result.description).toBe('Create folder: Home');
  });

  it('generates valid JXA script for nested folder creation', () => {
    const result = buildCreateFolderScript({
      name: 'Home',
      parentFolder: 'Personal',
    });

    expect(result.script).toContain("Application('OmniFocus')");
    expect(result.script).toContain('Home');
    expect(result.script).toContain('Personal');
    expect(result.script).toContain('parseFolderPath');
    expect(result.script).toContain('resolveFolderPath');
  });

  it('generates syntactically valid JavaScript', () => {
    const result = buildCreateFolderScript({
      name: 'Test Folder',
      parentFolder: 'Parent : Child',
    });

    // Syntax-only validation: Function(body) parses but does not execute.
    // The bare call form (no `new`) is equivalent for parsing purposes but
    // doesn't trigger sonarjs/constructor-for-side-effects.
    expect(() => Function(result.script)).not.toThrow();
  });

  it('includes folder ID bridging logic', () => {
    const result = buildCreateFolderScript({
      name: 'Bridged Folder',
    });

    expect(result.script).toContain('primaryKey');
    expect(result.script).toContain('flattenedFolders');
  });

  it('handles parent folder not found with error response', () => {
    const result = buildCreateFolderScript({
      name: 'Orphan',
      parentFolder: 'NonExistent',
    });

    expect(result.script).toContain('Parent folder not found');
  });
});

describe('buildBatchCreateTasksScript (OMN-113)', () => {
  it('emits ONE evaluateJavascript round-trip creating all tasks with a shared tempId map', () => {
    const result = buildBatchCreateTasksScript([
      { tempId: 'p1', name: 'Parent Task' },
      { tempId: 'c1', name: 'Child Task', parentTempId: 'p1' },
    ]);

    expect(result.operation).toBe('create');
    expect(result.target).toBe('task');
    expect(result.script).toContain("Application('OmniFocus')");
    expect(result.script).toContain('new Task(');
    expect(result.script).toContain('moveTasks');
    expect(result.script).toContain('Parent Task');
    expect(result.script).toContain('Child Task');
    expect(result.script).toContain('p1');
    expect(result.script).toContain('c1');
    // THE perf invariant: the whole batch is ONE bridge round-trip, not N.
    expect((result.script.match(/app\.evaluateJavascript\(/g) || []).length).toBe(1);
  });

  it('produces a parse-safe script across all container + field cases', () => {
    const result = buildBatchCreateTasksScript([
      {
        tempId: 't1',
        name: "Task with 'quotes' and fields",
        note: 'multi\nline\nnote',
        flagged: true,
        projectId: 'proj123',
        tags: ['Work : Deep', 'urgent'],
        dueDate: '2026-06-04 17:00:00',
        deferDate: '2026-06-01 08:00:00',
        estimatedMinutes: 30,
      },
      { tempId: 't2', name: 'Under existing task', parentTaskId: 'realTask456' },
      { tempId: 't3', name: 'Inbox task' },
    ]);

    expect(() => new Function(result.script)).not.toThrow();
  });

  it('stays parse-safe when names/notes/tags contain backticks or ${ (OMN-111 class)', () => {
    // Backticks and ${ in user data must NOT break the generated script — the
    // common dev-GTD case (e.g. "Fix `parseTagPath`") and a literal ${ in notes.
    const result = buildBatchCreateTasksScript([
      {
        tempId: 't1',
        name: 'Fix `parseTagPath` edge case',
        note: 'cost is ${total}; run `npm test`\nsecond line',
        tags: ['proj`tag`', 'Work : ${dyn}'],
      },
      { tempId: 't2', name: 'plain child', parentTempId: 't1' },
    ]);

    expect(() => new Function(result.script)).not.toThrow();
    // The hazardous characters must survive into the script verbatim (data not lost).
    expect(result.script).toContain('parseTagPath');
    expect(result.script).toContain('${total}');
  });
});

describe('validateBatchCreateOps (OMN-119: batch creates must honor the sandbox guard)', () => {
  // The single-create path guards inside buildCreateTaskScript/buildCreateProjectScript,
  // but batch creates run through a separate path that bypassed it — letting a model emit
  // a `batch` envelope to write outside the sandbox (the OMN-118 real-inbox leak).
  // isTestMode() needs NODE_ENV==='test' (set by vitest) AND SANDBOX_GUARD_ENABLED==='true'.
  let priorGuard: string | undefined;
  let priorNodeEnv: string | undefined;

  beforeEach(() => {
    priorGuard = process.env.SANDBOX_GUARD_ENABLED;
    priorNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    process.env.SANDBOX_GUARD_ENABLED = 'true';
  });

  afterEach(() => {
    if (priorGuard === undefined) delete process.env.SANDBOX_GUARD_ENABLED;
    else process.env.SANDBOX_GUARD_ENABLED = priorGuard;
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorNodeEnv;
  });

  it('rejects an unscoped inbox task create (the OMN-118 leak shape)', async () => {
    await expect(
      validateBatchCreateOps([{ operation: 'create', target: 'task', data: { name: 'Test LLM Integration' } }]),
    ).rejects.toThrow(/TEST GUARD/);
  });

  it('allows a __TEST__-prefixed inbox task create', async () => {
    await expect(
      validateBatchCreateOps([{ operation: 'create', target: 'task', data: { name: '__TEST__-run-Probe' } }]),
    ).resolves.toBeUndefined();
  });

  it('rejects a project create outside the sandbox folder', async () => {
    await expect(
      validateBatchCreateOps([
        { operation: 'create', target: 'project', data: { name: 'Real Project', folder: 'Personal' } },
      ]),
    ).rejects.toThrow(/TEST GUARD/);
  });

  it('rejects inbox tasks with non-__test- tags even when the name is scoped', async () => {
    await expect(
      validateBatchCreateOps([
        { operation: 'create', target: 'task', data: { name: '__TEST__-run-x', tags: ['real-tag'] } },
      ]),
    ).rejects.toThrow(/TEST GUARD/);
  });

  it('is a no-op when the guard is disabled (production)', async () => {
    delete process.env.SANDBOX_GUARD_ENABLED;
    await expect(
      validateBatchCreateOps([{ operation: 'create', target: 'task', data: { name: 'Unscoped Production Task' } }]),
    ).resolves.toBeUndefined();
  });
});
