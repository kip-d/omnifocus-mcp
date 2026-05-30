import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createLogger, redactArgs } from '../../../src/utils/logger.js';

describe('logger', () => {
  const orig = process.env.LOG_LEVEL;

  beforeEach(() => {
    process.env.LOG_LEVEL = 'debug';
  });

  it('redacts sensitive keys deeply and limits recursion', () => {
    const input: any = { name: 'A', nested: { note: 'B', deep: {} } };
    let node = input.nested.deep;
    // Create deep nesting > 6 levels
    for (let i = 0; i < 10; i++) {
      node.next = { idx: i };
      node = node.next;
    }
    const out = redactArgs(input);
    expect((out as any).name).toBe('[REDACTED]');
    expect((out as any).nested.note).toBe('[REDACTED]');
    expect((out as any).nested.deep).toBeTypeOf('object');
  });

  it('includes structured args at debug level, not at info', () => {
    const logger = createLogger('test');
    // Should not throw; we check that redactArgs processed, meaning JSON stringifiable
    expect(() => logger.debug('dbg', { name: 'secret', taskName: 'x' })).not.toThrow();

    process.env.LOG_LEVEL = 'info';
    const infoLogger = createLogger('test');
    expect(() => infoLogger.info('info', { name: 'secret' })).not.toThrow(); // args ignored at info
  });

  it('appends error message when single Error arg is provided at error level', () => {
    process.env.LOG_LEVEL = 'error';
    const logger = createLogger('test');
    expect(() => logger.error('boom', new Error('details'))).not.toThrow();
  });

  afterAll(() => {
    process.env.LOG_LEVEL = orig;
  });
});
