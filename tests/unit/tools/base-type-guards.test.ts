import { describe, it, expect } from 'vitest';
import { isLegacyScriptError, getLegacyErrorMessage, isRawSuccessResponse } from '../../../src/tools/base';

describe('isLegacyScriptError', () => {
  it('returns false for null and non-objects', () => {
    expect(isLegacyScriptError(null)).toBe(false);
    expect(isLegacyScriptError(undefined)).toBe(false);
    expect(isLegacyScriptError('string')).toBe(false);
    expect(isLegacyScriptError(42)).toBe(false);
    expect(isLegacyScriptError(true)).toBe(false);
  });

  it('detects error: true', () => {
    expect(isLegacyScriptError({ error: true })).toBe(true);
  });

  it('detects error: "true" (string coercion from MCP bridge)', () => {
    expect(isLegacyScriptError({ error: 'true' })).toBe(true);
  });

  it('detects success: false', () => {
    expect(isLegacyScriptError({ success: false })).toBe(true);
  });

  it('detects success: false with message and details', () => {
    expect(isLegacyScriptError({ success: false, message: 'fail', details: { x: 1 } })).toBe(true);
  });

  it('rejects objects without error indicators', () => {
    expect(isLegacyScriptError({})).toBe(false);
    expect(isLegacyScriptError({ tasks: [] })).toBe(false);
    expect(isLegacyScriptError({ success: true })).toBe(false);
    expect(isLegacyScriptError({ error: false })).toBe(false);
    expect(isLegacyScriptError({ error: 'false' })).toBe(false);
  });
});

describe('getLegacyErrorMessage', () => {
  it('returns message when present', () => {
    expect(getLegacyErrorMessage({ message: 'Something broke' })).toBe('Something broke');
  });

  it('returns default when message is missing', () => {
    expect(getLegacyErrorMessage({})).toBe('Script execution failed');
  });

  it('returns default when message is non-string', () => {
    expect(getLegacyErrorMessage({ message: 42 as unknown as string })).toBe('Script execution failed');
  });
});

describe('isRawSuccessResponse', () => {
  it('returns false for null and non-objects', () => {
    expect(isRawSuccessResponse(null)).toBe(false);
    expect(isRawSuccessResponse(undefined)).toBe(false);
    expect(isRawSuccessResponse('string')).toBe(false);
    expect(isRawSuccessResponse(42)).toBe(false);
  });

  it('detects folders array', () => {
    expect(isRawSuccessResponse({ folders: [] })).toBe(true);
  });

  it('detects items array', () => {
    expect(isRawSuccessResponse({ items: [{ id: '1' }] })).toBe(true);
  });

  it('detects tasks array', () => {
    expect(isRawSuccessResponse({ tasks: [] })).toBe(true);
  });

  it('detects projects array', () => {
    expect(isRawSuccessResponse({ projects: [] })).toBe(true);
  });

  it('detects ok: true', () => {
    expect(isRawSuccessResponse({ ok: true })).toBe(true);
  });

  it('detects updated count', () => {
    expect(isRawSuccessResponse({ updated: 3 })).toBe(true);
  });

  it('rejects ok: false', () => {
    expect(isRawSuccessResponse({ ok: false })).toBe(false);
  });

  it('rejects objects without success indicators', () => {
    expect(isRawSuccessResponse({})).toBe(false);
    expect(isRawSuccessResponse({ error: true })).toBe(false);
    expect(isRawSuccessResponse({ success: false })).toBe(false);
  });
});
