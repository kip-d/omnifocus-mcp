import { describe, it, expect } from 'vitest';
import {
  ScriptErrorType,
  CategorizedScriptError,
  createCategorizedError,
  categorizeError,
  getErrorMessage,
  isRecoverableError,
  getErrorSeverity,
} from '../../../src/utils/error-taxonomy.js';
import { OmniAutomationError } from '../../../src/omnifocus/OmniAutomation.js';

describe('Error Taxonomy System', () => {
  describe('createCategorizedError', () => {
    it('should create a categorized error with all properties', () => {
      const error = createCategorizedError(
        ScriptErrorType.PERMISSION_DENIED,
        'Permission denied for test operation',
        ['Grant permissions in System Settings'],
        'Quick fix: Check automation permissions',
        { tool: 'test_tool' },
        new Error('Original error')
      );

      expect(error).toEqual({
        errorType: ScriptErrorType.PERMISSION_DENIED,
        message: 'Permission denied for test operation',
        recovery: ['Grant permissions in System Settings'],
        actionable: 'Quick fix: Check automation permissions',
        context: { tool: 'test_tool' },
        originalError: expect.any(Error),
      });
    });

    it('should create a minimal categorized error', () => {
      const error = createCategorizedError(
        ScriptErrorType.INTERNAL_ERROR,
        'Internal error occurred',
        ['Try again']
      );

      expect(error).toEqual({
        errorType: ScriptErrorType.INTERNAL_ERROR,
        message: 'Internal error occurred',
        recovery: ['Try again'],
        actionable: undefined,
        context: undefined,
        originalError: undefined,
      });
    });
  });

  describe('categorizeError', () => {
    it('should categorize permission denied errors', () => {
      const permissionErrors = [
        new Error('Script error: execution error: Not authorized to send Apple events to OmniFocus (-1743)'),
        new Error('not allowed to perform this operation'),
        new Error('authorization failed'),
        new Error('permission denied'),
      ];

      permissionErrors.forEach(error => {
        const result = categorizeError(error, 'test operation');
        expect(result.errorType).toBe(ScriptErrorType.PERMISSION_DENIED);
        expect(result.message).toContain('Permission denied');
        expect(result.recovery).toContain('You may see a permission dialog - click "OK" to grant access');
        expect(result.actionable).toBe('Grant automation permissions in System Settings');
      });
    });

    it('should categorize OmniFocus not running errors', () => {
      const notRunningErrors = [
        new Error('OmniFocus is not running'),
        new Error('can\'t find process "OmniFocus"'),
        new Error('application isn\'t running'),
      ];

      notRunningErrors.forEach(error => {
        const result = categorizeError(error, 'list tasks');
        expect(result.errorType).toBe(ScriptErrorType.OMNIFOCUS_NOT_RUNNING);
        expect(result.message).toContain('Cannot list tasks - OmniFocus is not running');
        expect(result.recovery).toContain('Open OmniFocus from your Applications folder or Dock');
        expect(result.actionable).toBe('Launch OmniFocus and ensure it\'s fully loaded');
      });
    });

    it('should categorize timeout errors', () => {
      const timeoutErrors = [
        new Error('Script execution timeout after 30 seconds'),
        new Error('Operation timed out'),
        new Error('execution took too long'),
      ];

      timeoutErrors.forEach(error => {
        const result = categorizeError(error, 'query tasks');
        expect(result.errorType).toBe(ScriptErrorType.SCRIPT_TIMEOUT);
        expect(result.message).toContain('query tasks operation timed out');
        expect(result.recovery).toContain('Try reducing the amount of data requested (use limit parameter)');
        expect(result.actionable).toBe('Reduce query scope or enable skipAnalysis for better performance');
      });
    });

    it('should categorize script size errors', () => {
      const sizeErrors = [
        new Error('Script too large for execution'),
        new Error('argument list too long'),
        new Error('script size exceeded limits'),
      ];

      sizeErrors.forEach(error => {
        const result = categorizeError(error, 'bulk update');
        expect(result.errorType).toBe(ScriptErrorType.SCRIPT_TOO_LARGE);
        expect(result.message).toContain('Script size exceeded limits');
        expect(result.recovery).toContain('Try using limit parameter to reduce results');
        expect(result.actionable).toBe('Reduce script size by limiting data or using field selection');
      });
    });

    it('should categorize bridge failure errors', () => {
      const bridgeErrors = [
        new Error('evaluateJavascript failed'),
        new Error('bridge connection lost'),
        new Error('omniJs execution failed'),
      ];

      bridgeErrors.forEach(error => {
        const result = categorizeError(error, 'create task with tags', { helper: 'bridge' });
        expect(result.errorType).toBe(ScriptErrorType.BRIDGE_FAILURE);
        expect(result.message).toContain('JavaScript bridge failure');
        expect(result.recovery).toContain('This operation uses the OmniJS bridge for complex functionality');
        expect(result.actionable).toBe('Retry operation or use simpler alternatives');
      });
    });

    it('should categorize invalid ID errors', () => {
      const invalidIdErrors = [
        new Error('invalid id provided'),
        new Error('Task with ID "abc123" not found'),
        new Error('no such project exists'),
        new Error('null id parameter'),
      ];

      invalidIdErrors.forEach(error => {
        const result = categorizeError(error, 'update task');
        expect(result.errorType).toBe(ScriptErrorType.INVALID_ID);
        expect(result.message).toContain('Invalid or missing ID');
        expect(result.recovery).toContain('Verify the ID is correct and still exists');
        expect(result.actionable).toBe('Check ID validity using appropriate list tool');
      });
    });

    it('should categorize null result errors', () => {
      const nullErrors = [
        new Error('NULL_RESULT: Script returned null'),
        new Error('returned null or undefined'),
        new Error('undefined result from query'),
      ];

      nullErrors.forEach(error => {
        const result = categorizeError(error, 'search tasks');
        expect(result.errorType).toBe(ScriptErrorType.NULL_RESULT);
        expect(result.message).toContain('No data returned');
        expect(result.recovery).toContain('The operation completed but returned no results');
        expect(result.actionable).toBe('Verify query parameters and data existence');
      });
    });

    it('should categorize connection timeout errors', () => {
      const connectionErrors = [
        new Error('connection timeout occurred'),
        new Error('connection test failed'),
      ];

      connectionErrors.forEach(error => {
        const result = categorizeError(error, 'query projects', { consecutiveFailures: 3 });
        expect(result.errorType).toBe(ScriptErrorType.CONNECTION_TIMEOUT);
        expect(result.message).toContain('Connection timeout');
        expect(result.recovery).toContain('OmniFocus connection has become unresponsive');
        expect(result.actionable).toBe('Restart OmniFocus to restore connection');
      });
    });

    it('should categorize OmniAutomationError instances', () => {
      const omniError = new OmniAutomationError('Script execution failed', {
        script: 'test script',
        stderr: 'error details',
      });

      const result = categorizeError(omniError, 'execute script');
      expect(result.errorType).toBe(ScriptErrorType.OMNIFOCUS_ERROR);
      expect(result.message).toContain('OmniFocus automation error');
      expect(result.recovery).toContain('Check that OmniFocus is not showing any dialogs');
      expect(result.actionable).toBe('Clear OmniFocus dialogs and ensure app is responsive');
    });

    it('should categorize validation errors', () => {
      const validationErrors = [
        new Error('validation failed: required field missing'),
        new Error('invalid parameter format'),
        new Error('required field not provided'),
        new Error('expected string but got number'),
      ];

      validationErrors.forEach(error => {
        const result = categorizeError(error, 'create task');
        expect(result.errorType).toBe(ScriptErrorType.VALIDATION_ERROR);
        expect(result.message).toContain('Parameter validation failed');
        expect(result.recovery).toContain('Check that all required parameters are provided');
        expect(result.actionable).toBe('Review and correct parameter values');
      });
    });

    it('should default to internal error for unknown errors', () => {
      const unknownError = new Error('Some unexpected error message');
      const result = categorizeError(unknownError, 'unknown operation');

      expect(result.errorType).toBe(ScriptErrorType.INTERNAL_ERROR);
      expect(result.message).toContain('Internal error during unknown operation');
      expect(result.recovery).toContain('Try the operation again');
      expect(result.actionable).toBe('Retry operation and verify system state');
    });

    it('should include context in categorized error', () => {
      const error = new Error('test error');
      const context = {
        tool: 'tasks',
        parameters: { limit: 100 },
        timestamp: Date.now(),
      };

      const result = categorizeError(error, 'test operation', context);
      expect(result.context).toEqual(context);
    });
  });

  describe('getErrorMessage', () => {
    it('should format error message with actionable guidance', () => {
      const error: CategorizedScriptError = {
        errorType: ScriptErrorType.PERMISSION_DENIED,
        message: 'Permission denied',
        recovery: ['Grant permissions', 'Restart app'],
        actionable: 'Check System Settings',
      };

      const formatted = getErrorMessage(error);
      expect(formatted).toContain('Permission denied');
      expect(formatted).toContain('Quick fix: Check System Settings');
      expect(formatted).toContain('How to resolve:');
      expect(formatted).toContain('  • Grant permissions');
      expect(formatted).toContain('  • Restart app');
    });

    it('should format error message without actionable guidance', () => {
      const error: CategorizedScriptError = {
        errorType: ScriptErrorType.INTERNAL_ERROR,
        message: 'Internal error occurred',
        recovery: ['Try again'],
      };

      const formatted = getErrorMessage(error);
      expect(formatted).toContain('Internal error occurred');
      expect(formatted).not.toContain('Quick fix:');
      expect(formatted).toContain('How to resolve:');
      expect(formatted).toContain('  • Try again');
    });

    it('should format error message with no recovery steps', () => {
      const error: CategorizedScriptError = {
        errorType: ScriptErrorType.NULL_RESULT,
        message: 'No data found',
        recovery: [],
      };

      const formatted = getErrorMessage(error);
      expect(formatted).toBe('No data found');
    });
  });

  describe('isRecoverableError', () => {
    it('should identify recoverable errors', () => {
      const recoverableTypes = [
        ScriptErrorType.PERMISSION_DENIED,
        ScriptErrorType.OMNIFOCUS_NOT_RUNNING,
        ScriptErrorType.SCRIPT_TIMEOUT,
        ScriptErrorType.SCRIPT_TOO_LARGE,
        ScriptErrorType.INVALID_ID,
        ScriptErrorType.VALIDATION_ERROR,
        ScriptErrorType.CONNECTION_TIMEOUT,
        ScriptErrorType.OMNIFOCUS_ERROR,
      ];

      recoverableTypes.forEach(errorType => {
        expect(isRecoverableError(errorType)).toBe(true);
      });
    });

    it('should identify non-recoverable errors', () => {
      const nonRecoverableTypes = [
        ScriptErrorType.BRIDGE_FAILURE,
        ScriptErrorType.NULL_RESULT,
        ScriptErrorType.INTERNAL_ERROR,
      ];

      nonRecoverableTypes.forEach(errorType => {
        expect(isRecoverableError(errorType)).toBe(false);
      });
    });
  });

  describe('getErrorSeverity', () => {
    it('should assign correct severity levels', () => {
      // Low severity
      expect(getErrorSeverity(ScriptErrorType.NULL_RESULT)).toBe('low');
      expect(getErrorSeverity(ScriptErrorType.INVALID_ID)).toBe('low');
      expect(getErrorSeverity(ScriptErrorType.VALIDATION_ERROR)).toBe('low');

      // Medium severity
      expect(getErrorSeverity(ScriptErrorType.SCRIPT_TIMEOUT)).toBe('medium');
      expect(getErrorSeverity(ScriptErrorType.SCRIPT_TOO_LARGE)).toBe('medium');
      expect(getErrorSeverity(ScriptErrorType.BRIDGE_FAILURE)).toBe('medium');

      // High severity
      expect(getErrorSeverity(ScriptErrorType.OMNIFOCUS_ERROR)).toBe('high');
      expect(getErrorSeverity(ScriptErrorType.CONNECTION_TIMEOUT)).toBe('high');
      expect(getErrorSeverity(ScriptErrorType.INTERNAL_ERROR)).toBe('high');

      // Critical severity
      expect(getErrorSeverity(ScriptErrorType.PERMISSION_DENIED)).toBe('critical');
      expect(getErrorSeverity(ScriptErrorType.OMNIFOCUS_NOT_RUNNING)).toBe('critical');
    });
  });

  describe('Edge Cases', () => {
    it('should handle string errors', () => {
      const result = categorizeError('String error message', 'test operation');
      expect(result.errorType).toBe(ScriptErrorType.INTERNAL_ERROR);
      expect(result.message).toContain('String error message');
    });

    it('should handle null/undefined errors', () => {
      const nullResult = categorizeError(null, 'test operation');
      expect(nullResult.errorType).toBe(ScriptErrorType.INTERNAL_ERROR);

      const undefinedResult = categorizeError(undefined, 'test operation');
      expect(undefinedResult.errorType).toBe(ScriptErrorType.INTERNAL_ERROR);
    });

    it('should handle errors with complex context', () => {
      const error = new Error('Complex error');
      const context = {
        nested: {
          data: {
            values: [1, 2, 3],
            metadata: { type: 'test' }
          }
        },
        circularRef: {} as any
      };
      context.circularRef.self = context.circularRef;

      const result = categorizeError(error, 'complex operation', context);
      expect(result.context).toEqual(context);
      expect(result.errorType).toBe(ScriptErrorType.INTERNAL_ERROR);
    });

    it('should preserve original error in all categorizations', () => {
      const originalError = new Error('Original error message');
      const result = categorizeError(originalError, 'test operation');
      expect(result.originalError).toBe(originalError);
    });
  });
});