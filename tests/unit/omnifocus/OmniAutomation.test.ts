import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OmniAutomation, OmniAutomationError } from '../../../src/omnifocus/OmniAutomation';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

// Mock child_process spawn
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('OmniAutomation', () => {
  let omniAutomation: OmniAutomation;
  let mockProcess: any;

  beforeEach(() => {
    // Create a mock process that extends EventEmitter
    mockProcess = Object.assign(new EventEmitter(), {
      stdin: {
        write: vi.fn(),
        end: vi.fn(),
      },
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });

    // Set up spawn mock to return our mock process
    vi.mocked(spawn).mockReturnValue(mockProcess as any);

    // Create instance with reasonable test timeouts
    omniAutomation = new OmniAutomation(100000, 1000);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default values when no parameters provided', () => {
      const instance = new OmniAutomation();
      expect(instance).toBeDefined();
    });

    it('should respect constructor parameters', () => {
      const instance = new OmniAutomation(50000, 5000);
      expect(instance).toBeDefined();
    });

    it('should respect environment variables', () => {
      process.env.OMNIFOCUS_MAX_SCRIPT_SIZE = '200000';
      process.env.OMNIFOCUS_SCRIPT_TIMEOUT = '180000';
      
      const instance = new OmniAutomation();
      expect(instance).toBeDefined();
      
      // Clean up
      delete process.env.OMNIFOCUS_MAX_SCRIPT_SIZE;
      delete process.env.OMNIFOCUS_SCRIPT_TIMEOUT;
    });
  });

  describe('execute', () => {
    it('should reject scripts that are too large', async () => {
      const hugeScript = 'x'.repeat(100001);
      
      await expect(omniAutomation.execute(hugeScript)).rejects.toThrow(
        'Script too large: 100001 bytes (max: 100000)'
      );
    });

    it('should execute a simple script successfully', async () => {
      const script = 'JSON.stringify({ result: "success" })';
      const expectedResult = { result: 'success' };

      // Simulate successful execution
      const executePromise = omniAutomation.execute(script);

      // Wait for spawn to be called
      await new Promise(resolve => setImmediate(resolve));

      // Simulate stdout data
      mockProcess.stdout.emit('data', JSON.stringify(expectedResult));
      
      // Simulate process close
      mockProcess.emit('close', 0);

      const result = await executePromise;
      expect(result).toEqual(expectedResult);
    });

    it('should handle script execution errors', async () => {
      const script = 'throw new Error("Test error")';

      const executePromise = omniAutomation.execute(script);

      // Wait for spawn to be called
      await new Promise(resolve => setImmediate(resolve));

      // Simulate stderr data
      mockProcess.stderr.emit('data', 'Error: Test error');
      
      // Simulate process close with error code
      mockProcess.emit('close', 1);

      await expect(executePromise).rejects.toThrow(OmniAutomationError);
    });

    it('should handle empty output as null', async () => {
      const script = 'return undefined';

      const executePromise = omniAutomation.execute(script);

      // Wait for spawn to be called
      await new Promise(resolve => setImmediate(resolve));

      // Simulate empty stdout
      mockProcess.stdout.emit('data', '');
      
      // Simulate process close
      mockProcess.emit('close', 0);

      const result = await executePromise;
      expect(result).toBeNull();
    });

    it('should handle JSON parse errors with raw string fallback', async () => {
      const script = 'return "simple string"';

      const executePromise = omniAutomation.execute(script);

      // Wait for spawn to be called
      await new Promise(resolve => setImmediate(resolve));

      // Simulate non-JSON output
      mockProcess.stdout.emit('data', 'simple string');
      
      // Simulate process close
      mockProcess.emit('close', 0);

      const result = await executePromise;
      expect(result).toBe('simple string');
    });

    it('should handle malformed JSON as error', async () => {
      const script = 'return { broken: json }';

      const executePromise = omniAutomation.execute(script);

      // Wait for spawn to be called
      await new Promise(resolve => setImmediate(resolve));

      // Simulate malformed JSON output
      mockProcess.stdout.emit('data', '{ broken: json');
      
      // Simulate process close
      mockProcess.emit('close', 0);

      await expect(executePromise).rejects.toThrow('Invalid JSON response from script');
    });

    it('should handle process spawn errors', async () => {
      const script = 'JSON.stringify({ result: "success" })';

      const executePromise = omniAutomation.execute(script);

      // Wait for spawn to be called
      await new Promise(resolve => setImmediate(resolve));

      // Simulate process error
      mockProcess.emit('error', new Error('Spawn failed'));

      await expect(executePromise).rejects.toThrow('Failed to execute script');
    });

    it('should wrap scripts without IIFE structure', async () => {
      const script = 'JSON.stringify({ test: true })';

      omniAutomation.execute(script);

      // Wait for spawn to be called
      await new Promise(resolve => setImmediate(resolve));

      // Check that the script was wrapped
      expect(mockProcess.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('(() => {')
      );
      expect(mockProcess.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining("Application('OmniFocus')")
      );
    });

    it('should not double-wrap scripts with existing IIFE and app init', async () => {
      const script = `(() => {
        const app = Application('OmniFocus');
        return JSON.stringify({ test: true });
      })()`;

      omniAutomation.execute(script);

      // Wait for spawn to be called
      await new Promise(resolve => setImmediate(resolve));

      // Check that the script was NOT wrapped again
      expect(mockProcess.stdin.write).toHaveBeenCalledWith(script);
    });
  });

  describe('buildScript', () => {
    it('should replace placeholders with values', () => {
      const template = 'const name = {{name}}; const age = {{age}};';
      const params = { name: 'John', age: 30 };

      const result = omniAutomation.buildScript(template, params);

      expect(result).toBe('const name = "John"; const age = 30;');
    });

    it('should handle null and undefined values', () => {
      const template = 'const val1 = {{val1}}; const val2 = {{val2}};';
      const params = { val1: null, val2: undefined };

      const result = omniAutomation.buildScript(template, params);

      expect(result).toBe('const val1 = null; const val2 = null;');
    });

    it('should handle arrays', () => {
      const template = 'const tags = {{tags}};';
      const params = { tags: ['work', 'urgent'] };

      const result = omniAutomation.buildScript(template, params);

      expect(result).toBe('const tags = ["work", "urgent"];');
    });

    it('should handle dates', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const template = 'const dueDate = {{dueDate}};';
      const params = { dueDate: date };

      const result = omniAutomation.buildScript(template, params);

      expect(result).toBe('const dueDate = new Date("2024-01-15T10:00:00.000Z");');
    });

    it('should handle booleans', () => {
      const template = 'const flagged = {{flagged}}; const completed = {{completed}};';
      const params = { flagged: true, completed: false };

      const result = omniAutomation.buildScript(template, params);

      expect(result).toBe('const flagged = true; const completed = false;');
    });

    it('should handle nested objects', () => {
      const template = 'const options = {{options}};';
      const params = {
        options: {
          limit: 10,
          includeCompleted: false,
          tags: ['home', 'work'],
        },
      };

      const result = omniAutomation.buildScript(template, params);

      expect(result).toContain('"limit": 10');
      expect(result).toContain('"includeCompleted": false');
      expect(result).toContain('"tags": ["home", "work"]');
    });

    it('should escape special characters in strings', () => {
      const template = 'const note = {{note}};';
      const params = { note: 'This is a "test" with \'quotes\' and\nnewlines' };

      const result = omniAutomation.buildScript(template, params);

      expect(result).toBe('const note = "This is a \\"test\\" with \'quotes\' and\\nnewlines";');
    });

    it('should handle empty params', () => {
      const template = 'const x = 1;';

      const result = omniAutomation.buildScript(template);

      expect(result).toBe('const x = 1;');
    });

    it('should handle multiple occurrences of same placeholder', () => {
      const template = 'const x = {{value}}; const y = {{value}}; const z = {{value}};';
      const params = { value: 42 };

      const result = omniAutomation.buildScript(template, params);

      expect(result).toBe('const x = 42; const y = 42; const z = 42;');
    });

    it('should handle objects with undefined values', () => {
      const template = 'const options = {{options}};';
      const params = {
        options: {
          limit: 10,
          name: undefined,
          active: true,
        },
      };

      const result = omniAutomation.buildScript(template, params);

      // undefined values should be filtered out
      expect(result).not.toContain('name');
      expect(result).toContain('"limit": 10');
      expect(result).toContain('"active": true');
    });
  });

  describe('error handling', () => {
    it('should create OmniAutomationError with script and stderr', () => {
      const error = new OmniAutomationError('Test error', 'test script', 'stderr output');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('OmniAutomationError');
      expect(error.message).toBe('Test error');
      expect(error.script).toBe('test script');
      expect(error.stderr).toBe('stderr output');
    });

    it('should handle timeout properly', async () => {
      // Create instance with very short timeout
      const quickTimeout = new OmniAutomation(100000, 100);
      const script = 'delay(10)';

      const executePromise = quickTimeout.execute(script);

      // The timeout is handled by spawn's timeout option
      // which should kill the process
      await new Promise(resolve => setImmediate(resolve));
      
      // Simulate timeout by closing with non-zero code
      mockProcess.stderr.emit('data', 'Script timeout');
      mockProcess.emit('close', 143); // SIGTERM exit code

      await expect(executePromise).rejects.toThrow('Script execution failed with code 143');
    });
  });
});