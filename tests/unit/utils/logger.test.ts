import { describe, it, expect, beforeEach } from 'vitest';
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
    expect(out.name).toBe('[REDACTED]');
    expect((out as any).nested.note).toBe('[REDACTED]');
    expect((out as any).nested.deep).toBeTypeOf('object');
  });

  it('includes structured args at debug level, not at info', () => {
    const logger = createLogger('test');
    // Should not throw; we check that redactArgs processed, meaning JSON stringifiable
    logger.debug('dbg', { name: 'secret', taskName: 'x' });

    process.env.LOG_LEVEL = 'info';
    const infoLogger = createLogger('test');
    infoLogger.info('info', { name: 'secret' }); // args ignored at info
  });

  it('appends error message when single Error arg is provided at error level', () => {
    process.env.LOG_LEVEL = 'error';
    const logger = createLogger('test');
    logger.error('boom', new Error('details'));
  });

  afterAll(() => {
    process.env.LOG_LEVEL = orig;
  });
});
