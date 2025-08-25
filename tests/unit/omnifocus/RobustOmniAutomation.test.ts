import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { RobustOmniAutomation } from '../../../src/omnifocus/RobustOmniAutomation';
import { OmniAutomationError } from '../../../src/omnifocus/OmniAutomation';

describe('RobustOmniAutomation', () => {
  let robustOmni: RobustOmniAutomation;
  let originalDateNow: () => number;
  let currentTime: number;
  let superExecuteMock: Mock;

  beforeEach(() => {
    // Mock Date.now to control time
    currentTime = 1000000;
    originalDateNow = Date.now;
    Date.now = vi.fn(() => currentTime);

    // Create instance
    robustOmni = new RobustOmniAutomation();
    
    // Mock the parent class execute method
    superExecuteMock = vi.fn();
    (robustOmni as any).__proto__.__proto__.execute = superExecuteMock;
  });

  afterEach(() => {
    vi.clearAllMocks();
    Date.now = originalDateNow;
  });

  describe('successful execution', () => {
    it('should execute successfully and reset failure counter', async () => {
      const testResult = { success: true, data: 'test' };
      superExecuteMock.mockResolvedValueOnce(testResult);

      const result = await robustOmni.execute('test script');

      expect(result).toEqual(testResult);
      expect(superExecuteMock).toHaveBeenCalledWith('test script');
    });

    it('should update lastSuccessTime on success', async () => {
      superExecuteMock.mockResolvedValueOnce({ success: true });

      await robustOmni.execute('test script');

      // Move time forward
      currentTime += 1000;

      // Should not test connection since last success was recent
      superExecuteMock.mockResolvedValueOnce({ success: true });
      await robustOmni.execute('another script');

      // Only called twice (no connection test)
      expect(superExecuteMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('connection staleness', () => {
    it('should test connection when stale', async () => {
      // First successful call
      superExecuteMock.mockResolvedValueOnce({ success: true });
      await robustOmni.execute('initial script');

      // Move time forward past connection timeout (5 minutes)
      currentTime += 6 * 60 * 1000;

      // Mock connection test to succeed
      superExecuteMock.mockResolvedValueOnce({
        success: true,
        appAvailable: true,
        docAvailable: true,
      });

      // Mock actual script execution
      superExecuteMock.mockResolvedValueOnce({ result: 'data' });

      const result = await robustOmni.execute('test script');

      expect(result).toEqual({ result: 'data' });
      // Should be called 3 times: initial, connection test, actual script
      expect(superExecuteMock).toHaveBeenCalledTimes(3);
      
      // Check that connection test was called with the test script
      const connectionTestCall = superExecuteMock.mock.calls[1][0];
      expect(connectionTestCall).toContain('success: true');
      expect(connectionTestCall).toContain('appAvailable');
      expect(connectionTestCall).toContain('docAvailable');
    });

    it('should throw error when connection test fails', async () => {
      // Move time forward to make connection stale (start fresh)
      currentTime += 10 * 60 * 1000;

      // Mock connection test to fail
      superExecuteMock.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(robustOmni.execute('test script')).rejects.toThrow(
        'Connection test failed - OmniFocus may be unresponsive'
      );
    });

    it('should throw when connection test returns false doc availability', async () => {
      // Move time forward to make connection stale
      currentTime += 10 * 60 * 1000;

      // Connection test returns but doc not available
      superExecuteMock.mockResolvedValueOnce({
        success: true,
        appAvailable: true,
        docAvailable: false,
      });

      await expect(robustOmni.execute('test script')).rejects.toThrow(
        'Connection test failed - OmniFocus may be unresponsive'
      );
    });
  });

  describe('error handling and retries', () => {
    it('should track consecutive failures', async () => {
      const error = new OmniAutomationError('Test error', 'script', 'stderr');

      // First failure
      superExecuteMock.mockRejectedValueOnce(error);
      await expect(robustOmni.execute('script1')).rejects.toThrow('Test error');

      // Second failure
      superExecuteMock.mockRejectedValueOnce(error);
      await expect(robustOmni.execute('script2')).rejects.toThrow('Test error');

      // Should not diagnose yet (only 2 failures)
      expect(superExecuteMock).toHaveBeenCalledTimes(2);
    });

    it('should diagnose connection after max consecutive failures', async () => {
      const error = new OmniAutomationError('Test error', 'script', 'stderr');

      // Mock diagnosis scripts
      const mockDiagnosis = [
        { name: 'app.name', version: 'app.version' }, // App test
        { hasDoc: true, name: 'Document' }, // Doc test
        { hasTasks: true, hasProjects: true, taskCount: 10, projectCount: 5 }, // Collection test
      ];

      // Fail 3 times to trigger diagnosis
      for (let i = 0; i < 3; i++) {
        superExecuteMock.mockRejectedValueOnce(error);
        
        if (i === 2) {
          // On third failure, mock diagnosis calls
          mockDiagnosis.forEach(result => {
            superExecuteMock.mockResolvedValueOnce(result);
          });
        }

        try {
          await robustOmni.execute(`script${i}`);
        } catch (e) {
          // Expected to fail
        }
      }

      // Check that diagnosis was run (3 failures + 3 diagnosis tests)
      expect(superExecuteMock).toHaveBeenCalledTimes(6);
    });

    it('should enhance undefined/null conversion errors', async () => {
      const error = new Error('Cannot convert undefined or null to object');
      superExecuteMock.mockRejectedValueOnce(error);

      await expect(robustOmni.execute('test script')).rejects.toThrow(
        'Cannot convert undefined or null to object - This often indicates OmniFocus has become unresponsive'
      );
    });

    it('should reset consecutive failures on success', async () => {
      const error = new OmniAutomationError('Test error', 'script', 'stderr');

      // Two failures
      superExecuteMock.mockRejectedValueOnce(error);
      await expect(robustOmni.execute('script1')).rejects.toThrow();

      superExecuteMock.mockRejectedValueOnce(error);
      await expect(robustOmni.execute('script2')).rejects.toThrow();

      // Then success
      superExecuteMock.mockResolvedValueOnce({ success: true });
      await robustOmni.execute('script3');

      // Another failure should not trigger diagnosis (counter was reset)
      superExecuteMock.mockRejectedValueOnce(error);
      await expect(robustOmni.execute('script4')).rejects.toThrow();

      // Should only have 4 execute calls, no diagnosis
      expect(superExecuteMock).toHaveBeenCalledTimes(4);
    });
  });

  describe('diagnosis', () => {
    it('should provide comprehensive diagnosis when all tests fail', async () => {
      const error = new OmniAutomationError('Test error', 'script', 'stderr');

      // Make all diagnosis tests fail
      for (let i = 0; i < 3; i++) {
        superExecuteMock.mockRejectedValueOnce(error);
      }

      // After 3rd failure, diagnosis runs and all tests fail
      superExecuteMock.mockRejectedValueOnce(new Error('App test failed'));
      superExecuteMock.mockRejectedValueOnce(new Error('Doc test failed'));
      superExecuteMock.mockRejectedValueOnce(new Error('Collection test failed'));

      // Trigger 3 failures
      let lastError: any;
      for (let i = 0; i < 3; i++) {
        try {
          await robustOmni.execute(`script${i}`);
        } catch (e) {
          lastError = e;
        }
      }

      // Verify the last error contains diagnosis summary
      expect(lastError.message).toContain('Script execution failed after 3 attempts');
      expect(lastError.message).toContain('OmniFocus appears to be completely unreachable');
    });

    it('should identify application issues in diagnosis', async () => {
      const error = new OmniAutomationError('Test error', 'script', 'stderr');

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        superExecuteMock.mockRejectedValueOnce(error);
      }

      // Mock diagnosis: app fails, others succeed
      superExecuteMock.mockRejectedValueOnce(new Error('App not found'));
      superExecuteMock.mockResolvedValueOnce({ hasDoc: true, name: 'Document' });
      superExecuteMock.mockResolvedValueOnce({ hasTasks: true, hasProjects: true });

      // Trigger failures
      let lastError: any;
      for (let i = 0; i < 3; i++) {
        try {
          await robustOmni.execute(`script${i}`);
        } catch (e) {
          lastError = e;
        }
      }

      expect(lastError.message).toContain('Cannot reach OmniFocus application');
    });

    it('should identify document issues in diagnosis', async () => {
      const error = new OmniAutomationError('Test error', 'script', 'stderr');

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        superExecuteMock.mockRejectedValueOnce(error);
      }

      // Mock diagnosis: app succeeds, doc fails, collection fails
      superExecuteMock.mockResolvedValueOnce({ name: 'OmniFocus', version: '3.0' });
      superExecuteMock.mockRejectedValueOnce(new Error('Document not found'));
      superExecuteMock.mockRejectedValueOnce(new Error('Collections not accessible'));

      // Trigger failures
      let lastError: any;
      for (let i = 0; i < 3; i++) {
        try {
          await robustOmni.execute(`script${i}`);
        } catch (e) {
          lastError = e;
        }
      }

      expect(lastError.message).toContain('Cannot access OmniFocus document');
    });

    it('should identify collection issues in diagnosis', async () => {
      const error = new OmniAutomationError('Test error', 'script', 'stderr');

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        superExecuteMock.mockRejectedValueOnce(error);
      }

      // Mock diagnosis: app and doc succeed, collections fail
      superExecuteMock.mockResolvedValueOnce({ name: 'OmniFocus', version: '3.0' });
      superExecuteMock.mockResolvedValueOnce({ hasDoc: true, name: 'Document' });
      superExecuteMock.mockRejectedValueOnce(new Error('Collections error'));

      // Trigger failures
      let lastError: any;
      for (let i = 0; i < 3; i++) {
        try {
          await robustOmni.execute(`script${i}`);
        } catch (e) {
          lastError = e;
        }
      }

      expect(lastError.message).toContain('Cannot access OmniFocus data collections');
    });

    it('should handle unexpected diagnosis results', async () => {
      const error = new OmniAutomationError('Test error', 'script', 'stderr');

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        superExecuteMock.mockRejectedValueOnce(error);
      }

      // Mock diagnosis: all succeed but still having issues
      superExecuteMock.mockResolvedValueOnce({ name: 'OmniFocus', version: '3.0' });
      superExecuteMock.mockResolvedValueOnce({ hasDoc: true, name: 'Document' });
      superExecuteMock.mockResolvedValueOnce({ hasTasks: true, hasProjects: true });

      // Trigger failures
      let lastError: any;
      for (let i = 0; i < 3; i++) {
        try {
          await robustOmni.execute(`script${i}`);
        } catch (e) {
          lastError = e;
        }
      }

      expect(lastError.message).toContain('Connection tests passed but script execution still failing');
    });
  });
});