import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createLogger, redactArgs } from '../../../src/utils/logger.js';

describe('logger', () => {
  const orig = process.env.LOG_LEVEL;

  beforeEach(() => {
    process.env.LOG_LEVEL = 'debug';
  });

  afterAll(() => {
    process.env.LOG_LEVEL = orig;
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

  it('expands an Error into {name, message, stack} (own properties aren’t enumerable by default)', () => {
    const err = new Error('boom');
    const out = redactArgs(err) as { name: string; message: string; stack?: string };
    expect(out.name).toBe('Error');
    expect(out.message).toBe('boom');
    expect(out.stack).toContain('boom');
  });

  it('recurses into Error.cause', () => {
    const cause = new Error('root cause');
    const err = new Error('wrapper', { cause });
    const out = redactArgs(err) as { cause: { message: string } };
    expect(out.cause.message).toBe('root cause');
  });

  it('redacts sensitive keys found on an Error.cause object', () => {
    const err = new Error('wrapper', { cause: { name: 'should-redact', code: 7 } });
    const out = redactArgs(err) as { cause: { name: string; code: number } };
    expect(out.cause.name).toBe('[REDACTED]');
    expect(out.cause.code).toBe(7);
  });

  it('guards against a self-referential cycle instead of recursing forever', () => {
    const obj: any = { code: 1 };
    obj.self = obj;
    const out = redactArgs(obj) as { code: number; self: unknown };
    expect(out.code).toBe(1);
    expect(out.self).toBe('[Circular]');
  });

  it('guards against a cycle through an Error', () => {
    const err: any = new Error('cyclic');
    err.cause = err;
    const out = redactArgs(err) as { message: string; cause: unknown };
    expect(out.message).toBe('cyclic');
    expect(out.cause).toBe('[Circular]');
  });

  it('does not flag a shared (non-cyclic) reference as a cycle', () => {
    const shared = { note: 'x' };
    const out = redactArgs({ a: shared, b: shared }) as { a: unknown; b: unknown };
    expect(out.a).not.toBe('[Circular]');
    expect(out.b).not.toBe('[Circular]');
    expect((out.a as any).note).toBe('[REDACTED]');
  });

  describe('level policy (D1/D2, OMN-348)', () => {
    // `process.stderr.write` has an overloaded signature vi.spyOn's generics
    // can't express cleanly; `any` here is the spy handle only, never read as
    // the real `write` type.
    let writeSpy: any;
    let output: string;

    beforeEach(() => {
      output = '';
      writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
        output += String(chunk);
        return true;
      });
    });

    afterAll(() => {
      writeSpy?.mockRestore();
    });

    it('error(message, Error) prints the error message and a stack line', () => {
      process.env.LOG_LEVEL = 'error';
      const logger = createLogger('test');
      logger.error('x', new Error('boom'));
      expect(output).toContain('boom');
      expect(output).toContain('at ');
    });

    it('error(message, {...}) prints key-redacted args', () => {
      process.env.LOG_LEVEL = 'error';
      const logger = createLogger('test');
      logger.error('x', { name: 'secret', code: 7 });
      expect(output).toContain('[REDACTED]');
      expect(output).toContain('7');
      expect(output).not.toContain('secret');
    });

    it('warn(message, {...}) prints key-redacted args', () => {
      process.env.LOG_LEVEL = 'warn';
      const logger = createLogger('test');
      logger.warn('x', { name: 'secret', code: 7 });
      expect(output).toContain('[REDACTED]');
      expect(output).toContain('7');
      expect(output).not.toContain('secret');
    });

    it('info(message, {...}) prints no payload', () => {
      process.env.LOG_LEVEL = 'info';
      const logger = createLogger('test');
      logger.info('info', { name: 'secret', code: 7 });
      expect(output).toContain('info');
      expect(output).not.toContain('secret');
      expect(output).not.toContain('[REDACTED]');
      expect(output).not.toContain('"code"');
    });

    it('debug(message, {...}) still prints key-redacted args (unchanged behavior)', () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = createLogger('test');
      logger.debug('dbg', { name: 'secret', code: 7 });
      expect(output).toContain('[REDACTED]');
      expect(output).toContain('7');
      expect(output).not.toContain('secret');
    });
  });
});
