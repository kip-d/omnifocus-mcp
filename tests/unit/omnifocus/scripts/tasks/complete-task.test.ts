import { describe, it, expect } from 'vitest';
import { buildCompleteTaskScript } from '../../../../../src/omnifocus/scripts/tasks/complete-task';

describe('buildCompleteTaskScript', () => {
  it('serializes taskId into the script body', () => {
    const script = buildCompleteTaskScript({ taskId: 'abc-123' });
    expect(script).toContain('"taskId":"abc-123"');
  });

  it('normalizes missing completionDate to null', () => {
    const script = buildCompleteTaskScript({ taskId: 'abc-123' });
    expect(script).toContain('"completionDate":null');
  });

  it('passes completionDate string through verbatim when provided', () => {
    const script = buildCompleteTaskScript({
      taskId: 'abc-123',
      completionDate: '2026-05-21T17:00:00',
    });
    expect(script).toContain('"completionDate":"2026-05-21T17:00:00"');
  });

  it('emits a JXA IIFE that calls evaluateJavascript', () => {
    const script = buildCompleteTaskScript({ taskId: 'x' });
    expect(script).toMatch(/Application\('OmniFocus'\)/);
    expect(script).toContain('app.evaluateJavascript(omniScript)');
    expect(script).toContain("formatError(error, 'complete_task')");
  });

  it('escapes taskId values that contain quotes safely via JSON.stringify', () => {
    const script = buildCompleteTaskScript({ taskId: 'has"quote' });
    expect(script).toContain('"taskId":"has\\"quote"');
  });
});
