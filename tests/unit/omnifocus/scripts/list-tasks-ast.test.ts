import { describe, it, expect } from 'vitest';
import { buildListTasksScriptV4, isInboxRoute } from '../../../../src/omnifocus/scripts/tasks.js';

// OMN-330: the inbox route has one definition. buildListTasksScriptV4 dispatches on
// it, and OmniFocusReadTool uses it for route-dependent behavior (in-script sort).
describe('isInboxRoute', () => {
  it.each([
    ['inbox', {}, true],
    [undefined, { inInbox: true }, true],
    ['flagged', { inInbox: true }, true],
    ['flagged', {}, false],
    [undefined, {}, false],
    ['all', { inInbox: false }, false],
  ] as const)('mode %s with filter %j → %s', (mode, filter, expected) => {
    expect(isInboxRoute(mode, filter)).toBe(expected);
  });

  it('matches the script builder: inbox route ⇔ inbox script', () => {
    const cases = [
      { mode: 'flagged', filter: { inInbox: true, flagged: true } },
      { mode: undefined, filter: { flagged: true } },
      { mode: 'inbox', filter: {} },
    ];
    for (const { mode, filter } of cases) {
      const script = buildListTasksScriptV4({ filter, mode });
      expect(script.includes('inbox.forEach')).toBe(isInboxRoute(mode, filter));
    }
  });
});
