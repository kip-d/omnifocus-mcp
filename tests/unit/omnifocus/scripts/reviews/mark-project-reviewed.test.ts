import { describe, it, expect } from 'vitest';
import { buildMarkProjectReviewedScript } from '../../../../../src/omnifocus/scripts/reviews/mark-project-reviewed';

describe('buildMarkProjectReviewedScript', () => {
  it('serializes all three params into the script body', () => {
    const script = buildMarkProjectReviewedScript({
      projectId: 'proj-xyz',
      reviewDate: '2026-05-21T17:00:00',
      updateNextReviewDate: true,
    });
    expect(script).toContain('"projectId":"proj-xyz"');
    expect(script).toContain('"reviewDate":"2026-05-21T17:00:00"');
    expect(script).toContain('"updateNextReviewDate":true');
  });

  it('normalizes null projectId (e.g. missing param) explicitly', () => {
    const script = buildMarkProjectReviewedScript({
      projectId: null,
      reviewDate: '2026-05-21',
      updateNextReviewDate: false,
    });
    expect(script).toContain('"projectId":null');
    expect(script).toContain('"updateNextReviewDate":false');
  });

  it('emits a JXA IIFE that calls evaluateJavascript with the OmniJS body', () => {
    const script = buildMarkProjectReviewedScript({
      projectId: 'p',
      reviewDate: '2026-05-21',
      updateNextReviewDate: true,
    });
    expect(script).toMatch(/Application\('OmniFocus'\)/);
    expect(script).toContain('app.evaluateJavascript(omniJsScript)');
    expect(script).toContain('Project.byIdentifier(projectId)');
    expect(script).toContain("operation: 'mark_project_reviewed'");
  });

  it('escapes quote characters in projectId via JSON.stringify', () => {
    const script = buildMarkProjectReviewedScript({
      projectId: 'has"quote',
      reviewDate: '2026-05-21',
      updateNextReviewDate: true,
    });
    expect(script).toContain('"projectId":"has\\"quote"');
  });
});
