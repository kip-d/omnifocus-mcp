import { describe, expect, it } from 'vitest';
import { ExecStrategy, ScriptBuilder } from '../../../src/scripts/script-builder.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert the script contains the PARAMS injection line */
function assertHasParams(source: string): void {
  expect(source).toMatch(/const PARAMS = \{.*\};/);
}

/** Assert no whose()/where() calls -- they cause 25+ second timeouts */
function assertNoWhoseOrWhere(source: string): void {
  expect(source).not.toMatch(/\.whose\s*\(/);
  expect(source).not.toMatch(/\.where\s*\(/);
}

/** Assert no template placeholders */
function assertNoTemplatePlaceholders(source: string): void {
  expect(source).not.toMatch(/\{\{.*?\}\}/);
}

/** Assert the script uses for loops (not whose/where) */
function assertUsesForLoops(source: string): void {
  expect(source).toMatch(/for\s*\(\s*var\s+\w+/);
}

/**
 * Assert that the PARAMS JSON contains a key-value pair.
 * Works for both JXA-wrapped (direct) and bridge-wrapped (escaped quotes) scripts.
 * For bridge scripts, PARAMS are inside JSON.stringify'd string, so quotes are escaped.
 */
function assertParamContains(source: string, jsonFragment: string): void {
  // Try direct match first (JXA wrap)
  if (source.includes(jsonFragment)) return;
  // Try escaped match (bridge wrap -- quotes become \")
  const escaped = jsonFragment.replace(/"/g, '\\"');
  expect(source).toContain(escaped);
}

// ---------------------------------------------------------------------------
// listTasks
// ---------------------------------------------------------------------------

describe('ScriptBuilder.listTasks', () => {
  it('generates OMNIJS_BRIDGE strategy', () => {
    const script = ScriptBuilder.listTasks();
    expect(script.strategy).toBe(ExecStrategy.OMNIJS_BRIDGE);
  });

  it('contains PARAMS injection', () => {
    const script = ScriptBuilder.listTasks({ limit: 10 });
    assertHasParams(script.source);
  });

  it('never uses whose() or where()', () => {
    const script = ScriptBuilder.listTasks();
    assertNoWhoseOrWhere(script.source);
  });

  it('uses for loops for iteration', () => {
    const script = ScriptBuilder.listTasks();
    assertUsesForLoops(script.source);
  });

  it('includes limit in PARAMS', () => {
    const script = ScriptBuilder.listTasks({ limit: 25 });
    assertParamContains(script.source, '"limit":25');
  });

  it('defaults completed to false', () => {
    const script = ScriptBuilder.listTasks();
    assertParamContains(script.source, '"completed":false');
  });

  it('handles null project as inbox filter', () => {
    const script = ScriptBuilder.listTasks({ project: null });
    // null project should appear in PARAMS as null
    assertParamContains(script.source, '"project":null');
    // Script body checks PARAMS.project === null for inbox
    expect(script.source).toContain('PARAMS.project === null');
  });

  it('includes filter parameters in PARAMS', () => {
    const script = ScriptBuilder.listTasks({
      flagged: true,
      tag: 'urgent',
      search: 'meeting',
      dueBefore: '2026-03-01',
    });
    assertParamContains(script.source, '"flagged":true');
    assertParamContains(script.source, '"tag":"urgent"');
    assertParamContains(script.source, '"search":"meeting"');
    assertParamContains(script.source, '"dueBefore":"2026-03-01"');
  });

  it('supports array tags', () => {
    const script = ScriptBuilder.listTasks({
      tag: ['urgent', 'home'],
      tagMode: 'any',
    });
    assertParamContains(script.source, '"tag":["urgent","home"]');
    assertParamContains(script.source, '"tagMode":"any"');
  });

  it('supports offset for pagination', () => {
    const script = ScriptBuilder.listTasks({ offset: 10, limit: 5 });
    assertParamContains(script.source, '"offset":10');
    assertParamContains(script.source, '"limit":5');
  });

  it('uses OmniJS property access (no parentheses) for property reads', () => {
    const script = ScriptBuilder.listTasks();
    // OmniJS pattern: t.id.primaryKey, t.name, t.flagged, t.dueDate (property access)
    expect(script.source).toContain('t.id.primaryKey');
    expect(script.source).toContain('t.name');
    expect(script.source).toContain('t.flagged');
    expect(script.source).toContain('t.dueDate');
    // Should NOT use JXA method calls
    expect(script.source).not.toContain('t.id()');
    expect(script.source).not.toContain('t.name()');
    expect(script.source).not.toContain('t.completed()');
    expect(script.source).not.toContain('t.flagged()');
    expect(script.source).not.toContain('t.dueDate()');
  });

  it('wraps in OmniJS bridge with evaluateJavascript', () => {
    const script = ScriptBuilder.listTasks();
    expect(script.source).toContain('(() => {');
    expect(script.source).toContain('Application("OmniFocus")');
    expect(script.source).toContain('evaluateJavascript');
    // Should NOT use app.defaultDocument() (that's JXA-only)
    expect(script.source).not.toContain('app.defaultDocument()');
  });

  it('returns JSON.stringify result', () => {
    const script = ScriptBuilder.listTasks();
    expect(script.source).toContain('JSON.stringify');
  });
});

// ---------------------------------------------------------------------------
// getTask
// ---------------------------------------------------------------------------

describe('ScriptBuilder.getTask', () => {
  it('generates OMNIJS_BRIDGE strategy', () => {
    const script = ScriptBuilder.getTask('abc123');
    expect(script.strategy).toBe(ExecStrategy.OMNIJS_BRIDGE);
  });

  it('contains PARAMS with task ID', () => {
    const script = ScriptBuilder.getTask('abc123');
    assertHasParams(script.source);
    assertParamContains(script.source, '"id":"abc123"');
  });

  it('uses Task.byIdentifier for O(1) lookup', () => {
    const script = ScriptBuilder.getTask('abc123');
    expect(script.source).toContain('Task.byIdentifier(PARAMS.id)');
  });

  it('returns full task object with all properties', () => {
    const script = ScriptBuilder.getTask('abc123');
    expect(script.source).toContain('taskObj.id');
    expect(script.source).toContain('taskObj.name');
    expect(script.source).toContain('taskObj.completed');
    expect(script.source).toContain('taskObj.flagged');
    expect(script.source).toContain('taskObj.dueDate');
    expect(script.source).toContain('taskObj.tags');
    expect(script.source).toContain('taskObj.project');
  });
});

// ---------------------------------------------------------------------------
// createTask
// ---------------------------------------------------------------------------

describe('ScriptBuilder.createTask', () => {
  it('generates JXA_DIRECT for simple task', () => {
    const script = ScriptBuilder.createTask({ name: 'Test task' });
    expect(script.strategy).toBe(ExecStrategy.JXA_DIRECT);
  });

  it('generates HYBRID when tags are provided', () => {
    const script = ScriptBuilder.createTask({
      name: 'Tagged task',
      tags: ['urgent', 'work'],
    });
    expect(script.strategy).toBe(ExecStrategy.HYBRID);
  });

  it('generates HYBRID when plannedDate is provided', () => {
    const script = ScriptBuilder.createTask({
      name: 'Planned task',
      plannedDate: '2026-03-01 08:00',
    });
    expect(script.strategy).toBe(ExecStrategy.HYBRID);
  });

  it('generates JXA_DIRECT when tags array is empty', () => {
    const script = ScriptBuilder.createTask({
      name: 'No tags',
      tags: [],
    });
    expect(script.strategy).toBe(ExecStrategy.JXA_DIRECT);
  });

  it('HYBRID script uses evaluateJavascript for bridge', () => {
    const script = ScriptBuilder.createTask({
      name: 'Bridge task',
      tags: ['test'],
      plannedDate: '2026-03-01 08:00',
    });
    expect(script.source).toContain('evaluateJavascript');
  });

  it('simple script does not use evaluateJavascript', () => {
    const script = ScriptBuilder.createTask({ name: 'Simple task' });
    expect(script.source).not.toContain('evaluateJavascript');
  });

  it('HYBRID uses OmniJS patterns inside bridge (no parens for property access)', () => {
    const script = ScriptBuilder.createTask({
      name: 'Bridge task',
      tags: ['test'],
    });
    // Inside the bridge string, OmniJS uses: Task.byIdentifier, flattenedTags.byName, t.addTag
    expect(script.source).toContain('Task.byIdentifier');
    expect(script.source).toContain('flattenedTags.byName');
    expect(script.source).toContain('t.addTag');
  });

  it('includes task name in PARAMS', () => {
    const script = ScriptBuilder.createTask({ name: 'My task' });
    assertParamContains(script.source, '"name":"My task"');
  });
});

// ---------------------------------------------------------------------------
// updateTask
// ---------------------------------------------------------------------------

describe('ScriptBuilder.updateTask', () => {
  it('generates OMNIJS_BRIDGE for simple changes', () => {
    const script = ScriptBuilder.updateTask('abc123', {
      name: 'Updated name',
      flagged: true,
    });
    expect(script.strategy).toBe(ExecStrategy.OMNIJS_BRIDGE);
  });

  it('generates OMNIJS_BRIDGE for tag changes', () => {
    const script = ScriptBuilder.updateTask('abc123', {
      tags: ['new-tag'],
    });
    expect(script.strategy).toBe(ExecStrategy.OMNIJS_BRIDGE);
  });

  it('generates OMNIJS_BRIDGE for addTags', () => {
    const script = ScriptBuilder.updateTask('abc123', {
      addTags: ['extra'],
    });
    expect(script.strategy).toBe(ExecStrategy.OMNIJS_BRIDGE);
  });

  it('generates OMNIJS_BRIDGE for removeTags', () => {
    const script = ScriptBuilder.updateTask('abc123', {
      removeTags: ['old'],
    });
    expect(script.strategy).toBe(ExecStrategy.OMNIJS_BRIDGE);
  });

  it('generates OMNIJS_BRIDGE for plannedDate', () => {
    const script = ScriptBuilder.updateTask('abc123', {
      plannedDate: '2026-03-01 08:00',
    });
    expect(script.strategy).toBe(ExecStrategy.OMNIJS_BRIDGE);
  });

  it('generates OMNIJS_BRIDGE for repetitionRule', () => {
    const script = ScriptBuilder.updateTask('abc123', {
      repetitionRule: 'FREQ=DAILY',
    });
    expect(script.strategy).toBe(ExecStrategy.OMNIJS_BRIDGE);
  });

  it('all update scripts use evaluateJavascript (OmniJS bridge)', () => {
    const scriptBridge = ScriptBuilder.updateTask('abc123', { tags: ['test'] });
    expect(scriptBridge.source).toContain('evaluateJavascript');

    const scriptSimple = ScriptBuilder.updateTask('abc123', { name: 'New name' });
    expect(scriptSimple.source).toContain('evaluateJavascript');
  });

  it('bridge uses clearTags before setting tags', () => {
    const script = ScriptBuilder.updateTask('abc123', { tags: ['a', 'b'] });
    expect(script.source).toContain('clearTags');
  });

  it('null plannedDate clears the date via bridge', () => {
    const script = ScriptBuilder.updateTask('abc123', { plannedDate: null });
    expect(script.strategy).toBe(ExecStrategy.OMNIJS_BRIDGE);
    expect(script.source).toContain('evaluateJavascript');
  });

  it('uses Task.byIdentifier for O(1) lookup', () => {
    const scriptSimple = ScriptBuilder.updateTask('abc123', { name: 'test' });
    expect(scriptSimple.source).toContain('Task.byIdentifier(PARAMS.id)');

    const scriptBridge = ScriptBuilder.updateTask('abc123', { tags: ['test'] });
    expect(scriptBridge.source).toContain('Task.byIdentifier(PARAMS.id)');
  });
});

// ---------------------------------------------------------------------------
// completeTask
// ---------------------------------------------------------------------------

describe('ScriptBuilder.completeTask', () => {
  it('generates OMNIJS_BRIDGE strategy', () => {
    const script = ScriptBuilder.completeTask('abc123');
    expect(script.strategy).toBe(ExecStrategy.OMNIJS_BRIDGE);
  });

  it('contains PARAMS with task ID', () => {
    const script = ScriptBuilder.completeTask('abc123');
    assertHasParams(script.source);
    assertParamContains(script.source, '"id":"abc123"');
  });

  it('uses OmniJS bridge to mark task complete', () => {
    const script = ScriptBuilder.completeTask('abc123');
    expect(script.source).toContain('evaluateJavascript');
    expect(script.source).toContain('markComplete');
  });

  it('uses Task.byIdentifier for O(1) lookup', () => {
    const script = ScriptBuilder.completeTask('abc123');
    expect(script.source).toContain('Task.byIdentifier(PARAMS.id)');
  });
});

// ---------------------------------------------------------------------------
// deleteTask
// ---------------------------------------------------------------------------

describe('ScriptBuilder.deleteTask', () => {
  it('generates OMNIJS_BRIDGE strategy', () => {
    const script = ScriptBuilder.deleteTask('abc123');
    expect(script.strategy).toBe(ExecStrategy.OMNIJS_BRIDGE);
  });

  it('contains PARAMS with task ID', () => {
    const script = ScriptBuilder.deleteTask('abc123');
    assertHasParams(script.source);
    assertParamContains(script.source, '"id":"abc123"');
  });

  it('uses deleteObject in OmniJS bridge', () => {
    const script = ScriptBuilder.deleteTask('abc123');
    expect(script.source).toContain('deleteObject');
  });

  it('uses Task.byIdentifier for O(1) lookup', () => {
    const script = ScriptBuilder.deleteTask('abc123');
    expect(script.source).toContain('Task.byIdentifier(PARAMS.id)');
  });
});

// ---------------------------------------------------------------------------
// listProjects
// ---------------------------------------------------------------------------

describe('ScriptBuilder.listProjects', () => {
  it('generates OMNIJS_BRIDGE strategy', () => {
    const script = ScriptBuilder.listProjects();
    expect(script.strategy).toBe(ExecStrategy.OMNIJS_BRIDGE);
  });

  it('uses flattenedProjects (OmniJS property access)', () => {
    const script = ScriptBuilder.listProjects();
    expect(script.source).toContain('flattenedProjects');
    // Should NOT use JXA method call pattern
    expect(script.source).not.toContain('flattenedProjects()');
  });

  it('supports status filter', () => {
    const script = ScriptBuilder.listProjects({ status: 'active' });
    assertParamContains(script.source, '"status":"active"');
  });

  it('supports folder filter', () => {
    const script = ScriptBuilder.listProjects({ folder: 'Work' });
    assertParamContains(script.source, '"folder":"Work"');
  });

  it('uses Project.Status enum for status comparison', () => {
    const script = ScriptBuilder.listProjects();
    expect(script.source).toContain('Project.Status.Active');
    expect(script.source).toContain('Project.Status.Done');
    expect(script.source).toContain('Project.Status.Dropped');
  });
});

// ---------------------------------------------------------------------------
// listTags
// ---------------------------------------------------------------------------

describe('ScriptBuilder.listTags', () => {
  it('generates OMNIJS_BRIDGE strategy', () => {
    const script = ScriptBuilder.listTags();
    expect(script.strategy).toBe(ExecStrategy.OMNIJS_BRIDGE);
  });

  it('uses flattenedTags (OmniJS property access)', () => {
    const script = ScriptBuilder.listTags();
    expect(script.source).toContain('flattenedTags');
    // Should NOT use JXA method call pattern
    expect(script.source).not.toContain('flattenedTags()');
  });

  it('returns tag objects with id, name, available count using OmniJS syntax', () => {
    const script = ScriptBuilder.listTags();
    expect(script.source).toContain('tg.id.primaryKey');
    expect(script.source).toContain('tg.name');
    // Should NOT use JXA method calls
    expect(script.source).not.toContain('tg.id()');
    expect(script.source).not.toContain('tg.name()');
  });
});

// ---------------------------------------------------------------------------
// listFolders
// ---------------------------------------------------------------------------

describe('ScriptBuilder.listFolders', () => {
  it('generates OMNIJS_BRIDGE strategy', () => {
    const script = ScriptBuilder.listFolders();
    expect(script.strategy).toBe(ExecStrategy.OMNIJS_BRIDGE);
  });

  it('builds folder hierarchy with paths using OmniJS syntax', () => {
    const script = ScriptBuilder.listFolders();
    expect(script.source).toContain('processFolder');
    // OmniJS uses forEach with property access, not JXA folder.folders()
    expect(script.source).toContain('folder.folders.forEach');
  });

  it('does not use JXA method calls for folder properties', () => {
    const script = ScriptBuilder.listFolders();
    // Should NOT use JXA method calls
    expect(script.source).not.toContain('folder.name()');
    expect(script.source).not.toContain('folder.id()');
    expect(script.source).not.toContain('.parent()');
  });
});

// ---------------------------------------------------------------------------
// productivityStats
// ---------------------------------------------------------------------------

describe('ScriptBuilder.productivityStats', () => {
  it('generates OMNIJS_BRIDGE strategy', () => {
    const script = ScriptBuilder.productivityStats();
    expect(script.strategy).toBe(ExecStrategy.OMNIJS_BRIDGE);
  });

  it('uses evaluateJavascript for bridge execution', () => {
    const script = ScriptBuilder.productivityStats();
    expect(script.source).toContain('evaluateJavascript');
  });

  it('uses OmniJS property access (no parens)', () => {
    const script = ScriptBuilder.productivityStats();
    // OmniJS uses: t.taskStatus, t.completionDate, t.dueDate (property access)
    expect(script.source).toContain('t.taskStatus');
    expect(script.source).toContain('t.completionDate');
    expect(script.source).toContain('t.dueDate');
  });

  it('supports dateRange params', () => {
    const script = ScriptBuilder.productivityStats({
      dateRange: { start: '2026-01-01', end: '2026-02-01' },
    });
    expect(script.source).toContain('2026-01-01');
    expect(script.source).toContain('2026-02-01');
  });

  it('supports groupBy params', () => {
    const script = ScriptBuilder.productivityStats({ groupBy: 'week' });
    // Bridge wraps PARAMS inside JSON.stringify'd string, so quotes are escaped
    expect(script.source).toContain('groupBy');
    expect(script.source).toContain('week');
  });
});

// ---------------------------------------------------------------------------
// Safety: escaping and template placeholders
// ---------------------------------------------------------------------------

describe('Safety: escaping and injection prevention', () => {
  it('escapes special characters in task names via JSON.stringify', () => {
    const script = ScriptBuilder.createTask({
      name: 'Task with "quotes" and \\backslash',
    });
    // JSON.stringify handles escaping -- the raw characters should not appear unescaped
    assertHasParams(script.source);
    // Should contain escaped quote
    expect(script.source).toContain('\\"quotes\\"');
    expect(script.source).toContain('\\\\backslash');
  });

  it('escapes newlines in task notes', () => {
    const script = ScriptBuilder.createTask({
      name: 'Test',
      note: 'Line 1\nLine 2\nLine 3',
    });
    // JSON.stringify converts \n to \\n in the output
    expect(script.source).toContain('\\n');
    assertHasParams(script.source);
  });

  it('no template placeholders in any generated script', () => {
    const scripts = [
      ScriptBuilder.listTasks(),
      ScriptBuilder.getTask('id'),
      ScriptBuilder.createTask({ name: 'test' }),
      ScriptBuilder.createTask({ name: 'test', tags: ['a'] }),
      ScriptBuilder.updateTask('id', { name: 'test' }),
      ScriptBuilder.updateTask('id', { tags: ['a'] }),
      ScriptBuilder.completeTask('id'),
      ScriptBuilder.deleteTask('id'),
      ScriptBuilder.listProjects(),
      ScriptBuilder.listTags(),
      ScriptBuilder.listFolders(),
      ScriptBuilder.productivityStats(),
    ];
    for (const s of scripts) {
      assertNoTemplatePlaceholders(s.source);
    }
  });

  it('no whose()/where() in any generated script', () => {
    const scripts = [
      ScriptBuilder.listTasks(),
      ScriptBuilder.getTask('id'),
      ScriptBuilder.createTask({ name: 'test' }),
      ScriptBuilder.updateTask('id', { name: 'test' }),
      ScriptBuilder.completeTask('id'),
      ScriptBuilder.deleteTask('id'),
      ScriptBuilder.listProjects(),
      ScriptBuilder.listTags(),
      ScriptBuilder.listFolders(),
      ScriptBuilder.productivityStats(),
    ];
    for (const s of scripts) {
      assertNoWhoseOrWhere(s.source);
    }
  });

  it('single injection point: only one PARAMS assignment per script', () => {
    const scripts = [
      ScriptBuilder.listTasks(),
      ScriptBuilder.getTask('id'),
      ScriptBuilder.createTask({ name: 'test' }),
      ScriptBuilder.createTask({ name: 'test', tags: ['a'] }), // HYBRID path
      ScriptBuilder.updateTask('id', { tags: ['a'] }), // bridge path
      ScriptBuilder.completeTask('id'),
      ScriptBuilder.listProjects(),
      ScriptBuilder.listTags(),
      ScriptBuilder.listFolders(),
    ];
    for (const s of scripts) {
      const matches = s.source.match(/const PARAMS = /g);
      expect(matches).toHaveLength(1);
    }
  });

  it('HYBRID bridge sub-scripts inject data via BP object, not string concatenation', () => {
    const script = ScriptBuilder.createTask({
      name: 'test',
      tags: ['urgent', 'home'],
      plannedDate: '2026-03-01 08:00',
    });
    // Bridge sub-scripts should use BP.taskId, not raw string concat of taskId
    expect(script.source).toContain('BP.taskId');
    expect(script.source).toContain('BP.tags');
    expect(script.source).toContain('BP.plannedDate');
    // Must NOT have the old pattern: Task.byIdentifier(" + taskId + ")
    expect(script.source).not.toMatch(/Task\.byIdentifier\(\s*["'].*?\+/);
    expect(script.source).not.toMatch(/\+\s*taskId\s*\+/);
  });

  it('update bridge uses OmniJS in-process operations (no sub-bridge BP pattern)', () => {
    const script = ScriptBuilder.updateTask('abc123', {
      tags: ['new-tag'],
      addTags: ['extra'],
      removeTags: ['old'],
      plannedDate: '2026-03-01 08:00',
      repetitionRule: 'FREQ=DAILY',
    });
    // Now all operations happen in-process within the OmniJS bridge
    // Should use PARAMS.changes directly, not BP sub-objects
    expect(script.source).toContain('PARAMS.changes.tags');
    expect(script.source).toContain('PARAMS.changes.addTags');
    expect(script.source).toContain('PARAMS.changes.removeTags');
    expect(script.source).toContain('PARAMS.changes.plannedDate');
    expect(script.source).toContain('PARAMS.changes.repetitionRule');
    // Must NOT have the old sub-bridge string-concat pattern
    expect(script.source).not.toMatch(/\+\s*taskId\s*\+/);
    expect(script.source).not.toMatch(/\+\s*dateVal\s*\+/);
    expect(script.source).not.toMatch(/\+\s*tagList\s*\+/);
    expect(script.source).not.toMatch(/\+\s*addList\s*\+/);
    expect(script.source).not.toMatch(/\+\s*removeList\s*\+/);
  });

  it('handles unicode in task names safely', () => {
    const script = ScriptBuilder.createTask({
      name: 'Task with emoji \u{1F680} and CJK \u4E16\u754C',
    });
    assertHasParams(script.source);
    // JSON.stringify preserves unicode
    expect(script.source).toContain('\u{1F680}');
    expect(script.source).toContain('\u4E16\u754C');
  });

  it('handles empty string values', () => {
    const script = ScriptBuilder.createTask({ name: '', note: '' });
    assertHasParams(script.source);
    assertParamContains(script.source, '"name":""');
  });
});

// ---------------------------------------------------------------------------
// ExecStrategy enum
// ---------------------------------------------------------------------------

describe('ExecStrategy enum', () => {
  it('has three strategies', () => {
    expect(ExecStrategy.JXA_DIRECT).toBe('jxa_direct');
    expect(ExecStrategy.OMNIJS_BRIDGE).toBe('omnijs_bridge');
    expect(ExecStrategy.HYBRID).toBe('hybrid');
  });
});

// ---------------------------------------------------------------------------
// GeneratedScript shape
// ---------------------------------------------------------------------------

describe('GeneratedScript shape', () => {
  it('has source, strategy, and description', () => {
    const script = ScriptBuilder.listTasks();
    expect(script).toHaveProperty('source');
    expect(script).toHaveProperty('strategy');
    expect(script).toHaveProperty('description');
    expect(typeof script.source).toBe('string');
    expect(typeof script.strategy).toBe('string');
    expect(typeof script.description).toBe('string');
  });

  it('source is non-empty', () => {
    const script = ScriptBuilder.listTasks();
    expect(script.source.length).toBeGreaterThan(0);
  });
});
