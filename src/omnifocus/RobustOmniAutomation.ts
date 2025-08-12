import { OmniAutomation, OmniAutomationError } from './OmniAutomation.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('robust-omniautomation');

/**
 * Robust version of OmniAutomation that handles connection issues and retries
 */
export class RobustOmniAutomation extends OmniAutomation {
  private lastSuccessTime: number = Date.now();
  private consecutiveFailures: number = 0;
  private readonly maxConsecutiveFailures: number = 3;
  private readonly connectionTimeout: number = 5 * 60 * 1000; // 5 minutes

  async execute<T = unknown>(script: string): Promise<T> {
    // Check if we need to test the connection
    const timeSinceLastSuccess = Date.now() - this.lastSuccessTime;
    if (timeSinceLastSuccess > this.connectionTimeout) {
      logger.warn('Connection may be stale, testing connection first', {
        timeSinceLastSuccess,
        lastSuccessTime: new Date(this.lastSuccessTime).toISOString(),
      });

      // Test connection with a simple script
      const testResult = await this.testConnection();
      if (!testResult) {
        throw new OmniAutomationError(
          'Connection test failed - OmniFocus may be unresponsive',
          script,
          'Connection timeout after ' + Math.round(timeSinceLastSuccess / 1000) + ' seconds',
        );
      }
    }

    try {
      // Try to execute the script
      const result = await super.execute<T>(script);

      // Success - reset failure counter
      this.consecutiveFailures = 0;
      this.lastSuccessTime = Date.now();

      return result;
    } catch (error: unknown) {
      this.consecutiveFailures++;

      // Log detailed error information
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = error instanceof Error ? error.constructor.name : 'Unknown';

      logger.error('Script execution failed', {
        consecutiveFailures: this.consecutiveFailures,
        timeSinceLastSuccess: Date.now() - this.lastSuccessTime,
        errorMessage: errorMessage,
        errorType: errorType,
      });

      // If we've had too many consecutive failures, try to diagnose
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        const diagnosis = await this.diagnoseConnection();
        logger.error('Connection diagnosis after repeated failures', diagnosis);

        throw new OmniAutomationError(
          `Script execution failed after ${this.consecutiveFailures} attempts. ${diagnosis.summary}`,
          script,
          JSON.stringify(diagnosis),
        );
      }

      // For "Cannot convert undefined or null to object" errors, add more context
      if (error instanceof Error && error.message.includes('Cannot convert undefined or null to object')) {
        const enhancedError = new OmniAutomationError(
          `${error.message} - This often indicates OmniFocus has become unresponsive or the document is no longer available`,
          script,
          (error as any).stderr || error.message,
        );
        throw enhancedError;
      }

      throw error;
    }
  }

  private async testConnection(): Promise<boolean> {
    const testScript = `
      return JSON.stringify({
        success: true,
        appAvailable: typeof app !== 'undefined',
        docAvailable: typeof document !== 'undefined'
      });
    `;

    try {
      const result = await super.execute<{success: boolean; appAvailable: boolean; docAvailable: boolean}>(testScript);
      return result && result.success && result.docAvailable;
    } catch (error) {
      logger.error('Connection test failed', { error });
      return false;
    }
  }

  private async diagnoseConnection(): Promise<{ tests: Record<string, { success: boolean; error?: string; result?: unknown }>; summary: string }> {
    interface DiagnosisTests {
      [key: string]: { success: boolean; error?: string; result?: unknown };
    }

    const diagnosis: { tests: DiagnosisTests; summary: string } = {
      tests: {},
      summary: '',
    };

    // Test 1: Can we reach the application?
    try {
      const appTest = await super.execute<unknown>(`
        return JSON.stringify({
          name: app.name,
          version: app.version
        });
      `);
      diagnosis.tests.application = {
        success: true,
        result: appTest,
      };
    } catch (error: unknown) {
      diagnosis.tests.application = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Test 2: Can we access the document?
    try {
      const docTest = await super.execute<unknown>(`
        const doc = document;
        return JSON.stringify({
          hasDoc: doc !== null && doc !== undefined,
          name: doc ? doc.name : null
        });
      `);
      diagnosis.tests.document = {
        success: true,
        result: docTest,
      };
    } catch (error: unknown) {
      diagnosis.tests.document = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Test 3: Can we access basic collections?
    try {
      const collectionTest = await super.execute<unknown>(`
        const doc = document;
        const flattenedTasks = doc.flattenedTasks;
        const flattenedProjects = doc.flattenedProjects;
        return JSON.stringify({
          hasTasks: flattenedTasks !== null && flattenedTasks !== undefined,
          hasProjects: flattenedProjects !== null && flattenedProjects !== undefined,
          taskCount: flattenedTasks ? flattenedTasks.length : 0,
          projectCount: flattenedProjects ? flattenedProjects.length : 0
        });
      `);
      diagnosis.tests.collection = {
        success: true,
        result: collectionTest,
      };
    } catch (error: unknown) {
      diagnosis.tests.collection = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Generate summary
    const allTestsFailed = Object.values(diagnosis.tests).every((test) => !test.success);

    if (allTestsFailed) {
      diagnosis.summary = 'OmniFocus appears to be completely unreachable. Please ensure it is running and try again.';
    } else if (!diagnosis.tests.application?.success) {
      diagnosis.summary = 'Cannot reach OmniFocus application. Please ensure it is running.';
    } else if (!diagnosis.tests.document?.success) {
      diagnosis.summary = 'Cannot access OmniFocus document. Please ensure a document is open.';
    } else if (!diagnosis.tests.collection?.success) {
      diagnosis.summary = 'Cannot access OmniFocus data collections. The document may be corrupted or locked.';
    } else {
      diagnosis.summary = 'Connection tests passed but script execution still failing.';
    }

    return diagnosis;
  }
}
